/** Types and backend contract for the business management system (Supabase or local preview). */

export type ID = string;
export type Role = "owner" | "staff";
export type ApptStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show";
export type WaitStatus = "waiting" | "notified" | "booked" | "cancelled";
export type PartOfDay = "any" | "morning" | "noon" | "evening";

export interface SessionUser {
  id: ID;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface Business {
  id: ID;
  name: string;
  slug: string;
  phone: string;
  address: string;
  timezone: string;
  cancel_hours: number;
  slot_step_min: number;
  lead_min: number;
  quick_replies: string[];
}

export interface Membership {
  business: Business;
  role: Role;
  professional_id: ID | null;
}

export interface Range {
  weekday: number; // 0 = Sunday
  start_min: number;
  end_min: number;
}

export interface Professional {
  id: ID;
  business_id: ID;
  name: string;
  title: string;
  color: string;
  active: boolean;
  sort: number;
  service_ids: ID[];
  hours: Range[];
  breaks: Range[];
}

export interface Service {
  id: ID;
  business_id: ID;
  name: string;
  duration_min: number;
  buffer_min: number;
  price: number;
  approval: "auto" | "manual";
  active: boolean;
  sort: number;
}

export interface Catalogue {
  business: Business;
  professionals: Professional[];
  services: Service[];
}

export interface Customer {
  id: ID;
  business_id: ID;
  full_name: string;
  phone: string;
  email: string | null;
  notes: string;
  user_id: ID | null;
  created_at: string;
}

export interface CustomerRow extends Customer {
  visits: number;
  last_visit: string | null;
  next_visit: string | null;
}

export interface Appointment {
  id: ID;
  business_id: ID;
  professional_id: ID;
  service_id: ID | null;
  customer_id: ID;
  customer_name: string;
  customer_phone: string;
  starts_at: string;
  ends_at: string;
  buffer_min: number;
  status: ApptStatus;
  service_name: string;
  price: number;
  note: string;
  source: "online" | "manual";
  cancel_reason: string | null;
  google_event_id: string | null;
  created_at: string;
}

export interface Block {
  id: ID;
  business_id: ID;
  professional_id: ID;
  starts_at: string;
  ends_at: string;
  reason: string;
  source: "manual" | "google";
}

export interface WaitlistEntry {
  id: ID;
  business_id: ID;
  customer_id: ID;
  customer_name: string;
  customer_phone: string;
  service_id: ID | null;
  professional_id: ID | null;
  date_from: string;
  date_to: string;
  part_of_day: PartOfDay;
  note: string;
  status: WaitStatus;
  notified_at: string | null;
  offered_start: string | null;
  created_at: string;
}

export interface Activity {
  id: number;
  business_id: ID;
  kind: string;
  title: string;
  body: string;
  customer_id: ID | null;
  appointment_id: ID | null;
  waitlist_id: ID | null;
  created_at: string;
}

export interface Invite {
  id: ID;
  phone: string;
  professional_id: ID | null;
}

export interface GoogleStatus {
  google_email: string | null;
  calendar_id: string;
  calendar_name: string | null;
  professional_id: ID | null;
  status: "connected" | "error";
  last_sync_at: string | null;
  last_error: string | null;
}

export interface Slot {
  starts_at: string;
  professional_id: ID;
}

export type ChangeEvent = { table: "activity"; row: Activity } | { table: "appointments" | "waitlist" | "customers" | "blocks" };

export interface ServiceInput {
  id?: ID;
  name: string;
  duration_min: number;
  buffer_min: number;
  price: number;
  approval: "auto" | "manual";
  active: boolean;
}

export interface ProfessionalInput {
  id?: ID;
  name: string;
  title: string;
  color: string;
  active: boolean;
  service_ids: ID[];
  hours: Range[];
  breaks: Range[];
}

export interface Backend {
  readonly mode: "supabase" | "preview";

