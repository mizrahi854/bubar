/**
 * Preview backend: the whole management system running in this browser with
 * sample data, so it can be explored before Supabase is configured.
 * It mirrors the database rules (overlap protection, waitlist offers, activity events),
 * but it is not shared between devices and the SMS code is fixed (123456).
 */
import { DateTime } from "luxon";
import type {
  Activity,
  Appointment,
  ApptStatus,
  Backend,
  Block,
  Business,
  Catalogue,
  ChangeEvent,
  Conversation,
  Customer,
  CustomerInput,
  CustomerPhoto,
  GoogleStatus,
  Invite,
  Message,
  Professional,
  Range,
  Service,
  SessionUser,
  WaitlistEntry,
} from "./types";
import { BackendError } from "./types";
import { computeSlots } from "../slots";
import { mediaStore } from "../../data/repository";

const KEY = "beautigo.pro.preview.v2";
const USER_KEY = "beautigo.pro.preview.user";
export const PREVIEW_CODE = "123456";

interface State {
  users: SessionUser[];
  members: { business_id: string; user_id: string; role: "owner" | "staff"; professional_id: string | null }[];
  businesses: Business[];
  professionals: Professional[];
  services: Service[];
  customers: Customer[];
  appointments: Appointment[];
  blocks: Block[];
  waitlist: WaitlistEntry[];
  activity: Activity[];
  invites: (Invite & { business_id: string })[];
  google: Record<string, GoogleStatus>;
  conversations: (Omit<Conversation, "customer_name" | "customer_phone" | "unread"> & { business_read_at: string | null; customer_read_at: string | null })[];
  messages: Message[];
  photos: (Omit<CustomerPhoto, "url"> & { business_id: string; src: string })[];
  seq: number;
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
const TZ = "Asia/Jerusalem";
const week = (start: number, end: number, days = [0, 1, 2, 3, 4]): Range[] => days.map((weekday) => ({ weekday, start_min: start * 60, end_min: end * 60 }));

const FIRST = ["אלונה", "שיר", "נוי", "מאיה", "טל", "רוני", "עדי", "ליה", "יעל", "אור", "דנה", "ספיר", "הילה", "גל", "נטע", "מיכל", "רותם", "עדן", "שני", "ליאור", "נגה", "קרן", "אביגיל", "תמר"];
const LAST = ["לביא", "בר", "כהן", "לוי", "מזרחי", "פרץ", "ביטון", "אברהם", "פרידמן", "שגיא", "דהן", "אוחיון", "נחום", "אדרי", "כץ", "שמש"];

function seed(now = new Date()): State {
  const owner: SessionUser = { id: "preview-owner", name: "מאיה רוזן", phone: "+972501111111", email: "maya@example.com" };
  const staff: SessionUser = { id: "preview-staff", name: "נועה לוי", phone: "+972522222222", email: null };
  const b: Business = { id: "biz-nova", name: "סטודיו נובה", slug: "studio-nova", phone: "03-5550000", address: "דיזנגוף 120, תל אביב", timezone: TZ, cancel_hours: 24, slot_step_min: 15, lead_min: 30, quick_replies: ["תודה! נתראה בתור", "אפשר לשלוח תמונת השראה?", "התפנה מקום מחר בבוקר"] };
  const services: Service[] = [
    { id: "svc-cut", business_id: b.id, name: "תספורת נשים", duration_min: 45, buffer_min: 10, price: 180, approval: "auto", active: true, sort: 0 },
    { id: "svc-blow", business_id: b.id, name: "פן ועיצוב", duration_min: 30, buffer_min: 5, price: 120, approval: "auto", active: true, sort: 1 },
    { id: "svc-color", business_id: b.id, name: "צבע שורשים", duration_min: 90, buffer_min: 15, price: 320, approval: "auto", active: true, sort: 2 },
    { id: "svc-bal", business_id: b.id, name: "בלייאז׳", duration_min: 180, buffer_min: 15, price: 950, approval: "manual", active: true, sort: 3 },
    { id: "svc-men", business_id: b.id, name: "תספורת גברים", duration_min: 30, buffer_min: 5, price: 90, approval: "auto", active: true, sort: 4 },
  ];
  const pros: Professional[] = [
    { id: "pro-maya", business_id: b.id, name: "מאיה רוזן", title: "מעצבת שיער ובעלים", color: "#6d4aff", active: true, sort: 0, service_ids: ["svc-cut", "svc-blow", "svc-bal"], hours: [...week(9, 19), { weekday: 5, start_min: 540, end_min: 840 }], breaks: week(13, 14) },
    { id: "pro-daniel", business_id: b.id, name: "דניאל כהן", title: "קולוריסט", color: "#8b5cf6", active: true, sort: 1, service_ids: ["svc-color", "svc-bal", "svc-men"], hours: week(10, 20), breaks: [] },
    { id: "pro-noa", business_id: b.id, name: "נועה לוי", title: "מעצבת שיער", color: "#a78bfa", active: true, sort: 2, service_ids: ["svc-cut", "svc-blow", "svc-men"], hours: [...week(9, 17), { weekday: 5, start_min: 480, end_min: 780 }], breaks: week(12, 12.5) },
  ];
  const s: State = {
    users: [owner, staff],
    members: [
      { business_id: b.id, user_id: owner.id, role: "owner", professional_id: "pro-maya" },
      { business_id: b.id, user_id: staff.id, role: "staff", professional_id: "pro-noa" },
    ],
    businesses: [b],
    professionals: pros,
    services,
    customers: [],
    appointments: [],
    blocks: [],
    waitlist: [],
    activity: [],
    invites: [],
    google: {},
    conversations: [],
    messages: [],
    photos: [],
    seq: 1,
  };
  // Deterministic pseudo-random so the sample looks the same on every reset
  let r = 7;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const created = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString();
  for (let i = 0; i < 28; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    s.customers.push({ id: `cus-${i}`, business_id: b.id, full_name: name, phone: `+97250${String(1000000 + i * 37219).slice(0, 7)}`, email: null, notes: i % 6 === 0 ? "מעדיפה שעות בוקר" : "", user_id: null, created_at: created(60 - i * 2), tags: i % 5 === 0 ? ["VIP"] : i % 7 === 0 ? ["צבע קבוע"] : [], birthday: i % 4 === 0 ? `199${i % 10}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}` : null, preferences: i % 5 === 0 ? "גוון 7.1 · מעדיפה קפה בלי סוכר" : "" });
  }
  const today = DateTime.fromJSDate(now).setZone(TZ).startOf("day");
  const cat: Catalogue = { business: b, professionals: pros, services };
  let ci = 0;
  for (let d = -10; d <= 9; d++) {
    const day = today.plus({ days: d });
    for (const p of pros) {
      for (const sid of p.service_ids) {
        if (rnd() < 0.35) continue;
        const free = computeSlots(cat, s.appointments, s.blocks, { serviceId: sid, day: day.toISODate()!, professionalId: p.id }, new Date(day.toMillis() - 86_400_000));
        const picks = Math.floor(rnd() * 3);
        for (let k = 0; k < picks && free.length; k++) {
          const slot = free.splice(Math.floor(rnd() * free.length), 1)[0];
          const svc = services.find((x) => x.id === sid)!;
          const c = s.customers[ci++ % s.customers.length];
          const start = Date.parse(slot.starts_at);
          if (s.appointments.some((a) => a.professional_id === p.id && start < Date.parse(a.ends_at) + a.buffer_min * 60_000 && Date.parse(a.starts_at) < start + (svc.duration_min + svc.buffer_min) * 60_000)) continue;
          const past = start < now.getTime();
          s.appointments.push({
            id: `apt-${s.appointments.length}`,
            business_id: b.id,
            professional_id: p.id,
            service_id: sid,
            customer_id: c.id,
            customer_name: c.full_name,
            customer_phone: c.phone,
            starts_at: slot.starts_at,
            ends_at: new Date(start + svc.duration_min * 60_000).toISOString(),
            buffer_min: svc.buffer_min,
            status: past ? (rnd() < 0.08 ? "no_show" : "completed") : svc.approval === "manual" && rnd() < 0.5 ? "pending" : "confirmed",
            service_name: svc.name,
            price: svc.price,
            note: "",
            source: rnd() < 0.6 ? "online" : "manual",
            cancel_reason: null,
            google_event_id: null,
            created_at: new Date(start - 3 * 86_400_000).toISOString(),
          });
        }
      }
    }
  }
  s.blocks.push({ id: "blk-1", business_id: b.id, professional_id: "pro-daniel", starts_at: today.plus({ days: 2, hours: 15 }).toUTC().toISO()!, ends_at: today.plus({ days: 2, hours: 17 }).toUTC().toISO()!, reason: "השתלמות", source: "manual" });
  s.waitlist.push(
    { id: "wl-1", business_id: b.id, customer_id: "cus-3", customer_name: s.customers[3].full_name, customer_phone: s.customers[3].phone, service_id: "svc-color", professional_id: null, date_from: today.toISODate()!, date_to: today.plus({ days: 5 }).toISODate()!, part_of_day: "morning", note: "", status: "waiting", notified_at: null, offered_start: null, created_at: created(1) },
    { id: "wl-2", business_id: b.id, customer_id: "cus-8", customer_name: s.customers[8].full_name, customer_phone: s.customers[8].phone, service_id: "svc-cut", professional_id: "pro-maya", date_from: today.toISODate()!, date_to: today.plus({ days: 3 }).toISODate()!, part_of_day: "any", note: "גמישה בשעות", status: "waiting", notified_at: null, offered_start: null, created_at: created(0.3) },
  );
  const convo = (ci: number, lines: [("customer" | "business"), string, number][], read: boolean) => {
    const id = `conv-${ci}`;
    const msgs = lines.map(([sender, body, minsAgo], k) => ({ id: s.seq++, conversation_id: id, sender, body, created_at: new Date(now.getTime() - minsAgo * 60_000).toISOString(), k }));
    for (const m of msgs) s.messages.push({ id: m.id, conversation_id: m.conversation_id, sender: m.sender, body: m.body, created_at: m.created_at });
    const last = msgs.at(-1)!;
    s.conversations.push({ id, business_id: b.id, customer_id: `cus-${ci}`, appointment_id: null, last_message: last.body, last_message_at: last.created_at, last_sender: last.sender, business_read_at: read ? last.created_at : null, customer_read_at: last.created_at });
  };
  convo(2, [["customer", "היי! אפשר לשלוח תמונה של הצבע שאני רוצה?", 95], ["business", "בטח, שלחי כאן ונגיד לך כמה זמן זה לוקח", 90], ["customer", "שלחתי באינסטגרם, זה בלונד דבש", 12]], false);
  convo(6, [["customer", "יש מקום מחר בבוקר לפן?", 240], ["business", "יש ב־10:15 אצל נועה, לקבוע?", 230], ["customer", "כן תודה!", 225]], true);
  convo(9, [["business", "תזכורת: מחר ב־12:00 צבע שורשים אצל דניאל 💜", 1500]], true);
  const act = (kind: string, title: string, body: string, minsAgo: number) =>
    s.activity.unshift({ id: s.seq++, business_id: b.id, kind, title, body, customer_id: null, appointment_id: null, waitlist_id: null, created_at: new Date(now.getTime() - minsAgo * 60_000).toISOString() });
  act("customer_registered", "רישום לקוח חדש", `${s.customers[1].full_name} נרשם/ה למערכת`, 300);
  act("appointment_booked", "זימון תור", `${s.customers[4].full_name} הזמינ/ה תור לפן ועיצוב אצל נועה לוי`, 180);
  act("waitlist_joined", "רשימת המתנה", `${s.customers[8].full_name} נכנס/ה לרשימת ההמתנה`, 20);
  act("appointment_cancelled", "ביטול תור", `${s.customers[11].full_name} · צבע שורשים`, 5);
  act("customer_registered", "רישום לקוח חדש", `${s.customers[0].full_name} נרשם/ה למערכת`, 1);
  return s;
}

export function previewBackend(): Backend & { simulate(): Promise<string>; reset(): void } {
  let state: State = load();
  const listeners = new Map<string, Set<(e: ChangeEvent) => void>>();
  const authListeners = new Set<(u: SessionUser | null) => void>();
  let userId: string | null = read(USER_KEY);

  function read(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }
  function load(): State {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw) as State;
    } catch {
      /* fall through to a fresh sample */
    }
    return seed();
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* in-memory only */
    }
  }
  const delay = <T>(v: T) => new Promise<T>((res) => setTimeout(() => res(v), 120));
  const clone = <T>(v: T): T => structuredClone(v);
  const me = () => state.users.find((u) => u.id === userId) ?? null;
  function emit(businessId: string, e: ChangeEvent) {
    for (const cb of listeners.get(businessId) ?? []) cb(e);
  }
  function log(businessId: string, kind: string, title: string, body: string, refs: Partial<Pick<Activity, "customer_id" | "appointment_id" | "waitlist_id">> = {}) {
    const row: Activity = { id: state.seq++, business_id: businessId, kind, title, body, customer_id: null, appointment_id: null, waitlist_id: null, ...refs, created_at: new Date().toISOString() };
    state.activity.unshift(row);
    state.activity = state.activity.slice(0, 300);
    emit(businessId, { table: "activity", row });
  }
  const member = (businessId: string) => state.members.find((m) => m.business_id === businessId && m.user_id === userId);
  function requireMember(businessId: string, owner = false) {
    const m = member(businessId);
    if (!m || (owner && m.role !== "owner")) throw new BackendError("אין הרשאה לפעולה הזו", "forbidden");
    return m;
  }
  const canSeePro = (businessId: string, proId: string) => {
    const m = member(businessId);
    return !!m && (m.role === "owner" || m.professional_id === proId);
  };
  const convListeners = new Map<string, Set<(m: Message) => void>>();
  const isConvCustomer = (c: { customer_id: string }) => !!userId && state.customers.find((x) => x.id === c.customer_id)?.user_id === userId;
  const convView = (c: State["conversations"][number]): Conversation => {
    const cu = state.customers.find((x) => x.id === c.customer_id);
    const { business_read_at, customer_read_at: _r, ...rest } = c;
    void _r;
    return { ...rest, customer_name: cu?.full_name ?? "", customer_phone: cu?.phone ?? "", unread: c.last_sender === "customer" && (!business_read_at || business_read_at < c.last_message_at) };
  };
  function postMessage(conversationId: string, sender: "customer" | "business", body: string) {
    const text = body.trim();
    if (!text) throw new BackendError("ההודעה ריקה");
    if (text.length > 2000) throw new BackendError("ההודעה ארוכה מדי");
    const c = state.conversations.find((x) => x.id === conversationId)!;
    const m: Message = { id: state.seq++, conversation_id: conversationId, sender, body: text, created_at: new Date().toISOString() };
    state.messages.push(m);
    Object.assign(c, { last_message: text.slice(0, 140), last_message_at: m.created_at, last_sender: sender });
    if (sender === "business") c.business_read_at = m.created_at;
    else c.customer_read_at = m.created_at;
    if (sender === "customer") {
      const name = state.customers.find((x) => x.id === c.customer_id)?.full_name ?? "";
      log(c.business_id, "message", "הודעה חדשה", `${name}: ${text.slice(0, 80)}`, { customer_id: c.customer_id });
    }
    emit(c.business_id, { table: "messages", row: m });
    emit(c.business_id, { table: "conversations" });
    for (const cb of convListeners.get(conversationId) ?? []) cb(clone(m));
    save();
    return m;
  }
  const cat = (businessId: string): Catalogue => ({
    business: state.businesses.find((b) => b.id === businessId)!,
    professionals: state.professionals.filter((p) => p.business_id === businessId).sort((a, b) => a.sort - b.sort),
    services: state.services.filter((s) => s.business_id === businessId).sort((a, b) => a.sort - b.sort),
  });
  const fmt = (iso: string) => DateTime.fromISO(iso).setZone(TZ).toFormat("dd/MM HH:mm");
  const overlaps = (a: Appointment, proId: string, start: number, end: number, exclude?: string) =>
    a.id !== exclude && a.professional_id === proId && (a.status === "pending" || a.status === "confirmed") && start < Date.parse(a.ends_at) + a.buffer_min * 60_000 && Date.parse(a.starts_at) < end;

  function insertAppointment(a: Omit<Appointment, "id" | "created_at" | "customer_name" | "customer_phone">): Appointment {
    const end = Date.parse(a.ends_at) + a.buffer_min * 60_000;
    if (state.appointments.some((x) => overlaps(x, a.professional_id, Date.parse(a.starts_at), end))) throw new BackendError("המועד כבר תפוס. בחרו שעה אחרת.", "slot_taken");
    const c = state.customers.find((x) => x.id === a.customer_id)!;
    const row: Appointment = { ...a, id: uid(), created_at: new Date().toISOString(), customer_name: c.full_name, customer_phone: c.phone };
    state.appointments.push(row);
    const pro = state.professionals.find((p) => p.id === a.professional_id)?.name ?? "";
    log(a.business_id, "appointment_booked", a.status === "pending" ? "בקשת תור חדשה" : "זימון תור", `${c.full_name} הזמינ/ה תור ל${a.service_name} אצל ${pro} · ${fmt(a.starts_at)}`, { customer_id: c.id, appointment_id: row.id });
    emit(a.business_id, { table: "appointments" });
    return row;
  }

  function insertCustomer(businessId: string, input: CustomerInput & { user_id?: string | null }) {
    if (input.full_name.trim().length < 2) throw new BackendError("נא להזין שם");
    if (input.phone && state.customers.some((c) => c.business_id === businessId && c.phone === input.phone)) throw new BackendError("כבר קיים/ת לקוח/ה עם הטלפון הזה", "duplicate");
    const c: Customer = { id: uid(), business_id: businessId, full_name: input.full_name.trim(), phone: input.phone, email: input.email ?? null, notes: input.notes ?? "", user_id: input.user_id ?? null, created_at: new Date().toISOString(), tags: input.tags ?? [], birthday: input.birthday ?? null, preferences: input.preferences ?? "" };
    state.customers.push(c);
    log(businessId, "customer_registered", "רישום לקוח חדש", `${c.full_name} נרשם/ה למערכת`, { customer_id: c.id });
    emit(businessId, { table: "customers" });
    return c;
  }

  function cancelInternal(a: Appointment, reason: string) {
    a.status = "cancelled";
    a.cancel_reason = reason || null;
    log(a.business_id, "appointment_cancelled", "ביטול תור", `${a.customer_name} · ${a.service_name} · ${fmt(a.starts_at)}`, { customer_id: a.customer_id, appointment_id: a.id });
    // Offer the freed slot to matching waitlist entries (same rule as the database trigger)
    const local = DateTime.fromISO(a.starts_at).setZone(TZ);
    const day = local.toISODate()!;
    const h = local.hour;
    for (const w of state.waitlist
      .filter((w) => w.business_id === a.business_id && w.status === "waiting")
      .filter((w) => (!w.service_id || w.service_id === a.service_id) && (!w.professional_id || w.professional_id === a.professional_id) && day >= w.date_from && day <= w.date_to)
      .filter((w) => w.part_of_day === "any" || (w.part_of_day === "morning" && h < 12) || (w.part_of_day === "noon" && h >= 12 && h <= 16) || (w.part_of_day === "evening" && h >= 17))
      .sort((x, y) => x.created_at.localeCompare(y.created_at))) {
      w.status = "notified";
      w.notified_at = new Date().toISOString();
      w.offered_start = a.starts_at;
      log(a.business_id, "waitlist_slot_opened", "רשימת המתנה", `התפנה מקום ב־${fmt(a.starts_at)} — ${w.customer_name} ממתינ/ה ל${a.service_name}`, { appointment_id: a.id, waitlist_id: w.id });
      emit(a.business_id, { table: "waitlist" });
    }
    emit(a.business_id, { table: "appointments" });
  }

  function signIn(u: SessionUser) {
    userId = u.id;
    try {
      localStorage.setItem(USER_KEY, u.id);
    } catch {
      /* session only */
    }
    for (const cb of authListeners) cb(clone(u));
  }

  const api = {
    mode: "preview" as const,

    async getUser() {
      return delay(clone(me()));
    },
    onAuthChange(cb: (u: SessionUser | null) => void) {
      authListeners.add(cb);
      return () => void authListeners.delete(cb);
    },
    async sendPhoneCode(phone: string) {
      if (!phone) throw new BackendError("מספר טלפון לא תקין");
      await delay(null);
    },
    async verifyPhoneCode(phone: string, code: string) {
      await delay(null);
      if (code !== PREVIEW_CODE) throw new BackendError("הקוד שגוי. בתצוגה המקדימה הקוד הוא 123456");
      let u = state.users.find((x) => x.phone === phone);
      if (!u) {
        u = { id: uid(), name: "", phone, email: null };
        state.users.push(u);
        save();
      }
      signIn(u);
    },
    async signInWithGoogle() {
      // Preview: signs in as the sample business owner
      signIn(state.users.find((u) => u.id === "preview-owner")!);
    },
    async signOut() {
      userId = null;
      try {
        localStorage.removeItem(USER_KEY);
      } catch {
        /* ignore */
      }
      for (const cb of authListeners) cb(null);
    },

    async memberships() {
      return delay(clone(state.members.filter((m) => m.user_id === userId).map((m) => ({ business: state.businesses.find((b) => b.id === m.business_id)!, role: m.role, professional_id: m.professional_id }))));
    },
    async claimInvites() {
      const u = me();
      if (!u?.phone) return 0;
      const mine = state.invites.filter((i) => i.phone.replace(/\D/g, "").endsWith(u.phone!.replace(/\D/g, "").slice(-9)));
      for (const i of mine) state.members.push({ business_id: i.business_id, user_id: u.id, role: "staff", professional_id: i.professional_id });
      state.invites = state.invites.filter((i) => !mine.includes(i));
      save();
      return mine.length;
    },
    async createBusiness(input: { name: string; slug: string; phone: string; address: string }) {
      if (!userId) throw new BackendError("יש להתחבר");
      if (input.name.trim().length < 2) throw new BackendError("נא להזין שם עסק");
      if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(input.slug)) throw new BackendError("כתובת העמוד: אותיות באנגלית, ספרות ומקף (3 תווים לפחות)");
      if (state.businesses.some((b) => b.slug === input.slug)) throw new BackendError("כתובת העמוד תפוסה", "duplicate");
      const b: Business = { id: uid(), ...input, timezone: TZ, cancel_hours: 24, slot_step_min: 15, lead_min: 30, quick_replies: [] };
      state.businesses.push(b);
      state.members.push({ business_id: b.id, user_id: userId, role: "owner", professional_id: null });
      save();
      return clone(b);
    },
    async updateBusiness(id: string, patch: Partial<Business>) {
      requireMember(id, true);
      Object.assign(state.businesses.find((b) => b.id === id)!, patch);
      save();
    },
    async catalogue(businessId: string) {
      return delay(clone(cat(businessId)));
    },
    async saveService(businessId: string, i: Omit<Service, "id" | "business_id" | "sort"> & { id?: string }) {
      requireMember(businessId, true);
      if (i.name.trim().length < 2) throw new BackendError("נא להזין שם שירות");
      const existing = i.id && state.services.find((s) => s.id === i.id);
      if (existing) Object.assign(existing, i);
      else state.services.push({ ...i, id: uid(), business_id: businessId, sort: state.services.length });
      save();
    },
    async saveProfessional(businessId: string, i: Omit<Professional, "id" | "business_id" | "sort"> & { id?: string }) {
      requireMember(businessId, true);
      if (i.name.trim().length < 2) throw new BackendError("נא להזין שם");
      const existing = i.id && state.professionals.find((p) => p.id === i.id);
      if (existing) Object.assign(existing, i);
      else state.professionals.push({ ...i, id: uid(), business_id: businessId, sort: state.professionals.length });
      save();
    },
    async invites(businessId: string) {
      return clone(state.invites.filter((i) => i.business_id === businessId));
    },
    async invite(businessId: string, phone: string, professional_id: string | null) {
      requireMember(businessId, true);
      state.invites.push({ id: uid(), business_id: businessId, phone, professional_id });
      save();
    },
    async removeInvite(id: string) {
      state.invites = state.invites.filter((i) => i.id !== id);
      save();
    },

    async appointments(businessId: string, from: string, to: string) {
      requireMember(businessId);
      return delay(clone(state.appointments.filter((a) => a.business_id === businessId && a.starts_at >= from && a.starts_at < to && canSeePro(businessId, a.professional_id)).sort((x, y) => x.starts_at.localeCompare(y.starts_at))));
    },
    async appointment(id: string) {
      const a = state.appointments.find((x) => x.id === id);
      if (!a) return null;
      const ownCustomer = state.customers.find((c) => c.id === a.customer_id)?.user_id === userId;
      return a && (canSeePro(a.business_id, a.professional_id) || ownCustomer) ? clone(a) : null;
    },
    async blocks(businessId: string, from: string, to: string) {
      return clone(state.blocks.filter((b) => b.business_id === businessId && b.starts_at < to && b.ends_at > from));
    },
    async slots(businessId: string, serviceId: string, day: string, professionalId?: string | null, excludeId?: string) {
      return delay(computeSlots(cat(businessId), state.appointments, state.blocks, { serviceId, day, professionalId, excludeId }));
    },
    async createAppointment(i: { businessId: string; serviceId: string; professionalId: string; customerId: string; startsAt: string; note: string }) {
      if (!canSeePro(i.businessId, i.professionalId)) throw new BackendError("אין הרשאה ליומן הזה", "forbidden");
      const svc = state.services.find((s) => s.id === i.serviceId)!;
      const row = insertAppointment({
        business_id: i.businessId,
        professional_id: i.professionalId,
        service_id: svc.id,
        customer_id: i.customerId,
        starts_at: new Date(i.startsAt).toISOString(),
        ends_at: new Date(Date.parse(i.startsAt) + svc.duration_min * 60_000).toISOString(),
        buffer_min: svc.buffer_min,
        status: "confirmed",
        service_name: svc.name,
        price: svc.price,
        note: i.note,
        source: "manual",
        cancel_reason: null,
        google_event_id: null,
      });
      save();
      return row.id;
    },
    async setStatus(id: string, status: Exclude<ApptStatus, "cancelled">) {
      const a = state.appointments.find((x) => x.id === id)!;
      if (!canSeePro(a.business_id, a.professional_id)) throw new BackendError("אין הרשאה", "forbidden");
      const prev = a.status;
      a.status = status;
      if (prev === "pending" && status === "confirmed") log(a.business_id, "appointment_approved", "תור אושר", `${a.customer_name} · ${a.service_name}`, { appointment_id: a.id });
      if (status === "no_show") log(a.business_id, "appointment_no_show", "לא הגיע/ה", `${a.customer_name} · ${a.service_name}`, { appointment_id: a.id });
      emit(a.business_id, { table: "appointments" });
      save();
    },
    async cancel(id: string, reason: string) {
      const a = state.appointments.find((x) => x.id === id);
      if (!a) throw new BackendError("התור לא נמצא");
      const isCustomer = state.customers.find((c) => c.id === a.customer_id)?.user_id === userId;
      if (!canSeePro(a.business_id, a.professional_id) && !isCustomer) throw new BackendError("אין הרשאה לבטל את התור", "forbidden");
      if (!["pending", "confirmed"].includes(a.status)) throw new BackendError("אי אפשר לבטל תור במצב הזה");
      cancelInternal(a, reason);
      save();
    },
    async reschedule(id: string, startsAt: string, professionalId: string) {
      const a = state.appointments.find((x) => x.id === id)!;
      if (!canSeePro(a.business_id, a.professional_id) || !canSeePro(a.business_id, professionalId)) throw new BackendError("אין הרשאה", "forbidden");
      const dur = Date.parse(a.ends_at) - Date.parse(a.starts_at);
      const start = Date.parse(startsAt);
      if (state.appointments.some((x) => overlaps(x, professionalId, start, start + dur + a.buffer_min * 60_000, a.id))) throw new BackendError("המועד כבר תפוס. בחרו שעה אחרת.", "slot_taken");
      const from = a.starts_at;
      a.starts_at = new Date(start).toISOString();
      a.ends_at = new Date(start + dur).toISOString();
      a.professional_id = professionalId;
      log(a.business_id, "appointment_rescheduled", "שינוי מועד", `${a.customer_name} · ${fmt(from)} ← ${fmt(a.starts_at)}`, { appointment_id: a.id });
      emit(a.business_id, { table: "appointments" });
      save();
    },
    async addBlock(i: { businessId: string; professionalId: string; startsAt: string; endsAt: string; reason: string }) {
      if (!canSeePro(i.businessId, i.professionalId)) throw new BackendError("אין הרשאה", "forbidden");
      if (Date.parse(i.endsAt) <= Date.parse(i.startsAt)) throw new BackendError("שעת הסיום חייבת להיות אחרי ההתחלה");
      state.blocks.push({ id: uid(), business_id: i.businessId, professional_id: i.professionalId, starts_at: i.startsAt, ends_at: i.endsAt, reason: i.reason, source: "manual" });
      emit(i.businessId, { table: "blocks" });
      save();
    },
    async removeBlock(id: string) {
      const b = state.blocks.find((x) => x.id === id);
      state.blocks = state.blocks.filter((x) => x.id !== id);
      if (b) emit(b.business_id, { table: "blocks" });
      save();
    },

    async customers(businessId: string, q?: string) {
      requireMember(businessId);
      const now = new Date().toISOString();
      const term = (q ?? "").trim();
      return delay(
        clone(
          state.customers
            .filter((c) => c.business_id === businessId && (!term || c.full_name.includes(term) || (term.replace(/\D/g, "").length >= 3 && c.phone.includes(term.replace(/\D/g, "").replace(/^0/, "")))))
            .map((c) => {
              const ap = state.appointments.filter((a) => a.customer_id === c.id);
              const done = ap.filter((a) => a.status === "completed").map((a) => a.starts_at).sort();
              const next = ap.filter((a) => (a.status === "confirmed" || a.status === "pending") && a.starts_at > now).map((a) => a.starts_at).sort();
              return { ...c, visits: done.length, last_visit: done.at(-1) ?? null, next_visit: next[0] ?? null };
            })
            .sort((x, y) => y.created_at.localeCompare(x.created_at)),
        ),
      );
    },
    async customer(id: string) {
      const c = state.customers.find((x) => x.id === id);
      if (!c) return null;
      requireMember(c.business_id);
      return clone({ customer: c, appointments: state.appointments.filter((a) => a.customer_id === id).sort((x, y) => y.starts_at.localeCompare(x.starts_at)) });
    },
    async saveCustomer(businessId: string, i: CustomerInput) {
      requireMember(businessId);
      if (i.id) {
        const c = state.customers.find((x) => x.id === i.id)!;
        if (i.phone && state.customers.some((x) => x.business_id === businessId && x.phone === i.phone && x.id !== i.id)) throw new BackendError("כבר קיים/ת לקוח/ה עם הטלפון הזה", "duplicate");
        Object.assign(c, { full_name: i.full_name, phone: i.phone, email: i.email ?? null });
        for (const k of ["notes", "tags", "birthday", "preferences"] as const) if (i[k] !== undefined) Object.assign(c, { [k]: i[k] });
        for (const a of state.appointments.filter((a) => a.customer_id === c.id)) Object.assign(a, { customer_name: c.full_name, customer_phone: c.phone });
        save();
        return clone(c);
      }
      const c = insertCustomer(businessId, i);
      save();
      return clone(c);
    },
    async customerPhotos(customerId: string) {
      const list = state.photos.filter((p) => p.customer_id === customerId).sort((x, y) => y.created_at.localeCompare(x.created_at));
      return Promise.all(list.map(async (p) => ({ id: p.id, customer_id: p.customer_id, kind: p.kind, caption: p.caption, created_at: p.created_at, url: await mediaStore.url(p.src) })));
    },
    async addCustomerPhoto(businessId: string, customerId: string, file: Blob, kind: CustomerPhoto["kind"], caption: string) {
      requireMember(businessId);
      if (!file.type.startsWith("image/")) throw new BackendError("בחרו קובץ תמונה");
      if (file.size > 12 * 1024 * 1024) throw new BackendError("התמונה גדולה מדי (עד 12MB)");
      const src = await mediaStore.put(file);
      state.photos.push({ id: uid(), business_id: businessId, customer_id: customerId, kind, caption, created_at: new Date().toISOString(), src });
      save();
    },
    async removeCustomerPhoto(photo: CustomerPhoto) {
      const p = state.photos.find((x) => x.id === photo.id);
      if (p) await mediaStore.remove(p.src);
      state.photos = state.photos.filter((x) => x.id !== photo.id);
      save();
    },

    async conversations(businessId: string) {
      requireMember(businessId);
      return delay(clone(state.conversations.filter((c) => c.business_id === businessId).sort((x, y) => y.last_message_at.localeCompare(x.last_message_at)).map(convView)));
    },
    async messages(conversationId: string) {
      const c = state.conversations.find((x) => x.id === conversationId);
      if (!c || !(member(c.business_id) || isConvCustomer(c))) throw new BackendError("אין גישה לשיחה הזו", "forbidden");
      return delay(clone(state.messages.filter((m) => m.conversation_id === conversationId)));
    },
    async conversationWith(businessId: string, customerId: string) {
      requireMember(businessId);
      let c = state.conversations.find((x) => x.business_id === businessId && x.customer_id === customerId);
      if (!c) {
        c = { id: uid(), business_id: businessId, customer_id: customerId, appointment_id: null, last_message: "", last_message_at: new Date().toISOString(), last_sender: null, business_read_at: null, customer_read_at: null };
        state.conversations.push(c);
        save();
      }
      return c.id;
    },
    async sendAsBusiness(businessId: string, conversationId: string, body: string) {
      requireMember(businessId);
      postMessage(conversationId, "business", body);
    },
    async markReadByBusiness(conversationId: string) {
      const c = state.conversations.find((x) => x.id === conversationId);
      if (c && member(c.business_id)) {
        c.business_read_at = new Date().toISOString();
        emit(c.business_id, { table: "conversations" });
        save();
      }
    },
    async myConversation(businessId: string, i: { fullName: string; phone: string; appointmentId?: string | null }) {
      const u = me();
      if (!u) throw new BackendError("יש להתחבר כדי לשלוח הודעה", "auth");
      let cu = state.customers.find((x) => x.business_id === businessId && (x.user_id === u.id || (!!i.phone && x.phone === i.phone)));
      if (cu) cu.user_id = u.id;
      else cu = insertCustomer(businessId, { full_name: i.fullName || u.name || "לקוח/ה", phone: i.phone || u.phone || "", user_id: u.id });
      let c = state.conversations.find((x) => x.business_id === businessId && x.customer_id === cu!.id);
      if (!c) {
        c = { id: uid(), business_id: businessId, customer_id: cu.id, appointment_id: i.appointmentId ?? null, last_message: "", last_message_at: new Date().toISOString(), last_sender: null, business_read_at: null, customer_read_at: null };
        state.conversations.push(c);
      } else if (i.appointmentId) c.appointment_id = i.appointmentId;
      save();
      return c.id;
    },
    async sendAsCustomer(_businessId: string, conversationId: string, body: string) {
      const c = state.conversations.find((x) => x.id === conversationId);
      if (!c || !isConvCustomer(c)) throw new BackendError("אין גישה לשיחה הזו", "forbidden");
      postMessage(conversationId, "customer", body);
    },
    async markReadByCustomer(conversationId: string) {
      const c = state.conversations.find((x) => x.id === conversationId);
      if (c && isConvCustomer(c)) {
        c.customer_read_at = new Date().toISOString();
        save();
      }
    },
    subscribeConversation(conversationId: string, cb: (m: Message) => void) {
      if (!convListeners.has(conversationId)) convListeners.set(conversationId, new Set());
      convListeners.get(conversationId)!.add(cb);
      return () => void convListeners.get(conversationId)!.delete(cb);
    },

    async waitlist(businessId: string) {
      requireMember(businessId);
      return delay(clone(state.waitlist.filter((w) => w.business_id === businessId).sort((x, y) => y.created_at.localeCompare(x.created_at))));
    },
    async addWaitlist(i: { businessId: string; customerId: string; serviceId: string | null; professionalId: string | null; dateFrom: string; dateTo: string; part: WaitlistEntry["part_of_day"]; note: string }) {
      requireMember(i.businessId);
      if (i.dateTo < i.dateFrom) throw new BackendError("טווח תאריכים לא תקין");
      const c = state.customers.find((x) => x.id === i.customerId)!;
      const w: WaitlistEntry = { id: uid(), business_id: i.businessId, customer_id: c.id, customer_name: c.full_name, customer_phone: c.phone, service_id: i.serviceId, professional_id: i.professionalId, date_from: i.dateFrom, date_to: i.dateTo, part_of_day: i.part, note: i.note, status: "waiting", notified_at: null, offered_start: null, created_at: new Date().toISOString() };
      state.waitlist.push(w);
      log(i.businessId, "waitlist_joined", "רשימת המתנה", `${c.full_name} נכנס/ה לרשימת ההמתנה`, { customer_id: c.id, waitlist_id: w.id });
      emit(i.businessId, { table: "waitlist" });
      save();
    },
    async setWaitlistStatus(id: string, status: WaitlistEntry["status"]) {
      const w = state.waitlist.find((x) => x.id === id)!;
      requireMember(w.business_id);
      w.status = status;
      emit(w.business_id, { table: "waitlist" });
      save();
    },

    async activity(businessId: string, limit = 50) {
      requireMember(businessId);
      return delay(clone(state.activity.filter((a) => a.business_id === businessId).slice(0, limit)));
    },
    subscribe(businessId: string, cb: (e: ChangeEvent) => void) {
      if (!listeners.has(businessId)) listeners.set(businessId, new Set());
      listeners.get(businessId)!.add(cb);
      return () => void listeners.get(businessId)!.delete(cb);
    },

    async googleStatus(businessId: string) {
      return clone(state.google[businessId] ?? null);
    },
    async googleConnect(businessId: string) {
      requireMember(businessId, true);
      await delay(null);
      state.google[businessId] = { google_email: `${me()?.email ?? "owner"}`, calendar_id: "primary", calendar_name: "היומן הראשי", professional_id: null, status: "connected", last_sync_at: null, last_error: null };
      log(businessId, "integration", "Google Calendar", "היומן חובר (תצוגה מקדימה — ללא חיבור אמיתי)");
      save();
    },
    async googleCalendars() {
      return [
        { id: "primary", name: "היומן הראשי", primary: true },
        { id: "work", name: "תורים — סטודיו", primary: false },
      ];
    },
    async googleSelect(businessId: string, calendarId: string, calendarName: string, professionalId: string | null) {
      Object.assign(state.google[businessId], { calendar_id: calendarId, calendar_name: calendarName, professional_id: professionalId });
      save();
    },
    async googleSync(businessId: string) {
      await delay(null);
      const g = state.google[businessId];
      g.last_sync_at = new Date().toISOString();
      g.status = "connected";
      g.last_error = null;
      save();
      const pushed = state.appointments.filter((a) => a.business_id === businessId && (a.status === "confirmed" || a.status === "pending") && a.starts_at > new Date().toISOString()).length;
      return { pushed, imported: 0, failed: 0 };
    },
    async googleDisconnect(businessId: string) {
      delete state.google[businessId];
      log(businessId, "integration", "Google Calendar", "היומן נותק");
      save();
    },
    pushToGoogle() {
      /* preview: nothing leaves the browser */
    },

    async publicCatalogue(slug: string) {
      const b = state.businesses.find((x) => x.slug === slug);
      return delay(b ? clone(cat(b.id)) : null);
    },
    async bookOnline(i: { businessId: string; serviceId: string; professionalId: string | null; startsAt: string; fullName: string; phone: string; note: string }) {
      const u = me();
      if (!u) throw new BackendError("יש להתחבר כדי לקבוע תור", "auth");
      const day = DateTime.fromISO(i.startsAt).setZone(TZ).toISODate()!;
      const slot = computeSlots(cat(i.businessId), state.appointments, state.blocks, { serviceId: i.serviceId, day, professionalId: i.professionalId }).find((s) => s.starts_at === new Date(i.startsAt).toISOString());
      if (!slot) throw new BackendError("המועד כבר לא פנוי. בחרו שעה אחרת.", "slot_taken");
      let c = state.customers.find((x) => x.business_id === i.businessId && (x.user_id === u.id || (!!i.phone && x.phone === i.phone)));
      if (c) c.user_id = u.id;
      else c = insertCustomer(i.businessId, { full_name: i.fullName || u.name || "לקוח/ה", phone: i.phone || u.phone || "", user_id: u.id });
      const svc = state.services.find((s) => s.id === i.serviceId)!;
      const row = insertAppointment({
        business_id: i.businessId,
        professional_id: slot.professional_id,
        service_id: svc.id,
        customer_id: c.id,
        starts_at: slot.starts_at,
        ends_at: new Date(Date.parse(slot.starts_at) + svc.duration_min * 60_000).toISOString(),
        buffer_min: svc.buffer_min,
        status: svc.approval === "manual" ? "pending" : "confirmed",
        service_name: svc.name,
        price: svc.price,
        note: i.note,
        source: "online",
        cancel_reason: null,
        google_event_id: null,
      });
      for (const w of state.waitlist.filter((w) => w.customer_id === c!.id && (w.status === "waiting" || w.status === "notified") && (!w.service_id || w.service_id === svc.id))) w.status = "booked";
      save();
      return row.id;
    },
    async joinWaitlist(i: { businessId: string; serviceId: string; professionalId: string | null; dateFrom: string; dateTo: string; part: WaitlistEntry["part_of_day"]; fullName: string; phone: string; note: string }) {
      const u = me();
      if (!u) throw new BackendError("יש להתחבר", "auth");
      let c = state.customers.find((x) => x.business_id === i.businessId && (x.user_id === u.id || (!!i.phone && x.phone === i.phone)));
      if (!c) c = insertCustomer(i.businessId, { full_name: i.fullName || "לקוח/ה", phone: i.phone || u.phone || "", user_id: u.id });
      const w: WaitlistEntry = { id: uid(), business_id: i.businessId, customer_id: c.id, customer_name: c.full_name, customer_phone: c.phone, service_id: i.serviceId, professional_id: i.professionalId, date_from: i.dateFrom, date_to: i.dateTo, part_of_day: i.part, note: i.note, status: "waiting", notified_at: null, offered_start: null, created_at: new Date().toISOString() };
      state.waitlist.push(w);
      log(i.businessId, "waitlist_joined", "רשימת המתנה", `${c.full_name} נכנס/ה לרשימת ההמתנה`, { customer_id: c.id, waitlist_id: w.id });
      emit(i.businessId, { table: "waitlist" });
      save();
      return w.id;
    },
    async myAppointments(businessId: string) {
      const ids = new Set(state.customers.filter((c) => c.business_id === businessId && c.user_id === userId).map((c) => c.id));
      return clone(state.appointments.filter((a) => ids.has(a.customer_id)).sort((x, y) => y.starts_at.localeCompare(x.starts_at)));
    },

    /** Preview only: a customer action happens "somewhere else", to show the live feed. */
    async simulate() {
      const b = state.businesses[0];
      const roll = Math.random();
      if (roll < 0.2) {
        const c = state.conversations.filter((x) => x.business_id === b.id)[Math.floor(Math.random() * 3)] ?? state.conversations[0];
        const lines = ["אפשר להזיז את התור לשעה מאוחרת יותר?", "תודה רבה, יצא מדהים! 😍", "יש לכם מקום השבוע לבלייאז׳?", "אני מאחרת ב־10 דקות, סליחה!"];
        if (c) {
          postMessage(c.id, "customer", lines[Math.floor(Math.random() * lines.length)]);
          return "הודעה חדשה מלקוח/ה";
        }
      }
      if (roll < 0.45) {
        const c = insertCustomer(b.id, { full_name: `${FIRST[Math.floor(Math.random() * FIRST.length)]} ${LAST[Math.floor(Math.random() * LAST.length)]}`, phone: `+97254${Math.floor(1000000 + Math.random() * 8999999)}` });
        save();
        return `${c.full_name} נרשם/ה`;
      }
      if (roll < 0.72) {
        const today = DateTime.now().setZone(TZ);
        for (let d = 0; d < 7; d++) {
          const svc = state.services.filter((s) => s.business_id === b.id && s.active)[Math.floor(Math.random() * 4)];
          const free = computeSlots(cat(b.id), state.appointments, state.blocks, { serviceId: svc.id, day: today.plus({ days: d }).toISODate()! });
          if (!free.length) continue;
          const slot = free[Math.floor(Math.random() * free.length)];
          const c = state.customers[Math.floor(Math.random() * state.customers.length)];
          insertAppointment({ business_id: b.id, professional_id: slot.professional_id, service_id: svc.id, customer_id: c.id, starts_at: slot.starts_at, ends_at: new Date(Date.parse(slot.starts_at) + svc.duration_min * 60_000).toISOString(), buffer_min: svc.buffer_min, status: svc.approval === "manual" ? "pending" : "confirmed", service_name: svc.name, price: svc.price, note: "", source: "online", cancel_reason: null, google_event_id: null });
          save();
          return `${c.full_name} קבע/ה תור`;
        }
      }
      const upcoming = state.appointments.filter((a) => a.business_id === b.id && a.status === "confirmed" && a.starts_at > new Date().toISOString());
      const a = upcoming[Math.floor(Math.random() * upcoming.length)];
      if (a) {
        cancelInternal(a, "בוטל על ידי הלקוח/ה");
        save();
        return `${a.customer_name} ביטל/ה תור`;
      }
      return "אין פעולה להדגים";
    },
    reset() {
      state = seed();
      save();
      for (const [b] of listeners) emit(b, { table: "appointments" });
    },
  };
  return api as unknown as Backend & { simulate(): Promise<string>; reset(): void };
}
