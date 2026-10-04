/**
 * Beautigo domain model.
 * Money is stored in shekels (integers or .5 steps). Instants are ISO strings (UTC).
 * Working hours are minutes from local midnight in Asia/Jerusalem.
 */

export type ID = string;

export type CategoryId = "barber" | "hair" | "stylist" | "blowdry" | "nails" | "makeup" | "brows" | "skincare";

export interface City {
  id: ID;
  name: string;
  lat: number;
  lng: number;
  active: boolean;
}

export type Role = "customer" | "business" | "staff" | "admin";

export interface User {
  id: ID;
  name: string;
  username: string;
  avatar?: string;
  role: Role;
  /** Business owned (role business) or employing (role staff). */
  businessId?: ID;
  /** Staff member profile linked to this login (role staff). */
  professionalId?: ID;
  cityId?: ID;
  interests: CategoryId[];
  followingBusinesses: ID[];
  followingPros: ID[];
  blockedUserIds: ID[];
  blockedBusinessIds: ID[];
  phone?: string;
  email?: string;
  status: "active" | "suspended";
  isDemo: boolean;
  createdAt: string;
  privacy: { privateSaves: boolean; showFollowing: boolean; allowMessagesFromBusinesses: boolean };
}

export interface WorkingRange {
  weekday: number; // 0=Sunday..6=Saturday
  start: number; // minutes from midnight
  end: number;
}

export interface Business {
  id: ID;
  name: string;
  username: string;
  description: string;
  categories: CategoryId[];
  cityId: ID;
  address: string;
  /** Mobile businesses serve these cities (in addition to cityId). */
  serviceAreaCityIds: ID[];
  isMobile: boolean;
  cover: string;
  avatar: string;
  ownerId: ID;
  status: "pending" | "active" | "suspended";
  statusReason?: string;
  isDemo: boolean;
  phone: string;
  openingHours: WorkingRange[];
  policy: {
    cancelHours: number;
    /** Manual-approval requests expire after this many hours and release the slot. */
    requestExpiryHours: number;
    /** Unpaid deposits release the slot after this many minutes. */
    paymentHoldMinutes: number;
    text: string;
  };
  pinnedPostIds: ID[];
  quickReplies: string[];
  calendar: GoogleCalendarState;
  createdAt: string;
}

export interface GoogleCalendarState {
  status: "disconnected" | "connected" | "error";
  accountEmail?: string;
  calendarId?: string;
  calendarName?: string;
  lastSyncAt?: string;
  lastError?: string;
  /** Demo switch: makes the next simulated sync fail. */
  simulateFailure?: boolean;
}

export interface Professional {
  id: ID;
  businessId: ID;
  name: string;
  title: string;
  specialties: string[];
  avatar: string;
  serviceIds: ID[];
  workingHours: WorkingRange[];
  breaks: WorkingRange[];
  active: boolean;
}

export type ApprovalMode = "auto" | "manual";
export type PaymentMode = "at_business" | "deposit";

export interface Service {
  id: ID;
  businessId: ID;
  name: string;
  description: string;
  category: CategoryId;
  durationMin: number;
  bufferMin: number;
  price: number;
  priceFrom: boolean;
  approval: ApprovalMode;
  payment: PaymentMode;
  deposit: { type: "fixed" | "percent"; value: number };
  active: boolean;
  image?: string;
}

export interface MediaItem {
  type: "video" | "image";
  /** URL (public/media/…) or "idb:<key>" for uploads stored in IndexedDB. */
  src: string;
  /** Alternate encodings for browsers without H.264. */
  srcWebm?: string;
  poster?: string;
  /** Playback window chosen in the composer (seconds). The file itself is not re-encoded. */
  trimStart?: number;
  trimEnd?: number;
  /** Where the media comes from (license/source note). */
  source: string;
  /** Provenance for imported media: the original post and the owner's profile. Never guessed. */
  sourceReelUrl?: string;
  sourceProfileUrl?: string;
  /** Credited creator, only when verified. */
  creator?: string;
  /** Look applied at playback (CSS filter preset id). Recorded camera clips have it baked in. */
  filter?: string;
  /** Text stickers placed in the editor, positioned in % of the frame. */
  overlays?: TextOverlay[];
}

export interface TextOverlay {
  id: ID;
  text: string;
  x: number;
  y: number;
  style: "plain" | "box" | "outline";
  color: string;
}

/** 24-hour story. Owner sees who viewed it; viewers can reply (goes to messages) or book. */
export interface Story {
  id: ID;
  businessId: ID;
  media: MediaItem;
  createdAt: string;
  expiresAt: string;
  /** Optional call to action */
  serviceId?: ID;
  /** Shared post shown as a card in the story */
  sharedPostId?: ID;
  viewers: { userId: ID; at: string }[];
  likedBy: ID[];
  isSample: boolean;
}

export type PostKind = "reel" | "image" | "carousel";

export interface Post {
  id: ID;
  businessId: ID;
  kind: PostKind;
  media: MediaItem[];
  cover?: string;
  caption: string;
  /** Burned-in style subtitle shown when the captions preference is on. */
  subtitle?: string;
  tags: string[];
  cityId: ID;
  serviceId?: ID;
  professionalId?: ID;
  status: "draft" | "published" | "hidden";
  hiddenReason?: string;
  likedBy: ID[];
  savedCount: number;
  views: number;
  shares: number;
  createdAt: string;
  publishedAt?: string;
  isSample: boolean;
}

