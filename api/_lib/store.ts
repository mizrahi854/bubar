/** Server-side data access with the Supabase service role key. Never import this from the browser bundle. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SyncAppointment } from "./google.js";

export interface Connection {
  business_id: string;
  google_email: string | null;
  calendar_id: string;
  calendar_name: string | null;
  professional_id: string | null;
  refresh_token: string | null;
  access_token: string | null;
  access_expires_at: string | null;
  status: "connected" | "error";
}

export interface Store {
  userFromToken(token: string): Promise<string | null>;
  isOwner(userId: string, businessId: string): Promise<boolean>;
  canSyncAppointment(userId: string, appointmentId: string): Promise<string | null>; // returns business id
  business(businessId: string): Promise<{ id: string; name: string; timezone: string } | null>;
  connection(businessId: string): Promise<Connection | null>;
  saveConnection(businessId: string, patch: Partial<Connection> & { last_sync_at?: string; last_error?: string | null }): Promise<void>;
  deleteConnection(businessId: string): Promise<void>;
  connectedBusinesses(): Promise<string[]>;
  appointmentsToSync(businessId: string, fromISO: string, toISO: string): Promise<SyncAppointment[]>;
  appointment(appointmentId: string): Promise<SyncAppointment | null>;
  setEventId(appointmentId: string, eventId: string | null): Promise<void>;
  replaceGoogleBlocks(businessId: string, professionalId: string, fromISO: string, toISO: string, blocks: { id: string; start: string; end: string; title: string }[]): Promise<void>;
  logIntegration(businessId: string, title: string, body: string): Promise<void>;
}

type Row = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  service_name: string;
  note: string;
  google_event_id: string | null;
  customers: { full_name: string; phone: string } | null;
  professionals: { name: string } | null;
};

const SELECT = "id, starts_at, ends_at, status, service_name, note, google_event_id, customers(full_name, phone), professionals(name)";
const toSync = (r: Row): SyncAppointment => ({
  id: r.id,
  starts_at: r.starts_at,
  ends_at: r.ends_at,
  status: r.status,
  service_name: r.service_name,
  note: r.note,
  google_event_id: r.google_event_id,
  customer_name: r.customers?.full_name ?? "לקוח/ה",
  customer_phone: r.customers?.phone ?? "",
  professional_name: r.professionals?.name ?? "",
});

export function supabaseStore(url = process.env.SUPABASE_URL!, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!): Store {
  if (!url || !serviceKey) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured");
  const db: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const must = <T>(r: { data: T; error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  };
  return {
    async userFromToken(token) {
      const { data } = await db.auth.getUser(token);
      return data.user?.id ?? null;
    },
    async isOwner(userId, businessId) {
      const rows = must(await db.from("business_members").select("role").eq("business_id", businessId).eq("user_id", userId).eq("role", "owner"));
      return (rows ?? []).length > 0;
    },
    async canSyncAppointment(userId, appointmentId) {
      const a = must(await db.from("appointments").select("business_id, professional_id, customers(user_id)").eq("id", appointmentId).maybeSingle()) as
        | { business_id: string; professional_id: string; customers: { user_id: string | null } | null }
        | null;
      if (!a) return null;
      if (a.customers?.user_id === userId) return a.business_id;
      const m = must(await db.from("business_members").select("role, professional_id").eq("business_id", a.business_id).eq("user_id", userId).maybeSingle()) as
        | { role: string; professional_id: string | null }
        | null;
      return m && (m.role === "owner" || m.professional_id === a.professional_id) ? a.business_id : null;
    },
    async business(businessId) {
      return must(await db.from("businesses").select("id, name, timezone").eq("id", businessId).maybeSingle());
    },
    async connection(businessId) {
      return must(await db.from("google_connections").select("*").eq("business_id", businessId).maybeSingle()) as Connection | null;
    },
    async saveConnection(businessId, patch) {
      must(await db.from("google_connections").upsert({ business_id: businessId, ...patch, updated_at: new Date().toISOString() }));
    },
    async deleteConnection(businessId) {
      must(await db.from("google_connections").delete().eq("business_id", businessId));
      must(await db.from("blocked_times").delete().eq("business_id", businessId).eq("source", "google"));
    },
    async connectedBusinesses() {
      const rows = must(await db.from("google_connections").select("business_id").eq("status", "connected"));
      return (rows ?? []).map((r: { business_id: string }) => r.business_id);
    },
    async appointmentsToSync(businessId, fromISO, toISO) {
      const rows = must(
        await db.from("appointments").select(SELECT).eq("business_id", businessId).gte("starts_at", fromISO).lte("starts_at", toISO).or("status.in.(pending,confirmed),google_event_id.not.is.null"),
      ) as unknown as Row[];
      return rows.map(toSync);
    },
    async appointment(appointmentId) {
      const r = must(await db.from("appointments").select(SELECT).eq("id", appointmentId).maybeSingle()) as unknown as Row | null;
      return r ? toSync(r) : null;
    },
    async setEventId(appointmentId, eventId) {
      must(await db.from("appointments").update({ google_event_id: eventId }).eq("id", appointmentId));
    },
    async replaceGoogleBlocks(businessId, professionalId, fromISO, toISO, blocks) {
      must(await db.from("blocked_times").delete().eq("business_id", businessId).eq("source", "google").gte("starts_at", fromISO).lte("starts_at", toISO));
      if (blocks.length)
        must(
          await db.from("blocked_times").insert(
            blocks.map((b) => ({ business_id: businessId, professional_id: professionalId, starts_at: b.start, ends_at: b.end, reason: b.title.slice(0, 120), source: "google", external_id: b.id })),
          ),
        );
    },
    async logIntegration(businessId, title, body) {
      must(await db.from("activity").insert({ business_id: businessId, kind: "integration", title, body }));
    },
  };
}
