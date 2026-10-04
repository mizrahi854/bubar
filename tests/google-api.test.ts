import { describe, expect, it } from "vitest";
import * as h from "../api/_lib/handlers";
import { signState, verifyState, type Env, type SyncAppointment } from "../api/_lib/google";
import type { Connection, Store } from "../api/_lib/store";

const env: Env = { APP_URL: "https://beautigo.example", GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "secret", OAUTH_STATE_SECRET: "state-secret", CRON_SECRET: "cron" };
const NOW = Date.parse("2026-10-04T08:00:00Z");

function memoryStore() {
  const s = {
    users: { "tok-owner": "owner", "tok-staff": "staff", "tok-customer": "cust" } as Record<string, string>,
    owners: new Set(["owner:b1"]),
    connections: {} as Record<string, Connection & Record<string, unknown>>,
    appointments: [
      { id: "a1", starts_at: "2026-10-06T07:00:00Z", ends_at: "2026-10-06T08:00:00Z", status: "confirmed", service_name: "תספורת", customer_name: "אלונה לביא", customer_phone: "0502222222", professional_name: "דניאל", note: "", google_event_id: null },
      { id: "a2", starts_at: "2026-10-07T07:00:00Z", ends_at: "2026-10-07T08:00:00Z", status: "cancelled", service_name: "צבע", customer_name: "שיר בר", customer_phone: "", professional_name: "נועה", note: "", google_event_id: "ev-old" },
    ] as SyncAppointment[],
    blocks: [] as { start: string; end: string; title: string }[],
    log: [] as string[],
  };
  const store: Store = {
    async userFromToken(t) {
      return s.users[t] ?? null;
    },
    async isOwner(u, b) {
      return s.owners.has(`${u}:${b}`);
    },
    async canSyncAppointment(u, id) {
      return (u === "owner" || u === "cust") && s.appointments.some((a) => a.id === id) ? "b1" : null;
    },
    async business(id) {
      return id === "b1" ? { id, name: "סטודיו א", timezone: "Asia/Jerusalem" } : null;
    },
    async connection(b) {
      return s.connections[b] ?? null;
    },
    async saveConnection(b, patch) {
      s.connections[b] = { business_id: b, google_email: null, calendar_id: "primary", calendar_name: null, professional_id: null, refresh_token: null, access_token: null, access_expires_at: null, status: "connected", ...s.connections[b], ...patch } as Connection & Record<string, unknown>;
    },
    async deleteConnection(b) {
      delete s.connections[b];
    },
    async connectedBusinesses() {
      return Object.values(s.connections).filter((c) => c.status === "connected").map((c) => c.business_id);
    },
    async appointmentsToSync() {
      return s.appointments.map((a) => ({ ...a }));
    },
    async appointment(id) {
      return s.appointments.find((a) => a.id === id) ?? null;
    },
    async setEventId(id, ev) {
      s.appointments.find((a) => a.id === id)!.google_event_id = ev;
    },
    async replaceGoogleBlocks(_b, _p, _f, _t, blocks) {
      s.blocks = blocks;
    },
    async logIntegration(_b, title, body) {
      s.log.push(`${title}: ${body}`);
    },
  };
  return { s, store };
}

