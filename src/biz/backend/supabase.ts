import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import type {
  Activity,
  Appointment,
  Backend,
  Block,
  Business,
  Catalogue,
  ChangeEvent,
  Conversation,
  Customer,
  CustomerPhoto,
  CustomerRow,
  GoogleStatus,
  Membership,
  Message,
  Professional,
  Range,
  Service,
  SessionUser,
  WaitlistEntry,
} from "./types";
import { BackendError } from "./types";

/** Where to return after Google sign-in (the hash route is lost during the OAuth redirect). */
const AFTER_LOGIN = "beautigo.pro.afterLogin";

type Row = Record<string, unknown>;

function fail(e: { message: string; hint?: string; code?: string } | null): asserts e is null {
  if (!e) return;
  if (e.code === "23P01" || e.hint === "slot_taken") throw new BackendError("המועד כבר תפוס. בחרו שעה אחרת.", "slot_taken");
  if (e.code === "23505") throw new BackendError("הפרטים כבר קיימים (למשל טלפון או כתובת עמוד)", "duplicate");
  if (e.code === "42501") throw new BackendError("אין הרשאה לפעולה הזו", "forbidden");
  throw new BackendError(e.message);
}

function toUser(u: User | null | undefined): SessionUser | null {
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, string>;
  return { id: u.id, name: meta.full_name || meta.name || "", phone: u.phone ? `+${u.phone.replace(/^\+/, "")}` : null, email: u.email ?? null };
}

const APPT_SELECT = "*, customers(full_name, phone)";
const PHOTOS = "customer-photos";

function toConversation(r: Row): Conversation {
  const c = r.customers as { full_name: string; phone: string } | null;
  const last = r.last_message_at as string;
  const read = r.business_read_at as string | null;
  return {
    id: r.id as string,
    business_id: r.business_id as string,
    customer_id: r.customer_id as string,
    customer_name: c?.full_name ?? "",
    customer_phone: c?.phone ?? "",
    appointment_id: (r.appointment_id as string) ?? null,
    last_message: r.last_message as string,
    last_message_at: last,
    last_sender: (r.last_sender as Conversation["last_sender"]) ?? null,
    unread: r.last_sender === "customer" && (!read || read < last),
  };
}
function toAppt(r: Row): Appointment {
  const c = r.customers as { full_name: string; phone: string } | null;
  return { ...(r as unknown as Appointment), price: Number(r.price), customer_name: c?.full_name ?? "", customer_phone: c?.phone ?? "" };
}

