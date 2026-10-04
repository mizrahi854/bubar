/**
 * Google Calendar endpoints as plain Request → Response functions, so they are
 * testable without a server. Each /api/google/*.ts file wires one of these with
 * the real environment and Supabase store.
 */
import * as g from "./google.js";
import type { Store } from "./store.js";

export interface Deps {
  env: g.Env;
  store: Store;
  fetch: typeof fetch;
  now?: () => number;
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const SYNC_DAYS_BACK = 1;
const SYNC_DAYS_AHEAD = 60;

async function requireUser(d: Deps, req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  return d.store.userFromToken(token);
}

async function body<T>(req: Request): Promise<Partial<T>> {
  try {
    return (await req.json()) as Partial<T>;
  } catch {
    return {};
  }
}

/** Returns a fresh access token, refreshing and persisting it when needed. Marks the connection as failed on auth errors. */
export async function accessToken(d: Deps, businessId: string) {
  const c = await d.store.connection(businessId);
  if (!c?.refresh_token) throw new g.GoogleAuthError("Google Calendar לא מחובר");
  const now = d.now?.() ?? Date.now();
  if (c.access_token && c.access_expires_at && Date.parse(c.access_expires_at) - now > 60_000) return { token: c.access_token, connection: c };
  try {
    const t = await g.refreshAccessToken(d.env, c.refresh_token, d.fetch);
    await d.store.saveConnection(businessId, { access_token: t.accessToken, access_expires_at: t.expiresAt, status: "connected" });
    return { token: t.accessToken, connection: c };
  } catch (e) {
    if (e instanceof g.GoogleAuthError) {
      await d.store.saveConnection(businessId, { status: "error", last_error: e.message });
      await d.store.logIntegration(businessId, "Google Calendar", e.message);
    }
    throw e;
  }
}

/** POST {businessId} → {url}: the owner starts the OAuth flow. */
export async function connect(d: Deps, req: Request) {
  const user = await requireUser(d, req);
  if (!user) return json(401, { error: "יש להתחבר" });
  const { businessId } = await body<{ businessId: string }>(req);
  if (!businessId || !(await d.store.isOwner(user, businessId))) return json(403, { error: "רק בעל/ת העסק יכול/ה לחבר יומן" });
  return json(200, { url: g.authUrl(d.env, g.signState(d.env, { b: businessId, u: user }, d.now?.())) });
}

/** GET ?code&state from Google → stores tokens and returns to the settings screen. */
export async function callback(d: Deps, req: Request) {
  const url = new URL(req.url);
  const back = (status: string) => Response.redirect(`${d.env.APP_URL.replace(/\/$/, "")}/#/biz/settings?google=${status}`, 302);
  if (url.searchParams.get("error")) return back("denied");
  const state = g.verifyState(d.env, url.searchParams.get("state") ?? "", d.now?.());
  const code = url.searchParams.get("code");
  if (!state || !code) return back("invalid");
  if (!(await d.store.isOwner(state.u, state.b))) return back("forbidden");
  try {
    const t = await g.exchangeCode(d.env, code, d.fetch);
    const prev = await d.store.connection(state.b);
    const refresh = t.refreshToken ?? prev?.refresh_token;
    if (!refresh) return back("no_refresh_token");
    await d.store.saveConnection(state.b, {
      google_email: t.email ?? null,
      refresh_token: refresh,
      access_token: t.accessToken,
      access_expires_at: t.expiresAt,
      calendar_id: prev?.calendar_id ?? "primary",
      calendar_name: prev?.calendar_name ?? "היומן הראשי",
      status: "connected",
      last_error: null,
    });
    await d.store.logIntegration(state.b, "Google Calendar", `היומן חובר${t.email ? ` (${t.email})` : ""}`);
    return back("connected");
  } catch {
    return back("error");
  }
}

async function ownerOnly(d: Deps, req: Request, businessId?: string) {
  const user = await requireUser(d, req);
  if (!user) return json(401, { error: "יש להתחבר" });
  if (!businessId || !(await d.store.isOwner(user, businessId))) return json(403, { error: "אין הרשאה" });
  return null;
}

/** GET ?businessId → writable calendars of the connected account. */
export async function calendars(d: Deps, req: Request) {
  const businessId = new URL(req.url).searchParams.get("businessId") ?? undefined;
  const denied = await ownerOnly(d, req, businessId);
  if (denied) return denied;
  try {
    const { token } = await accessToken(d, businessId!);
    return json(200, { calendars: await g.listCalendars(token, d.fetch) });
  } catch (e) {
    return json(502, { error: (e as Error).message });
  }
}

/** POST {businessId, calendarId, calendarName, professionalId} → choose target calendar and busy-time column. */
export async function selectCalendar(d: Deps, req: Request) {
  const b = await body<{ businessId: string; calendarId: string; calendarName: string; professionalId: string | null }>(req);
  const denied = await ownerOnly(d, req, b.businessId);
  if (denied) return denied;
  if (!b.calendarId) return json(400, { error: "בחרו יומן" });
  await d.store.saveConnection(b.businessId!, { calendar_id: b.calendarId, calendar_name: b.calendarName ?? b.calendarId, professional_id: b.professionalId ?? null });
  return syncBusiness(d, b.businessId!).then((r) => json(200, r)).catch((e) => json(502, { error: (e as Error).message }));
}

/** Full two-way pass for one business: push appointments, pull busy times. */
export async function syncBusiness(d: Deps, businessId: string) {
  const now = d.now?.() ?? Date.now();
  const biz = await d.store.business(businessId);
  if (!biz) throw new Error("העסק לא נמצא");
  const { token, connection } = await accessToken(d, businessId);
  const from = new Date(now - SYNC_DAYS_BACK * 86_400_000).toISOString();
  const to = new Date(now + SYNC_DAYS_AHEAD * 86_400_000).toISOString();
  let pushed = 0;
  let failed = 0;
  for (const a of await d.store.appointmentsToSync(businessId, from, to)) {
    try {
      const id = await g.pushAppointment(token, connection.calendar_id, a, biz.timezone, biz.name, d.fetch);
      if (id !== a.google_event_id) await d.store.setEventId(a.id, id);
      pushed++;
    } catch (e) {
      if (e instanceof g.GoogleAuthError) throw e;
      failed++;
    }
  }
  let imported = 0;
  if (connection.professional_id) {
    const busy = await g.busyEvents(token, connection.calendar_id, new Date(now).toISOString(), to, biz.timezone, d.fetch);
    await d.store.replaceGoogleBlocks(businessId, connection.professional_id, new Date(now).toISOString(), to, busy);
    imported = busy.length;
  }
  const at = new Date(now).toISOString();
  await d.store.saveConnection(businessId, { last_sync_at: at, status: "connected", last_error: failed ? `${failed} תורים לא סונכרנו — ננסה שוב בסנכרון הבא` : null });
  return { pushed, failed, imported, syncedAt: at };
}

/** POST {businessId} → sync now. */
export async function sync(d: Deps, req: Request) {
  const b = await body<{ businessId: string }>(req);
  const denied = await ownerOnly(d, req, b.businessId);
  if (denied) return denied;
  try {
    return json(200, await syncBusiness(d, b.businessId!));
  } catch (e) {
    return json(502, { error: (e as Error).message });
  }
}

/** POST {appointmentId} → push one appointment after it changed (by staff or by its customer). */
export async function push(d: Deps, req: Request) {
  const user = await requireUser(d, req);
  if (!user) return json(401, { error: "יש להתחבר" });
  const { appointmentId } = await body<{ appointmentId: string }>(req);
  if (!appointmentId) return json(400, { error: "חסר מזהה תור" });
  const businessId = await d.store.canSyncAppointment(user, appointmentId);
  if (!businessId) return json(403, { error: "אין הרשאה" });
  const c = await d.store.connection(businessId);
  if (!c || c.status !== "connected") return json(200, { skipped: true });
  try {
    const biz = (await d.store.business(businessId))!;
    const a = (await d.store.appointment(appointmentId))!;
    const { token } = await accessToken(d, businessId);
    const id = await g.pushAppointment(token, c.calendar_id, a, biz.timezone, biz.name, d.fetch);
    if (id !== a.google_event_id) await d.store.setEventId(a.id, id);
    return json(200, { eventId: id });
  } catch (e) {
    return json(502, { error: (e as Error).message });
  }
}

/** POST {businessId} → revoke access and forget tokens. Appointments in Beautigo are untouched. */
export async function disconnect(d: Deps, req: Request) {
  const b = await body<{ businessId: string }>(req);
  const denied = await ownerOnly(d, req, b.businessId);
  if (denied) return denied;
  const c = await d.store.connection(b.businessId!);
  if (c?.refresh_token) await g.revoke(c.refresh_token, d.fetch);
  await d.store.deleteConnection(b.businessId!);
  await d.store.logIntegration(b.businessId!, "Google Calendar", "היומן נותק");
  return json(200, { ok: true });
}

/** GET with Authorization: Bearer CRON_SECRET → periodic sync of every connected business. */
export async function cron(d: Deps, req: Request) {
  if (!d.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${d.env.CRON_SECRET}`) return json(401, { error: "unauthorized" });
  const results: Record<string, unknown> = {};
  for (const b of await d.store.connectedBusinesses()) {
    try {
      results[b] = await syncBusiness(d, b);
    } catch (e) {
      results[b] = { error: (e as Error).message };
    }
  }
  return json(200, results);
}