/** Minimal fake of Google's OAuth + Calendar endpoints. */
function fakeGoogle(opts: { revoked?: boolean } = {}) {
  const calls: { method: string; url: string; body?: string }[] = [];
  const events = new Map<string, Record<string, unknown>>([["ev-old", { id: "ev-old" }]]);
  let n = 0;
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: init?.body ? String(init.body) : undefined });
    const ok = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json" } });
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      const p = new URLSearchParams(String(init?.body));
      if (p.get("grant_type") === "refresh_token") return opts.revoked ? ok({ error: "invalid_grant" }, 400) : ok({ access_token: "at-2", expires_in: 3600 });
      const idToken = `x.${Buffer.from(JSON.stringify({ email: "studio@gmail.com" })).toString("base64url")}.y`;
      return ok({ access_token: "at-1", refresh_token: "rt-1", expires_in: 3600, id_token: idToken });
    }
    if (url.startsWith("https://oauth2.googleapis.com/revoke")) return new Response(null, { status: 200 });
    if (url.includes("/calendarList")) return ok({ items: [{ id: "primary", summary: "studio@gmail.com", primary: true, accessRole: "owner" }, { id: "work", summary: "תורים", accessRole: "writer" }] });
    const m = url.match(/\/calendars\/([^/]+)\/events(?:\/([^?]+))?(\?.*)?$/);
    if (m) {
      if (method === "POST") {
        const id = `ev-${++n}`;
        events.set(id, JSON.parse(String(init?.body)));
        return ok({ id });
      }
      if (method === "DELETE") return events.delete(decodeURIComponent(m[2])) ? new Response(null, { status: 204 }) : new Response(null, { status: 410 });
      if (method === "GET")
        return ok({
          items: [
            { id: "g1", status: "confirmed", summary: "רופא שיניים", start: { dateTime: "2026-10-05T09:00:00+03:00" }, end: { dateTime: "2026-10-05T10:00:00+03:00" } },
            { id: "g2", status: "confirmed", summary: "חופש", start: { date: "2026-10-08" }, end: { date: "2026-10-09" } },
            { id: "g3", status: "confirmed", summary: "תזכורת", transparency: "transparent", start: { dateTime: "2026-10-05T12:00:00+03:00" }, end: { dateTime: "2026-10-05T12:30:00+03:00" } },
            { id: "ev-9", status: "confirmed", summary: "שלנו", extendedProperties: { private: { beautigoAppointmentId: "a9" } }, start: { dateTime: "2026-10-05T13:00:00+03:00" }, end: { dateTime: "2026-10-05T14:00:00+03:00" } },
          ],
        });
    }
    throw new Error(`unexpected ${method} ${url}`);
  }) as typeof fetch;
  return { f, calls, events };
}

const req = (url: string, init: { method?: string; token?: string; body?: unknown } = {}) =>
  new Request(url, { method: init.method ?? "GET", headers: { ...(init.token ? { authorization: `Bearer ${init.token}` } : {}), "content-type": "application/json" }, body: init.body ? JSON.stringify(init.body) : undefined });

describe("OAuth state", () => {
  it("round-trips, rejects tampering and expiry", () => {
    const s = signState(env, { b: "b1", u: "owner" }, NOW);
    expect(verifyState(env, s, NOW)).toEqual({ b: "b1", u: "owner" });
    expect(verifyState(env, s.replace(/.$/, (c) => (c === "A" ? "B" : "A")), NOW)).toBeNull();
    expect(verifyState(env, s, NOW + 11 * 60_000)).toBeNull();
    expect(verifyState({ ...env, OAUTH_STATE_SECRET: "other" }, s, NOW)).toBeNull();
  });
});