export function supabaseBackend(url: string, anonKey: string): Backend {
  const sb: SupabaseClient = createClient(url, anonKey, { auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true } });

  // After an OAuth round-trip the code is exchanged automatically; restore the in-app route.
  void sb.auth.getSession().then(() => {
    const next = localStorage.getItem(AFTER_LOGIN);
    if (new URLSearchParams(location.search).has("code")) {
      localStorage.removeItem(AFTER_LOGIN);
      history.replaceState(null, "", `${location.pathname}#${next ?? "/biz"}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  });

  async function token() {
    const { data } = await sb.auth.getSession();
    if (!data.session) throw new BackendError("יש להתחבר", "auth");
    return data.session.access_token;
  }
  async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    const r = await fetch(`/api/google/${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Bearer ${await token()}`, "content-type": "application/json" },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const j = (await r.json().catch(() => ({}))) as T & { error?: string };
    if (!r.ok) throw new BackendError(j.error ?? `שגיאת שרת (${r.status})`);
    return j;
  }

  async function catalogue(businessId: string): Promise<Catalogue> {
    const [b, pros, svcs, links, hours] = await Promise.all([
      sb.from("businesses").select("*").eq("id", businessId).single(),
      sb.from("professionals").select("*").eq("business_id", businessId).order("sort"),
      sb.from("services").select("*").eq("business_id", businessId).order("sort"),
      sb.from("professional_services").select("professional_id, service_id, professionals!inner(business_id)").eq("professionals.business_id", businessId),
      sb.from("working_hours").select("professional_id, kind, weekday, start_min, end_min, professionals!inner(business_id)").eq("professionals.business_id", businessId),
    ]);
    for (const r of [b, pros, svcs, links, hours]) fail(r.error);
    const range = (r: Row): Range => ({ weekday: Number(r.weekday), start_min: Number(r.start_min), end_min: Number(r.end_min) });
    return {
      business: b.data as Business,
      services: (svcs.data as Row[]).map((s) => ({ ...(s as unknown as Service), price: Number(s.price) })),
      professionals: (pros.data as Row[]).map((p) => ({
        ...(p as unknown as Professional),
        service_ids: (links.data as Row[]).filter((l) => l.professional_id === p.id).map((l) => l.service_id as string),
        hours: (hours.data as Row[]).filter((h) => h.professional_id === p.id && h.kind === "work").map(range),
        breaks: (hours.data as Row[]).filter((h) => h.professional_id === p.id && h.kind === "break").map(range),
      })),
    };
  }

  return {
    mode: "supabase",

    async getUser() {
      const { data } = await sb.auth.getSession();
      return toUser(data.session?.user);
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, s) => cb(toUser(s?.user)));
      return () => data.subscription.unsubscribe();
    },
    async sendPhoneCode(phone) {
      const { error } = await sb.auth.signInWithOtp({ phone });
      if (error) throw new BackendError(error.message.includes("provider") ? "שליחת SMS לא הוגדרה ב־Supabase (Twilio). ראו docs/SETUP.md" : error.message);
    },
    async verifyPhoneCode(phone, code) {
      const { error } = await sb.auth.verifyOtp({ phone, token: code, type: "sms" });
      if (error) throw new BackendError("הקוד שגוי או שפג תוקפו");
    },
    async signInWithGoogle() {
      localStorage.setItem(AFTER_LOGIN, location.hash.replace(/^#/, "") || "/biz");
      const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}${location.pathname}` } });
      if (error) throw new BackendError(error.message);
    },
    async signOut() {
      await sb.auth.signOut();
    },

    async memberships() {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return [];
      const r = await sb.from("business_members").select("role, professional_id, businesses(*)").eq("user_id", u.user.id);
      fail(r.error);
      return (r.data as Row[]).map((m) => ({ business: m.businesses as Business, role: m.role as Membership["role"], professional_id: (m.professional_id as string) ?? null }));
    },
    async claimInvites() {
      const r = await sb.rpc("claim_invites");
      fail(r.error);
      return Number(r.data ?? 0);
    },
    async createBusiness(input) {
      const { data: u } = await sb.auth.getUser();
      const r = await sb.from("businesses").insert({ ...input, owner_id: u.user!.id }).select().single();
      fail(r.error);
      return r.data as Business;
    },
    async updateBusiness(id, patch) {
      fail((await sb.from("businesses").update(patch).eq("id", id)).error);
    },
    catalogue,
    async saveService(businessId, s) {
      const row = { business_id: businessId, name: s.name, duration_min: s.duration_min, buffer_min: s.buffer_min, price: s.price, approval: s.approval, active: s.active };
      fail((s.id ? await sb.from("services").update(row).eq("id", s.id) : await sb.from("services").insert(row)).error);
    },
    async saveProfessional(businessId, p) {
      const row = { business_id: businessId, name: p.name, title: p.title, color: p.color, active: p.active };
      const r = p.id ? await sb.from("professionals").update(row).eq("id", p.id).select("id").single() : await sb.from("professionals").insert(row).select("id").single();
      fail(r.error);
      const id = (r.data as { id: string }).id;
      fail((await sb.from("professional_services").delete().eq("professional_id", id)).error);
      if (p.service_ids.length) fail((await sb.from("professional_services").insert(p.service_ids.map((service_id) => ({ professional_id: id, service_id })))).error);
      fail((await sb.from("working_hours").delete().eq("professional_id", id)).error);
      const ranges = [...p.hours.map((h) => ({ ...h, kind: "work" })), ...p.breaks.map((h) => ({ ...h, kind: "break" }))].map((h) => ({ ...h, professional_id: id }));
      if (ranges.length) fail((await sb.from("working_hours").insert(ranges)).error);
    },
    async invites(businessId) {
      const r = await sb.from("business_invites").select("id, phone, professional_id").eq("business_id", businessId);
      fail(r.error);
      return r.data ?? [];
    },
    async invite(businessId, phone, professional_id) {
      fail((await sb.from("business_invites").insert({ business_id: businessId, phone, professional_id })).error);
    },
    async removeInvite(id) {
      fail((await sb.from("business_invites").delete().eq("id", id)).error);
    },

    async appointments(businessId, from, to) {
      const r = await sb.from("appointments").select(APPT_SELECT).eq("business_id", businessId).gte("starts_at", from).lt("starts_at", to).order("starts_at");
      fail(r.error);
      return (r.data as Row[]).map(toAppt);
    },
    async appointment(id) {
      const r = await sb.from("appointments").select(APPT_SELECT).eq("id", id).maybeSingle();
      fail(r.error);
      return r.data ? toAppt(r.data as Row) : null;
    },
    async blocks(businessId, from, to) {
      const r = await sb.from("blocked_times").select("*").eq("business_id", businessId).lt("starts_at", to).gt("ends_at", from);
      fail(r.error);
      return r.data as Block[];
    },
    async slots(businessId, serviceId, day, professionalId, excludeId) {
      const r = await sb.rpc("available_slots", { p_business: businessId, p_service: serviceId, p_day: day, p_professional: professionalId ?? null, p_exclude: excludeId ?? null });
      fail(r.error);
      return r.data ?? [];
    },
    async createAppointment(i) {
      const svc = (await sb.from("services").select("*").eq("id", i.serviceId).single()).data as Service;
      const ends = new Date(Date.parse(i.startsAt) + svc.duration_min * 60_000).toISOString();
      const { data: u } = await sb.auth.getUser();
      const r = await sb
        .from("appointments")
        .insert({
          business_id: i.businessId,
          professional_id: i.professionalId,
          service_id: i.serviceId,
          customer_id: i.customerId,
          starts_at: i.startsAt,
          ends_at: ends,
          buffer_min: svc.buffer_min,
          service_name: svc.name,
          price: svc.price,
          note: i.note,
          status: "confirmed",
          source: "manual",
          created_by: u.user?.id,
        })
        .select("id")
        .single();
      fail(r.error);
      return (r.data as { id: string }).id;
    },
    async setStatus(id, status) {
      fail((await sb.from("appointments").update({ status }).eq("id", id)).error);
    },
    async cancel(id, reason) {
      fail((await sb.rpc("cancel_appointment", { p_id: id, p_reason: reason })).error);
    },
    async reschedule(id, startsAt, professionalId) {
      const a = (await sb.from("appointments").select("starts_at, ends_at").eq("id", id).single()).data as { starts_at: string; ends_at: string };
      const dur = Date.parse(a.ends_at) - Date.parse(a.starts_at);
      fail((await sb.from("appointments").update({ starts_at: startsAt, ends_at: new Date(Date.parse(startsAt) + dur).toISOString(), professional_id: professionalId }).eq("id", id)).error);
    },
    async addBlock(i) {
      fail((await sb.from("blocked_times").insert({ business_id: i.businessId, professional_id: i.professionalId, starts_at: i.startsAt, ends_at: i.endsAt, reason: i.reason })).error);
    },
    async removeBlock(id) {
      fail((await sb.from("blocked_times").delete().eq("id", id)).error);
    },

    async customers(businessId, q) {
      let query = sb.from("customers").select("*, appointments(starts_at, status)").eq("business_id", businessId).order("created_at", { ascending: false }).limit(500);
      // strip characters that have meaning in PostgREST filter syntax
      const term = (q ?? "").replace(/[,()%*\\]/g, "").trim();
      if (term) query = query.or(`full_name.ilike.%${term}%${/\d{3,}/.test(term) ? `,phone.ilike.%${term.replace(/\D/g, "")}%` : ""}`);
      const r = await query;
      fail(r.error);
      const now = new Date().toISOString();
      return (r.data as Row[]).map((c) => {
        const ap = (c.appointments as { starts_at: string; status: string }[]) ?? [];
        const done = ap.filter((a) => a.status === "completed").map((a) => a.starts_at).sort();
        const next = ap.filter((a) => (a.status === "confirmed" || a.status === "pending") && a.starts_at > now).map((a) => a.starts_at).sort();
        const { appointments: _a, ...rest } = c;
        void _a;
        return { ...(rest as unknown as Customer), visits: done.length, last_visit: done.at(-1) ?? null, next_visit: next[0] ?? null } satisfies CustomerRow;
      });
    },
    async customer(id) {
      const c = await sb.from("customers").select("*").eq("id", id).maybeSingle();
      fail(c.error);
      if (!c.data) return null;
      const a = await sb.from("appointments").select(APPT_SELECT).eq("customer_id", id).order("starts_at", { ascending: false });
      fail(a.error);
      return { customer: c.data as Customer, appointments: (a.data as Row[]).map(toAppt) };
    },
    async saveCustomer(businessId, i) {
      const row: Row = { business_id: businessId, full_name: i.full_name, phone: i.phone, email: i.email ?? null };
      for (const k of ["notes", "tags", "birthday", "preferences"] as const) if (i[k] !== undefined) row[k] = i[k];
      const r = i.id ? await sb.from("customers").update(row).eq("id", i.id).select().single() : await sb.from("customers").insert(row).select().single();
      fail(r.error);
      return r.data as Customer;
    },
    async customerPhotos(customerId) {
      const r = await sb.from("customer_photos").select("*").eq("customer_id", customerId).order("created_at", { ascending: false });
      fail(r.error);
      const rows = r.data as (Row & { path: string })[];
      if (!rows.length) return [];
      const signed = await sb.storage.from(PHOTOS).createSignedUrls(rows.map((x) => x.path), 3600);
      return rows.map((x, i) => ({ ...(x as unknown as CustomerPhoto), url: signed.data?.[i]?.signedUrl ?? "" }));
    },
    async addCustomerPhoto(businessId, customerId, file, kind, caption) {
      const ext = (file.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
      const path = `${businessId}/${customerId}/${crypto.randomUUID()}.${ext}`;
      const up = await sb.storage.from(PHOTOS).upload(path, file, { contentType: file.type || "image/jpeg" });
      if (up.error) throw new BackendError(`העלאת התמונה נכשלה: ${up.error.message}`);
      fail((await sb.from("customer_photos").insert({ business_id: businessId, customer_id: customerId, path, kind, caption })).error);
    },
    async removeCustomerPhoto(photo) {
      const r = await sb.from("customer_photos").delete().eq("id", photo.id).select("path").single();
      fail(r.error);
      await sb.storage.from(PHOTOS).remove([(r.data as { path: string }).path]);
    },

    async conversations(businessId) {
      const r = await sb.from("conversations").select("*, customers(full_name, phone)").eq("business_id", businessId).order("last_message_at", { ascending: false }).limit(200);
      fail(r.error);
      return (r.data as Row[]).map(toConversation);
    },
    async messages(conversationId) {
      const r = await sb.from("messages").select("id, conversation_id, sender, body, created_at").eq("conversation_id", conversationId).order("id").limit(500);
      fail(r.error);
      return r.data as Message[];
    },
    async conversationWith(businessId, customerId) {
      const found = await sb.from("conversations").select("id").eq("business_id", businessId).eq("customer_id", customerId).maybeSingle();
      fail(found.error);
      if (found.data) return (found.data as { id: string }).id;
      const r = await sb.from("conversations").insert({ business_id: businessId, customer_id: customerId }).select("id").single();
      fail(r.error);
      return (r.data as { id: string }).id;
    },
    async sendAsBusiness(businessId, conversationId, body) {
      const { data: u } = await sb.auth.getUser();
      fail((await sb.from("messages").insert({ conversation_id: conversationId, business_id: businessId, sender: "business", sender_user: u.user?.id, body: body.trim() })).error);
    },
    async markReadByBusiness(conversationId) {
      await sb.from("conversations").update({ business_read_at: new Date().toISOString() }).eq("id", conversationId);
    },
    async myConversation(businessId, i) {
      const r = await sb.rpc("start_conversation", { p_business: businessId, p_full_name: i.fullName, p_phone: i.phone, p_appointment: i.appointmentId ?? null });
      fail(r.error);
      return r.data as string;
    },
    async sendAsCustomer(businessId, conversationId, body) {
      const { data: u } = await sb.auth.getUser();
      fail((await sb.from("messages").insert({ conversation_id: conversationId, business_id: businessId, sender: "customer", sender_user: u.user?.id, body: body.trim() })).error);
    },
    async markReadByCustomer(conversationId) {
      await sb.from("conversations").update({ customer_read_at: new Date().toISOString() }).eq("id", conversationId);
    },
    subscribeConversation(conversationId, cb) {
      const ch = sb
        .channel(`conv-${conversationId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (p) => cb(p.new as Message))
        .subscribe();
      return () => void sb.removeChannel(ch);
    },

    async waitlist(businessId) {
      const r = await sb.from("waitlist").select("*, customers(full_name, phone)").eq("business_id", businessId).order("created_at", { ascending: false });
      fail(r.error);
      return (r.data as Row[]).map((w) => {
        const c = w.customers as { full_name: string; phone: string } | null;
        return { ...(w as unknown as WaitlistEntry), customer_name: c?.full_name ?? "", customer_phone: c?.phone ?? "" };
      });
    },
    async addWaitlist(i) {
      fail(
        (
          await sb.from("waitlist").insert({
            business_id: i.businessId,
            customer_id: i.customerId,
            service_id: i.serviceId,
            professional_id: i.professionalId,
            date_from: i.dateFrom,
            date_to: i.dateTo,
            part_of_day: i.part,
            note: i.note,
          })
        ).error,
      );
    },
    async setWaitlistStatus(id, status) {
      fail((await sb.from("waitlist").update({ status }).eq("id", id)).error);
    },

    async activity(businessId, limit = 50) {
      const r = await sb.from("activity").select("*").eq("business_id", businessId).order("id", { ascending: false }).limit(limit);
      fail(r.error);
      return r.data as Activity[];
    },
    subscribe(businessId, cb) {
      const ch = sb
        .channel(`biz-${businessId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity", filter: `business_id=eq.${businessId}` }, (p) => cb({ table: "activity", row: p.new as Activity }))
        .on("postgres_changes", { event: "*", schema: "public", table: "appointments", filter: `business_id=eq.${businessId}` }, () => cb({ table: "appointments" }))
        .on("postgres_changes", { event: "*", schema: "public", table: "waitlist", filter: `business_id=eq.${businessId}` }, () => cb({ table: "waitlist" }))
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `business_id=eq.${businessId}` }, (p) => cb({ table: "messages", row: p.new as Message }))
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `business_id=eq.${businessId}` }, () => cb({ table: "conversations" }))
        .subscribe();
      return () => void sb.removeChannel(ch);
    },

    async googleStatus(businessId) {
      const r = await sb.rpc("google_status", { p_business: businessId });
      fail(r.error);
      return ((r.data as GoogleStatus[]) ?? [])[0] ?? null;
    },
    async googleConnect(businessId) {
      const { url } = await api<{ url: string }>("connect", { method: "POST", body: { businessId } });
      location.assign(url);
    },
    async googleCalendars(businessId) {
      return (await api<{ calendars: { id: string; name: string; primary: boolean }[] }>(`calendars?businessId=${businessId}`)).calendars;
    },
    async googleSelect(businessId, calendarId, calendarName, professionalId) {
      await api("calendar", { method: "POST", body: { businessId, calendarId, calendarName, professionalId } });
    },
    async googleSync(businessId) {
      return api("sync", { method: "POST", body: { businessId } });
    },
    async googleDisconnect(businessId) {
      await api("disconnect", { method: "POST", body: { businessId } });
    },
    pushToGoogle(appointmentId) {
      void api("push", { method: "POST", body: { appointmentId } }).catch(() => undefined);
    },

    async publicCatalogue(slug) {
      const r = await sb.from("businesses").select("id").eq("slug", slug).maybeSingle();
      fail(r.error);
      return r.data ? catalogue((r.data as { id: string }).id) : null;
    },
    async bookOnline(i) {
      const r = await sb.rpc("book_online", { p_business: i.businessId, p_service: i.serviceId, p_start: i.startsAt, p_professional: i.professionalId, p_full_name: i.fullName, p_phone: i.phone, p_note: i.note });
      fail(r.error);
      return r.data as string;
    },
    async joinWaitlist(i) {
      const r = await sb.rpc("join_waitlist", {
        p_business: i.businessId,
        p_service: i.serviceId,
        p_date_from: i.dateFrom,
        p_date_to: i.dateTo,
        p_part: i.part,
        p_professional: i.professionalId,
        p_full_name: i.fullName,
        p_phone: i.phone,
        p_note: i.note,
      });
      fail(r.error);
      return r.data as string;
    },
    async myAppointments(businessId) {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) return [];
      const r = await sb.from("appointments").select(`${APPT_SELECT}, c:customers!inner(user_id)`).eq("business_id", businessId).eq("c.user_id", u.user.id).order("starts_at", { ascending: false });
      fail(r.error);
      return (r.data as Row[]).map(toAppt);
    },
  } satisfies Backend & { subscribe(b: string, cb: (e: ChangeEvent) => void): () => void };
}