export interface Comment {
  id: ID;
  postId: ID;
  userId: ID;
  text: string;
  createdAt: string;
  hidden: boolean;
  /** Reply to another comment (one level, like Instagram) */
  parentId?: ID;
  likedBy?: ID[];
  pinned?: boolean;
}

export interface Collection {
  id: ID;
  userId: ID;
  name: string;
  postIds: ID[];
  createdAt: string;
}

export type AppointmentStatus =
  | "pending_approval"
  | "pending_payment"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "rejected"
  | "no_show";

export interface AppointmentSnapshot {
  serviceName: string;
  price: number;
  priceFrom: boolean;
  durationMin: number;
  bufferMin: number;
  approval: ApprovalMode;
  payment: PaymentMode;
  deposit: number;
  cancelHours: number;
  policyText: string;
  address: string;
}

export interface Appointment {
  id: ID;
  businessId: ID;
  customerId?: ID;
  /** Manual bookings by phone. */
  guestName?: string;
  guestPhone?: string;
  professionalId: ID;
  serviceId: ID;
  snapshot: AppointmentSnapshot;
  start: string;
  end: string;
  status: AppointmentStatus;
  /** When a pending hold (approval/payment) is released if nothing happens. */
  holdExpiresAt?: string;
  cancelReason?: string;
  cancelledBy?: "customer" | "business" | "admin" | "system";
  sourcePostId?: ID;
  inspirationPostIds: ID[];
  note?: string;
  businessNote?: string;
  payment: { status: "none" | "paid_demo" | "failed_demo"; amount: number };
  history: { at: string; by: string; action: string; detail?: string }[];
  calendarEventId?: string;
  createdAt: string;
  createdBy: "customer" | "business";
}

export interface BlockedTime {
  id: ID;
  businessId: ID;
  professionalId: ID;
  start: string;
  end: string;
  reason: string;
}

export interface Review {
  id: ID;
  appointmentId: ID;
  businessId: ID;
  professionalId: ID;
  customerId: ID;
  rating: number;
  text: string;
  photo?: string;
  reply?: { text: string; at: string };
  hidden: boolean;
  hiddenReason?: string;
  createdAt: string;
  isSample: boolean;
}

export interface Message {
  id: ID;
  senderId: ID;
  text: string;
  attachmentPostId?: ID;
  createdAt: string;
}

export interface Conversation {
  id: ID;
  customerId: ID;
  businessId: ID;
  appointmentId?: ID;
  messages: Message[];
  lastReadAt: Record<ID, string>;
  blockedBy?: ID;
  createdAt: string;
}

export type NotificationCategory = "appointments" | "messages" | "social" | "business";

export interface Notification {
  id: ID;
  userId: ID;
  category: NotificationCategory;
  title: string;
  body: string;
  link?: string;
  createdAt: string;
  read: boolean;
}

export type ReportTarget = "post" | "comment" | "review" | "business" | "user" | "conversation";

export interface Report {
  id: ID;
  reporterId: ID;
  targetType: ReportTarget;
  targetId: ID;
  reason: string;
  details: string;
  status: "open" | "resolved" | "dismissed";
  resolution?: string;
  resolvedBy?: ID;
  createdAt: string;
}

export interface Campaign {
  id: ID;
  businessId: ID;
  postId: ID;
  cityIds: ID[];
  budget: number;
  start: string;
  end: string;
  status: "active" | "paused" | "ended";
  metrics: { impressions: number; clicks: number; bookings: number };
  createdAt: string;
}

export interface PaymentRecord {
  id: ID;
  appointmentId: ID;
  businessId: ID;
  customerId: ID;
  amount: number;
  status: "succeeded_demo" | "failed_demo" | "refunded_demo";
  createdAt: string;
}

export interface AuditEntry {
  id: ID;
  actorId: ID;
  action: string;
  targetType: string;
  targetId: ID;
  reason: string;
  createdAt: string;
}

export interface IntegrationEvent {
  id: ID;
  businessId: ID;
  integration: "google_calendar" | "payments";
  level: "error" | "info";
  message: string;
  createdAt: string;
  resolved: boolean;
}

export type TrafficSource = "feed" | "following" | "nearby" | "discover" | "profile" | "story" | "share" | "tag";

export interface AnalyticsEvent {
  id: ID;
  type: "view" | "profile_visit" | "booking_start" | "watch" | "story_view" | "share" | "follow";
  businessId: ID;
  postId?: ID;
  storyId?: ID;
  /** watch: seconds watched in this view, and whether it reached the end */
  seconds?: number;
  completed?: boolean;
  source?: TrafficSource;
  at: string;
}

export interface DB {
  version: number;
  cities: City[];
  users: User[];
  businesses: Business[];
  professionals: Professional[];
  services: Service[];
  posts: Post[];
  stories: Story[];
  comments: Comment[];
  collections: Collection[];
  appointments: Appointment[];
  blockedTimes: BlockedTime[];
  reviews: Review[];
  conversations: Conversation[];
  notifications: Notification[];
  reports: Report[];
  campaigns: Campaign[];
  payments: PaymentRecord[];
  audit: AuditEntry[];
  integrationEvents: IntegrationEvent[];
  analytics: AnalyticsEvent[];
}