describe("Google Calendar endpoints", () => {
  it("only the owner can start the connection, and the callback stores tokens", async () => {
    const { s, store } = memoryStore();
    const g = fakeGoogle();
    const d = { env, store, fetch: g.f, now: () => NOW };
    expect((await h.connect(d, req("https://x/api/google/connect", { method: "POST", token: "tok-staff", body: { businessId: "b1" } }))).status).toBe(403);
    expect((await h.connect(d, req("https://x/api/google/connect", { method: "POST", body: { businessId: "b1" } }))).status).toBe(401);
    const r = await h.connect(d, req("https://x/api/google/connect", { method: "POST", token: "tok-owner", body: { businessId: "b1" } }));
    const { url } = await r.json();
    const auth = new URL(url);
    expect(auth.searchParams.get("access_type")).toBe("offline");
    expect(auth.searchParams.get("redirect_uri")).toBe("https://beautigo.example/api/google/callback");
    expect(auth.searchParams.get("scope")).toContain("calendar.events");

    const cb = await h.callback(d, req(`https://x/api/google/callback?code=abc&state=${encodeURIComponent(auth.searchParams.get("state")!)}`));
    expect(cb.status).toBe(302);
    expect(cb.headers.get("location")).toBe("https://beautigo.example/#/biz/settings?google=connected");
    expect(s.connections.b1).toMatchObject({ refresh_token: "rt-1", access_token: "at-1", google_email: "studio@gmail.com", status: "connected" });

    const bad = await h.callback(d, req("https://x/api/google/callback?code=abc&state=forged.sig"));
    expect(bad.headers.get("location")).toContain("google=invalid");
  });

  it("sync pushes active appointments, deletes cancelled ones and imports busy time", async () => {
    const { s, store } = memoryStore();
    const g = fakeGoogle();
    const d = { env, store, fetch: g.f, now: () => NOW };
    await store.saveConnection("b1", { refresh_token: "rt-1", access_token: "at-1", access_expires_at: new Date(NOW + 3600_000).toISOString(), calendar_id: "work", professional_id: "p1" });
    const r = await h.sync(d, req("https://x/api/google/sync", { method: "POST", token: "tok-owner", body: { businessId: "b1" } }));
    const j = await r.json();
    expect(j).toMatchObject({ pushed: 2, failed: 0, imported: 2 });
    expect(s.appointments[0].google_event_id).toBe("ev-1");
    expect(s.appointments[1].google_event_id).toBeNull();
    expect(g.events.has("ev-old")).toBe(false);
    const created = g.events.get("ev-1") as { summary: string; start: { timeZone: string }; extendedProperties: { private: Record<string, string> } };
    expect(created.summary).toBe("תספורת · אלונה לביא");
    expect(created.start.timeZone).toBe("Asia/Jerusalem");
    expect(created.extendedProperties.private.beautigoAppointmentId).toBe("a1");
    // own events and "free" events are not imported; all-day uses local midnight
    expect(s.blocks.map((b) => b.title)).toEqual(["רופא שיניים", "חופש"]);
    expect(s.blocks[1].start).toBe("2026-10-07T21:00:00.000Z");
    expect(s.connections.b1.last_sync_at).toBeTruthy();
  });

  it("refreshes an expired token and marks the connection on invalid_grant", async () => {
    const ok = memoryStore();
    await ok.store.saveConnection("b1", { refresh_token: "rt-1", access_token: "old", access_expires_at: new Date(NOW - 1000).toISOString() });
    await h.syncBusiness({ env, store: ok.store, fetch: fakeGoogle().f, now: () => NOW }, "b1");
    expect(ok.s.connections.b1.access_token).toBe("at-2");

    const bad = memoryStore();
    await bad.store.saveConnection("b1", { refresh_token: "rt-1", access_token: "old", access_expires_at: new Date(NOW - 1000).toISOString() });
    const r = await h.sync({ env, store: bad.store, fetch: fakeGoogle({ revoked: true }).f, now: () => NOW }, req("https://x/api/google/sync", { method: "POST", token: "tok-owner", body: { businessId: "b1" } }));
    expect(r.status).toBe(502);
    expect(bad.s.connections.b1.status).toBe("error");
    expect(String(bad.s.connections.b1.last_error)).toContain("לחבר מחדש");
    expect(bad.s.log.at(-1)).toContain("Google Calendar");
  });

  it("push is allowed to the appointment's customer and skipped when not connected", async () => {
    const { store } = memoryStore();
    const g = fakeGoogle();
    const d = { env, store, fetch: g.f, now: () => NOW };
    const skipped = await h.push(d, req("https://x/api/google/push", { method: "POST", token: "tok-customer", body: { appointmentId: "a1" } }));
    expect(await skipped.json()).toEqual({ skipped: true });
    await store.saveConnection("b1", { refresh_token: "rt-1", access_token: "at-1", access_expires_at: new Date(NOW + 3600_000).toISOString() });
    const r = await h.push(d, req("https://x/api/google/push", { method: "POST", token: "tok-customer", body: { appointmentId: "a1" } }));
    expect(await r.json()).toEqual({ eventId: "ev-1" });
    expect((await h.push(d, req("https://x/api/google/push", { method: "POST", token: "tok-staff", body: { appointmentId: "a1" } }))).status).toBe(403);
  });

  it("calendars list, disconnect revokes, cron requires its secret", async () => {
    const { s, store } = memoryStore();
    const g = fakeGoogle();
    const d = { env, store, fetch: g.f, now: () => NOW };
    await store.saveConnection("b1", { refresh_token: "rt-1", access_token: "at-1", access_expires_at: new Date(NOW + 3600_000).toISOString() });
    const cal = await (await h.calendars(d, req("https://x/api/google/calendars?businessId=b1", { token: "tok-owner" }))).json();
    expect(cal.calendars.map((c: { id: string }) => c.id)).toEqual(["primary", "work"]);
    expect((await h.cron(d, req("https://x/api/google/cron"))).status).toBe(401);
    const c = await h.cron(d, new Request("https://x/api/google/cron", { headers: { authorization: "Bearer cron" } }));
    expect(Object.keys(await c.json())).toEqual(["b1"]);
    await h.disconnect(d, req("https://x/api/google/disconnect", { method: "POST", token: "tok-owner", body: { businessId: "b1" } }));
    expect(s.connections.b1).toBeUndefined();
    expect(g.calls.some((x) => x.url.includes("/revoke"))).toBe(true);
  });
});