  // Auth
  getUser(): Promise<SessionUser | null>;
  onAuthChange(cb: (u: SessionUser | null) => void): () => void;
  sendPhoneCode(phoneE164: string): Promise<void>;
  verifyPhoneCode(phoneE164: string, code: string): Promise<void>;
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;

  // Business & team
  memberships(): Promise<Membership[]>;
  claimInvites(): Promise<number>;
  createBusiness(input: { name: string; slug: string; phone: string; address: string }): Promise<Business>;
  updateBusiness(id: ID, patch: Partial<Omit<Business, "id">>): Promise<void>;
  catalogue(businessId: ID): Promise<Catalogue>;
  saveService(businessId: ID, input: ServiceInput): Promise<void>;
  saveProfessional(businessId: ID, input: ProfessionalInput): Promise<void>;
  invites(businessId: ID): Promise<Invite[]>;
  invite(businessId: ID, phone: string, professionalId: ID | null): Promise<void>;
  removeInvite(id: ID): Promise<void>;

  // Calendar
  appointments(businessId: ID, fromISO: string, toISO: string): Promise<Appointment[]>;
  appointment(id: ID): Promise<Appointment | null>;
  blocks(businessId: ID, fromISO: string, toISO: string): Promise<Block[]>;
  slots(businessId: ID, serviceId: ID, day: string, professionalId?: ID | null, excludeId?: ID): Promise<Slot[]>;
  createAppointment(input: { businessId: ID; serviceId: ID; professionalId: ID; customerId: ID; startsAt: string; note: string }): Promise<ID>;
  setStatus(id: ID, status: Exclude<ApptStatus, "cancelled">): Promise<void>;
  cancel(id: ID, reason: string): Promise<void>;
  reschedule(id: ID, startsAt: string, professionalId: ID): Promise<void>;
  addBlock(input: { businessId: ID; professionalId: ID; startsAt: string; endsAt: string; reason: string }): Promise<void>;
  removeBlock(id: ID): Promise<void>;

  // Customers
  customers(businessId: ID, q?: string): Promise<CustomerRow[]>;
  customer(id: ID): Promise<{ customer: Customer; appointments: Appointment[] } | null>;
  saveCustomer(businessId: ID, input: { id?: ID; full_name: string; phone: string; email?: string | null; notes?: string }): Promise<Customer>;

  // Waitlist
  waitlist(businessId: ID): Promise<WaitlistEntry[]>;
  addWaitlist(input: { businessId: ID; customerId: ID; serviceId: ID | null; professionalId: ID | null; dateFrom: string; dateTo: string; part: PartOfDay; note: string }): Promise<void>;
  setWaitlistStatus(id: ID, status: WaitStatus): Promise<void>;

  // Activity & live updates
  activity(businessId: ID, limit?: number): Promise<Activity[]>;
  subscribe(businessId: ID, cb: (e: ChangeEvent) => void): () => void;

  // Google Calendar (real in Supabase mode via /api, simulated in preview)
  googleStatus(businessId: ID): Promise<GoogleStatus | null>;
  googleConnect(businessId: ID): Promise<void>;
  googleCalendars(businessId: ID): Promise<{ id: string; name: string; primary: boolean }[]>;
  googleSelect(businessId: ID, calendarId: string, calendarName: string, professionalId: ID | null): Promise<void>;
  googleSync(businessId: ID): Promise<{ pushed: number; imported: number; failed: number }>;
  googleDisconnect(businessId: ID): Promise<void>;
  pushToGoogle(appointmentId: ID): void;

  // Online booking (customer side)
  publicCatalogue(slug: string): Promise<Catalogue | null>;
  bookOnline(input: { businessId: ID; serviceId: ID; professionalId: ID | null; startsAt: string; fullName: string; phone: string; note: string }): Promise<ID>;
  joinWaitlist(input: { businessId: ID; serviceId: ID; professionalId: ID | null; dateFrom: string; dateTo: string; part: PartOfDay; fullName: string; phone: string; note: string }): Promise<ID>;
  myAppointments(businessId: ID): Promise<Appointment[]>;
}

export class BackendError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}
