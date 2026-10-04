/**
 * Google Calendar integration (server only). Uses plain REST calls:
 * OAuth 2.0 authorization code flow with offline access, token refresh,
 * event upsert/delete for appointments, and import of busy events as blocked time.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { DateTime } from "luxon";

export const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export interface Env {
  APP_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  OAUTH_STATE_SECRET: string;
  CRON_SECRET?: string;
}

export const redirectUri = (env: Env) => `${env.APP_URL.replace(/\/$/, "")}/api/google/callback`;

/* ---------------- Signed OAuth state (prevents CSRF and binds the business) ---------------- */

const b64 = (s: Buffer | string) => Buffer.from(s).toString("base64url");

export function signState(env: Env, payload: { b: string; u: string }, now = Date.now()) {
  const body = b64(JSON.stringify({ ...payload, exp: now + 10 * 60_000, n: randomBytes(8).toString("hex") }));
  const sig = b64(createHmac("sha256", env.OAUTH_STATE_SECRET).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyState(env: Env, state: string, now = Date.now()): { b: string; u: string } | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", env.OAUTH_STATE_SECRET).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof p.exp !== "number" || p.exp < now) return null;
    return { b: p.b, u: p.u };
  } catch {
    return null;
  }
}

export function authUrl(env: Env, state: string) {
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(env),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/* ---------------- Token handling ---------------- */

export class GoogleAuthError extends Error {}

export async function exchangeCode(env: Env, code: string, f = fetch) {
  const r = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(env), grant_type: "authorization_code" }),
  });
  const j = (await r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error?: string };
  if (!r.ok || !j.access_token) throw new GoogleAuthError(j.error ?? `token exchange failed (${r.status})`);
  let email: string | undefined;
  if (j.id_token) {
    try {
      email = JSON.parse(Buffer.from(j.id_token.split(".")[1], "base64url").toString()).email;
    } catch {
      /* email is optional */
    }
  }
  return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString(), email };
}

export async function refreshAccessToken(env: Env, refreshToken: string, f = fetch) {
  const r = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: "refresh_token" }),
  });
  const j = (await r.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !j.access_token) {
    // invalid_grant = the user revoked access or the token expired: a reconnect is required
    throw new GoogleAuthError(j.error === "invalid_grant" ? "ההרשאה ל־Google בוטלה או פגה — יש לחבר מחדש" : `רענון ההרשאה נכשל (${j.error ?? r.status})`);
  }
  return { accessToken: j.access_token, expiresAt: new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString() };
}

export async function revoke(token: string, f = fetch) {
  await f(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
}

/* ---------------- Calendar REST ---------------- */

const API = "https://www.googleapis.com/calendar/v3";

async function call<T>(f: typeof fetch, token: string, url: string, init: RequestInit = {}, attempt = 0): Promise<T | null> {
  const r = await f(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" } });
  if ((r.status === 429 || r.status >= 500) && attempt < 2) {
    await new Promise((res) => setTimeout(res, 300 * 2 ** attempt));
    return call(f, token, url, init, attempt + 1);
  }
  if (r.status === 404 || r.status === 410) return null;
  if (r.status === 204) return null;
  if (r.status === 401) throw new GoogleAuthError("ההרשאה ל־Google לא תקפה — יש לחבר מחדש");
  if (!r.ok) throw new Error(`Google Calendar ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()) as T;
}

export async function listCalendars(token: string, f = fetch) {
  const j = await call<{ items: { id: string; summary: string; primary?: boolean; accessRole: string }[] }>(f, token, `${API}/users/me/calendarList?minAccessRole=writer`);
  return (j?.items ?? []).map((c) => ({ id: c.id, name: c.summary, primary: !!c.primary }));
}

export interface SyncAppointment {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  service_name: string;
  customer_name: string;
  customer_phone: string;
  professional_name: string;
  note: string;
  google_event_id: string | null;
}

export function eventBody(a: SyncAppointment, timeZone: string, businessName: string) {
  return {
    summary: `${a.service_name} · ${a.customer_name}${a.status === "pending" ? " (ממתין לאישור)" : ""}`,
    description: [`לקוח/ה: ${a.customer_name}`, a.customer_phone && `טלפון: ${a.customer_phone}`, `אצל: ${a.professional_name}`, a.note && `הערה: ${a.note}`, `נוצר ב־Beautigo · ${businessName}`].filter(Boolean).join("\n"),
    start: { dateTime: a.starts_at, timeZone },
    end: { dateTime: a.ends_at, timeZone },
    extendedProperties: { private: { beautigoAppointmentId: a.id } },
    reminders: { useDefault: true },
  };
}

/** Creates, updates or deletes the event for one appointment. Returns the event id to store (or null). */
export async function pushAppointment(token: string, calendarId: string, a: SyncAppointment, timeZone: string, businessName: string, f = fetch): Promise<string | null> {
  const base = `${API}/calendars/${encodeURIComponent(calendarId)}/events`;
  const active = a.status === "pending" || a.status === "confirmed";
  if (!active) {
    if (a.google_event_id) await call(f, token, `${base}/${encodeURIComponent(a.google_event_id)}`, { method: "DELETE" });
    return null;
  }
  const body = JSON.stringify(eventBody(a, timeZone, businessName));
  if (a.google_event_id) {
    const updated = await call<{ id: string }>(f, token, `${base}/${encodeURIComponent(a.google_event_id)}`, { method: "PATCH", body });
    if (updated) return updated.id;
    // event was deleted in Google → recreate it
  }
  const created = await call<{ id: string }>(f, token, base, { method: "POST", body });
  return created?.id ?? null;
}

/** Busy events in Google (excluding the ones Beautigo created) → blocked time. */
export async function busyEvents(token: string, calendarId: string, timeMin: string, timeMax: string, timeZone: string, f = fetch) {
  const out: { id: string; start: string; end: string; title: string }[] = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250", ...(pageToken ? { pageToken } : {}) });
    const j = await call<{
      items: { id: string; status: string; transparency?: string; summary?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }; extendedProperties?: { private?: Record<string, string> } }[];
      nextPageToken?: string;
    }>(f, token, `${API}/calendars/${encodeURIComponent(calendarId)}/events?${q}`);
    for (const e of j?.items ?? []) {
      if (e.status === "cancelled" || e.transparency === "transparent") continue;
      if (e.extendedProperties?.private?.beautigoAppointmentId) continue;
      // All-day events cover whole local days in the business's timezone
      const start = e.start.dateTime ?? (e.start.date ? DateTime.fromISO(e.start.date, { zone: timeZone }).toUTC().toISO() : null);
      const end = e.end.dateTime ?? (e.end.date ? DateTime.fromISO(e.end.date, { zone: timeZone }).toUTC().toISO() : null);
      if (start && end) out.push({ id: e.id, start, end, title: e.summary ?? "תפוס ביומן Google" });
    }
    pageToken = j?.nextPageToken;
  } while (pageToken);
  return out;
}
