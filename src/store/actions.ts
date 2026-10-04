import type { Business, CategoryId, DB, ID, MediaItem, Post, PostKind, Professional, ReportTarget, Service, Story, TrafficSource, User } from "../domain/types";
import { assert, can, isAdmin, PermissionError } from "../domain/permissions";
import * as booking from "../domain/booking";
import { uid } from "../domain/ids";
import { notify } from "../domain/notify";
import { mutate, toast, useApp } from "./app";
import { calendarAdapter } from "../integrations/googleCalendar";
import { repository } from "../data/repository";

const nowISO = () => new Date().toISOString();

function requireUser(u: User | null): User {
  if (!u) throw new PermissionError("יש להתחבר כדי להמשיך");
  if (u.status !== "active") throw new PermissionError("החשבון מושעה");
  return u;
}

function ownBusiness(db: DB, u: User | null): Business {
  const user = requireUser(u);
  const b = db.businesses.find((x) => x.id === user.businessId);
  assert(!!b && user.role === "business", "רק בעל העסק יכול לבצע פעולה זו");
  return b!;
}

function audit(db: DB, actor: User, action: string, targetType: string, targetId: ID, reason: string) {
  db.audit.unshift({ id: uid("au"), actorId: actor.id, action, targetType, targetId, reason, createdAt: nowISO() });
}

/* ---------------- Session (demo only — not authentication) ---------------- */

export function signInAs(userId: ID | null) {
  useApp.setState((s) => ({ userId, viewMode: "business", welcomed: true, feedIndex: { ...s.feedIndex } }));
}

export function registerCustomer(input: { name: string; phone: string; cityId: ID | null; interests: CategoryId[] }) {
  return mutate((db) => {
    const id = uid("u");
    const u: User = {
      id,
      name: input.name.trim(),
      username: `user${db.users.length + 1}`,
      role: "customer",
      phone: input.phone,
      cityId: input.cityId ?? undefined,
      interests: input.interests,
      followingBusinesses: [],
      followingPros: [],
      blockedUserIds: [],
      blockedBusinessIds: [],
      status: "active",
      isDemo: true,
      createdAt: nowISO(),
      privacy: { privateSaves: false, showFollowing: true, allowMessagesFromBusinesses: true },
    };
    db.users.push(u);
    return u;
  });
}

export function updateProfile(patch: Partial<Pick<User, "name" | "cityId" | "interests" | "privacy">>) {
  return mutate((db, u) => {
    const me = requireUser(u);
    const user = db.users.find((x) => x.id === me.id)!;
    if (patch.name !== undefined && patch.name.trim().length < 2) throw new Error("נא להזין שם");
    Object.assign(user, patch, patch.name !== undefined ? { name: patch.name.trim() } : {});
  });
}

/* ---------------- Social ---------------- */

export function toggleLike(postId: ID) {
  return mutate((db, u) => {
    const me = requireUser(u);
    assert(can.interact(me));
    const p = db.posts.find((x) => x.id === postId)!;
    const on = !p.likedBy.includes(me.id);
    p.likedBy = on ? [...p.likedBy, me.id] : p.likedBy.filter((x) => x !== me.id);
    if (on) {
      const owner = db.businesses.find((b) => b.id === p.businessId)?.ownerId;
      if (owner && owner !== me.id) notify(db, owner, "social", "לייק חדש", `${me.name} אהב/ה את ${p.caption.slice(0, 40)}`, `/post/${p.id}`);
    }
    return on;
  });
}

export function toggleFollowBusiness(businessId: ID) {
  return mutate((db, u) => {
    const me = requireUser(u);
    assert(can.interact(me));
    const user = db.users.find((x) => x.id === me.id)!;
    const on = !user.followingBusinesses.includes(businessId);
    user.followingBusinesses = on ? [...user.followingBusinesses, businessId] : user.followingBusinesses.filter((x) => x !== businessId);
    if (on) {
      notify(db, db.businesses.find((b) => b.id === businessId)?.ownerId, "social", "עוקב/ת חדש/ה", `${me.name} התחיל/ה לעקוב`, "/manage/analytics");
      db.analytics.push({ id: uid("ev"), type: "follow", businessId, at: nowISO() });
    }
    return on;
  });
}

export function toggleFollowPro(proId: ID) {
  return mutate((db, u) => {
    const me = requireUser(u);
    assert(can.interact(me));
    const user = db.users.find((x) => x.id === me.id)!;
    const on = !user.followingPros.includes(proId);
    user.followingPros = on ? [...user.followingPros, proId] : user.followingPros.filter((x) => x !== proId);
    return on;
  });
}

export function isSaved(db: DB, userId: ID | null, postId: ID) {
  return !!userId && db.collections.some((c) => c.userId === userId && c.postIds.includes(postId));
}

/** Saving puts the post in "שמורים" (default collection) or a named collection. */
export function savePost(postId: ID, collectionId?: ID | "new", newName?: string) {
  return mutate((db, u) => {
    const me = requireUser(u);
    assert(can.interact(me));
    let col = collectionId && collectionId !== "new" ? db.collections.find((c) => c.id === collectionId && c.userId === me.id) : undefined;
    if (collectionId === "new") {
      const name = (newName ?? "").trim();
      if (!name) throw new Error("נא לתת שם לאוסף");
      col = { id: uid("col"), userId: me.id, name, postIds: [], createdAt: nowISO() };
      db.collections.push(col);
    }
    if (!col) {
      col = db.collections.find((c) => c.userId === me.id && c.name === "שמורים");
      if (!col) {
        col = { id: uid("col"), userId: me.id, name: "שמורים", postIds: [], createdAt: nowISO() };
        db.collections.unshift(col);
      }
    }
    if (!col.postIds.includes(postId)) {
      col.postIds.unshift(postId);
      const p = db.posts.find((x) => x.id === postId);
      if (p) p.savedCount++;
    }
    return col;
  });
}

export function unsavePost(postId: ID, collectionId?: ID) {
  return mutate((db, u) => {
    const me = requireUser(u);
    for (const c of db.collections.filter((c) => c.userId === me.id && (!collectionId || c.id === collectionId))) {
      if (c.postIds.includes(postId)) {
        c.postIds = c.postIds.filter((x) => x !== postId);
        const p = db.posts.find((x) => x.id === postId);
        if (p && p.savedCount > 0) p.savedCount--;
      }
    }
  });
}

export function renameCollection(id: ID, name: string) {
  return mutate((db, u) => {
    const me = requireUser(u);
    const c = db.collections.find((x) => x.id === id && x.userId === me.id);
    if (!c) throw new Error("האוסף לא נמצא");
    if (!name.trim()) throw new Error("נא לתת שם לאוסף");
    c.name = name.trim();
  });
}

export function deleteCollection(id: ID) {
  return mutate((db, u) => {
    const me = requireUser(u);
    db.collections = db.collections.filter((c) => !(c.id === id && c.userId === me.id));
  });
}

export function addComment(postId: ID, text: string, parentId?: ID) {
  return mutate((db, u) => {
    const me = requireUser(u);
    assert(can.interact(me));
    const t = text.trim();
    if (!t) throw new Error("התגובה ריקה");
    if (t.length > 500) throw new Error("עד 500 תווים");
    // Replies are one level deep, like Instagram: replying to a reply attaches to its parent
    const parent = parentId ? db.comments.find((c) => c.id === parentId && c.postId === postId) : undefined;
    const c = { id: uid("c"), postId, userId: me.id, text: t, createdAt: nowISO(), hidden: false, parentId: parent ? (parent.parentId ?? parent.id) : undefined, likedBy: [] as ID[] };
    db.comments.push(c);
    const p = db.posts.find((x) => x.id === postId)!;
    const owner = db.businesses.find((b) => b.id === p.businessId)?.ownerId;
    if (owner !== me.id) notify(db, owner, "social", "תגובה חדשה", `${me.name}: ${t.slice(0, 60)}`, `/post/${postId}`);
    if (parent && parent.userId !== me.id) notify(db, parent.userId, "social", `${me.name} הגיב/ה לך`, t.slice(0, 60), `/post/${postId}`);
    // @mentions notify the mentioned account
    for (const handle of new Set([...t.matchAll(/@([a-z0-9._]{3,30})/gi)].map((m) => m[1].toLowerCase()))) {
      const user = db.users.find((x) => x.username === handle);
      const biz = db.businesses.find((x) => x.username === handle);
      const target = user?.id ?? biz?.ownerId;
      if (target && target !== me.id) notify(db, target, "social", `${me.name} תייג/ה אותך`, t.slice(0, 60), `/post/${postId}`);
    }
    return c;
  });
}

export function toggleCommentLike(commentId: ID) {
  return mutate((db, u) => {
    const me = requireUser(u);
    assert(can.interact(me));
    const c = db.comments.find((x) => x.id === commentId)!;
    const likes = c.likedBy ?? [];
    c.likedBy = likes.includes(me.id) ? likes.filter((x) => x !== me.id) : [...likes, me.id];
    return c.likedBy.includes(me.id);
  });
}

/** The post's business can pin one comment to the top. */
export function togglePinComment(commentId: ID) {
  return mutate((db, u) => {
    const c = db.comments.find((x) => x.id === commentId)!;
    const p = db.posts.find((x) => x.id === c.postId)!;
    assert(can.editPost(u, p), "רק העסק יכול לנעוץ תגובה");
    const was = !!c.pinned;
    for (const x of db.comments.filter((x) => x.postId === c.postId)) x.pinned = false;
    c.pinned = !was;
    return c.pinned;
  });
}

/* ---------------- Stories (24h) ---------------- */

export const isLive = (s: Story, now = Date.now()) => Date.parse(s.expiresAt) > now;

export function createStory(input: { media: MediaItem; serviceId?: ID; sharedPostId?: ID }) {
  return mutate((db, u) => {
    const b = ownBusiness(db, u);
    if (input.serviceId) assert(db.services.some((s) => s.id === input.serviceId && s.businessId === b.id), "השירות לא שייך לעסק");
    if (input.sharedPostId) assert(db.posts.some((p) => p.id === input.sharedPostId && p.status === "published"), "אפשר לשתף רק פוסט מפורסם");
    const created = new Date();
    const st: Story = { id: uid("st"), businessId: b.id, media: input.media, createdAt: created.toISOString(), expiresAt: new Date(created.getTime() + 24 * 3600_000).toISOString(), serviceId: input.serviceId, sharedPostId: input.sharedPostId, viewers: [], likedBy: [], isSample: false };
    db.stories.push(st);
    return st;
  });
}

export function deleteStory(id: ID) {
  return mutate((db, u) => {
    const st = db.stories.find((x) => x.id === id)!;
    assert(can.manageBusiness(u, st.businessId), "רק העסק יכול למחוק את הסטורי");
    db.stories = db.stories.filter((x) => x.id !== id);
  });
}

/** Marks a story as seen by the signed-in viewer (owners viewing their own don't count). */
export function viewStory(id: ID) {
  mutate(
    (db, u) => {
      const st = db.stories.find((x) => x.id === id);
      if (!st || !u) return;
      const ownerId = db.businesses.find((b) => b.id === st.businessId)?.ownerId;
      if (u.id === ownerId || st.viewers.some((v) => v.userId === u.id)) return;
      st.viewers.push({ userId: u.id, at: nowISO() });
      db.analytics.push({ id: uid("ev"), type: "story_view", businessId: st.businessId, storyId: st.id, at: nowISO() });
    },
    { silent: true },
  );
}

export function toggleStoryLike(id: ID) {
  return mutate((db, u) => {
    const me = requireUser(u);
    assert(can.interact(me));
    const st = db.stories.find((x) => x.id === id)!;
    st.likedBy = st.likedBy.includes(me.id) ? st.likedBy.filter((x) => x !== me.id) : [...st.likedBy, me.id];
    return st.likedBy.includes(me.id);
  });
}

/** Story replies arrive in the business's messages, with the story as context. */
export function replyToStory(id: ID, text: string) {
  return mutate((db, u) => {
    const me = requireUser(u);
    assert(me.role === "customer", "תגובה לסטורי נשלחת מחשבון לקוח");
    if (!text.trim()) throw new Error("ההודעה ריקה");
    const st = db.stories.find((x) => x.id === id)!;
    let c = db.conversations.find((x) => x.customerId === me.id && x.businessId === st.businessId);
    if (!c) {
      c = { id: uid("cv"), customerId: me.id, businessId: st.businessId, messages: [], lastReadAt: {}, createdAt: nowISO() };
      db.conversations.unshift(c);
    }
    if (c.blockedBy) throw new Error("השיחה חסומה");
    c.messages.push({ id: uid("m"), senderId: me.id, text: `↩︎ הגיב/ה לסטורי: ${text.trim()}`, attachmentPostId: st.sharedPostId, createdAt: nowISO() });
    c.lastReadAt[me.id] = nowISO();
    const b = db.businesses.find((x) => x.id === st.businessId)!;
    notify(db, b.ownerId, "messages", `${me.name} הגיב/ה לסטורי`, text.slice(0, 80), `/messages/${c.id}`);
    return c.id;
  });
}

export function report(targetType: ReportTarget, targetId: ID, reason: string, details = "") {
  return mutate((db, u) => {
    const me = requireUser(u);
    if (!reason) throw new Error("בחרו סיבה");
    db.reports.unshift({ id: uid("rp"), reporterId: me.id, targetType, targetId, reason, details, status: "open", createdAt: nowISO() });
  });
}

export function blockBusiness(businessId: ID, on = true) {
  return mutate((db, u) => {
    const me = requireUser(u);
    const user = db.users.find((x) => x.id === me.id)!;
    user.blockedBusinessIds = on ? [...new Set([...user.blockedBusinessIds, businessId])] : user.blockedBusinessIds.filter((x) => x !== businessId);
    if (on) user.followingBusinesses = user.followingBusinesses.filter((x) => x !== businessId);
  });
}

export function blockUser(userId: ID, on = true) {
  return mutate((db, u) => {
    const me = requireUser(u);
    const user = db.users.find((x) => x.id === me.id)!;
    user.blockedUserIds = on ? [...new Set([...user.blockedUserIds, userId])] : user.blockedUserIds.filter((x) => x !== userId);
  });
}

export function trackEvent(type: "view" | "profile_visit" | "booking_start" | "share" | "follow", businessId: ID, postId?: ID, source?: TrafficSource) {
  mutate(
    (db) => {
      db.analytics.push({ id: uid("ev"), type, businessId, postId, source, at: nowISO() });
      if (type === "view" && postId) {
        const p = db.posts.find((x) => x.id === postId);
        if (p) p.views++;
      }
    },
    { silent: true },
  );
}

/** One watch session of a reel: seconds watched and whether it reached the end. */
export function trackWatch(businessId: ID, postId: ID, seconds: number, completed: boolean, source: TrafficSource) {
  if (seconds < 0.5) return;
  mutate(
    (db) => {
      db.analytics.push({ id: uid("w"), type: "watch", businessId, postId, seconds: Math.round(seconds * 10) / 10, completed, source, at: nowISO() });
    },
    { silent: true },
  );
}

export function sharePostCount(postId: ID) {
  mutate(
    (db) => {
      const p = db.posts.find((x) => x.id === postId);
      if (p) p.shares++;
    },
    { silent: true },
  );
}

/* ---------------- Booking (customer) ---------------- */

export function book(input: Omit<booking.BookingInput, "customer">) {
  return mutate((db, u) => {
    const me = requireUser(u);
    assert(can.book(me), "רק חשבון לקוח יכול לקבוע תור");
    return booking.createBooking(db, { ...input, customer: me });
  });
}

export function payDeposit(appointmentId: ID, outcome: "success" | "failure") {
  return mutate((db, u) => booking.payDeposit(db, appointmentId, requireUser(u).id, outcome));
}

export function cancelAsCustomer(appointmentId: ID, reason: string) {
  return mutate((db, u) => booking.cancel(db, appointmentId, { id: requireUser(u).id, kind: "customer" }, reason));
}

export function rescheduleAsCustomer(appointmentId: ID, start: string) {
  return mutate((db, u) => booking.reschedule(db, appointmentId, { id: requireUser(u).id, kind: "customer" }, { start }));
}

export function attachInspiration(appointmentId: ID, postIds: ID[]) {
  return mutate((db, u) => {
    const me = requireUser(u);
    const a = booking.mustGet(db, appointmentId);
    assert(a.customerId === me.id);
    a.inspirationPostIds = postIds.slice(0, 6);
  });
}

/* ---------------- Reviews ---------------- */

export function canReview(db: DB, userId: ID | null, appointmentId: ID) {
  const a = db.appointments.find((x) => x.id === appointmentId);
  return !!a && a.customerId === userId && a.status === "completed" && !db.reviews.some((r) => r.appointmentId === appointmentId);
}

export function submitReview(appointmentId: ID, input: { rating: number; text: string; photo?: string }) {
  return mutate((db, u) => {
    const me = requireUser(u);
    const a = booking.mustGet(db, appointmentId);
    if (a.customerId !== me.id) throw new PermissionError("אפשר לדרג רק תור שלך");
    if (a.status !== "completed") throw new Error("אפשר לכתוב ביקורת רק אחרי טיפול שהושלם");
    if (db.reviews.some((r) => r.appointmentId === a.id)) throw new Error("כבר כתבת ביקורת על התור הזה");
    if (input.rating < 1 || input.rating > 5) throw new Error("בחרו דירוג בין 1 ל־5");
    const r = { id: uid("rv"), appointmentId: a.id, businessId: a.businessId, professionalId: a.professionalId, customerId: me.id, rating: input.rating, text: input.text.trim(), photo: input.photo, hidden: false, createdAt: nowISO(), isSample: false };
    db.reviews.unshift(r);
    notify(db, db.businesses.find((b) => b.id === a.businessId)?.ownerId, "business", "ביקורת חדשה", `${me.name} נתן/ה ${input.rating} כוכבים`, "/manage/reviews");
    return r;
  });
}

export function replyToReview(reviewId: ID, text: string) {
  return mutate((db, u) => {
    const r = db.reviews.find((x) => x.id === reviewId)!;
    assert(can.replyToReview(u, r.businessId), "רק העסק יכול להגיב לביקורת");
    if (!text.trim()) throw new Error("התגובה ריקה");
    r.reply = { text: text.trim(), at: nowISO() };
    notify(db, r.customerId, "appointments", "העסק הגיב לביקורת שלך", text.slice(0, 60), `/b/${r.businessId}?tab=reviews`);
  });
}

/* ---------------- Messages ---------------- */

export function openConversation(businessId: ID, appointmentId?: ID) {
  return mutate((db, u) => {
    const me = requireUser(u);
    assert(me.role === "customer", "שיחות נפתחות מחשבון לקוח");
    let c = db.conversations.find((x) => x.customerId === me.id && x.businessId === businessId);
    if (!c) {
      c = { id: uid("cv"), customerId: me.id, businessId, appointmentId, messages: [], lastReadAt: {}, createdAt: nowISO() };
      db.conversations.unshift(c);
    } else if (appointmentId) c.appointmentId = appointmentId;
    return c.id;
  });
}

export function conversationAccess(db: DB, u: User | null, conversationId: ID) {
  const c = db.conversations.find((x) => x.id === conversationId);
  if (!c || !u) return null;
  if (c.customerId === u.id) return c;
  if (u.role === "business" && u.businessId === c.businessId) return c;
  return null;
}

export function sendMessage(conversationId: ID, text: string, attachmentPostId?: ID) {
  return mutate((db, u) => {
    const me = requireUser(u);
    const c = conversationAccess(db, me, conversationId);
    assert(!!c, "אין גישה לשיחה הזו");
    if (c!.blockedBy) throw new Error("השיחה חסומה");
    if (!text.trim() && !attachmentPostId) throw new Error("ההודעה ריקה");
    c!.messages.push({ id: uid("m"), senderId: me.id, text: text.trim(), attachmentPostId, createdAt: nowISO() });
    c!.lastReadAt[me.id] = nowISO();
    const b = db.businesses.find((x) => x.id === c!.businessId)!;
    const to = me.id === c!.customerId ? b.ownerId : c!.customerId;
    notify(db, to, "messages", me.id === c!.customerId ? `הודעה מ${me.name}` : `הודעה מ${b.name}`, text.slice(0, 80) || "צירף/ה השראה", `/messages/${c!.id}`);
  });
}

export function markConversationRead(conversationId: ID) {
  mutate(
    (db, u) => {
      const c = conversationAccess(db, u, conversationId);
      if (c && u) c.lastReadAt[u.id] = nowISO();
    },
    { silent: true },
  );
}

export function blockConversation(conversationId: ID, on: boolean) {
  return mutate((db, u) => {
    const me = requireUser(u);
    const c = conversationAccess(db, me, conversationId);
    assert(!!c);
    c!.blockedBy = on ? me.id : undefined;
  });
}

export function markNotificationsRead(ids?: ID[]) {
  mutate(
    (db, u) => {
      for (const n of db.notifications) if (n.userId === u?.id && (!ids || ids.includes(n.id))) n.read = true;
    },
    { silent: true },
  );
}

/* ---------------- Business: content ---------------- */

export interface PostInput {
  kind: PostKind;
  media: MediaItem[];
  cover?: string;
  caption: string;
  subtitle?: string;
  tags: string[];
  cityId: ID;
  serviceId?: ID;
  professionalId?: ID;
}

export function validatePost(input: PostInput, publish: boolean) {
  const errors: string[] = [];
  if (!input.media.length) errors.push("בחרו מדיה");
  if (input.kind === "reel" && input.media[0]?.type !== "video") errors.push("רילס חייב להיות סרטון");
  if (input.kind === "image" && (input.media.length !== 1 || input.media[0].type !== "image")) errors.push("פוסט תמונה מכיל תמונה אחת");
  if (input.kind === "carousel" && (input.media.length < 2 || input.media.length > 10)) errors.push("קרוסלה מכילה 2–10 פריטים");
  if (publish && !input.caption.trim()) errors.push("נא לכתוב כיתוב");
  if (input.caption.length > 600) errors.push("הכיתוב ארוך מדי");
  if (publish && !input.cityId) errors.push("בחרו עיר או סניף");
  return errors;
}

export function savePostDraftOrPublish(input: PostInput, publish: boolean, existingId?: ID) {
  return mutate((db, u) => {
    const b = ownBusiness(db, u);
    assert(can.createContent(u), "רק עסקים יכולים לפרסם תוכן");
    const errors = validatePost(input, publish);
    if (errors.length) throw new Error(errors[0]);
    if (input.serviceId) assert(db.services.some((s) => s.id === input.serviceId && s.businessId === b.id), "השירות לא שייך לעסק");
    if (input.professionalId) assert(db.professionals.some((p) => p.id === input.professionalId && p.businessId === b.id), "איש הצוות לא שייך לעסק");
    let p = existingId ? db.posts.find((x) => x.id === existingId) : undefined;
    if (p) assert(can.editPost(u, p));
    if (!p) {
      p = { id: uid("post"), businessId: b.id, kind: input.kind, media: [], caption: "", tags: [], cityId: b.cityId, status: "draft", likedBy: [], savedCount: 0, views: 0, shares: 0, createdAt: nowISO(), isSample: false };
      db.posts.unshift(p);
    }
    Object.assign(p, {
      kind: input.kind,
      media: input.media,
      cover: input.cover ?? input.media[0]?.poster ?? input.media[0]?.src,
      caption: input.caption.trim(),
      subtitle: input.subtitle?.trim() || undefined,
      tags: input.tags,
      cityId: input.cityId,
      serviceId: input.serviceId || undefined,
      professionalId: input.professionalId || undefined,
    });
    if (publish && p.status !== "hidden") {
      if (p.status !== "published") p.publishedAt = nowISO();
      p.status = "published";
      for (const f of db.users.filter((x) => x.followingBusinesses.includes(b.id)))
        notify(db, f.id, "social", `${b.name} פרסמו ${p.kind === "reel" ? "רילס" : "פוסט"} חדש`, p.caption.slice(0, 60), `/post/${p.id}`);
    } else if (!publish && p.status !== "hidden") {
      p.status = "draft";
    }
    return p;
  });
}

export function updatePostMeta(postId: ID, patch: Partial<Pick<Post, "caption" | "tags" | "serviceId" | "professionalId" | "cityId" | "subtitle">>) {
  return mutate((db, u) => {
    const p = db.posts.find((x) => x.id === postId)!;
    assert(can.editPost(u, p));
    Object.assign(p, patch);
  });
}

export function setPostPublished(postId: ID, published: boolean) {
  return mutate((db, u) => {
    const p = db.posts.find((x) => x.id === postId)!;
    assert(can.editPost(u, p));
    if (p.status === "hidden") throw new Error("התוכן הוסתר על ידי צוות Beautigo");
    p.status = published ? "published" : "draft";
    if (published && !p.publishedAt) p.publishedAt = nowISO();
  });
}

export function deletePost(postId: ID) {
  return mutate((db, u) => {
    const p = db.posts.find((x) => x.id === postId)!;
    assert(can.editPost(u, p));
    db.posts = db.posts.filter((x) => x.id !== postId);
    for (const c of db.collections) c.postIds = c.postIds.filter((x) => x !== postId);
    for (const b of db.businesses) b.pinnedPostIds = b.pinnedPostIds.filter((x) => x !== postId);
    return p;
  });
}

export function togglePin(postId: ID) {
  return mutate((db, u) => {
    const b = ownBusiness(db, u);
    b.pinnedPostIds = b.pinnedPostIds.includes(postId) ? b.pinnedPostIds.filter((x) => x !== postId) : [postId, ...b.pinnedPostIds].slice(0, 3);
  });
}

/* ---------------- Business: profile, services, staff ---------------- */

export function updateBusiness(patch: Partial<Business>) {
  return mutate((db, u) => {
    const b = ownBusiness(db, u);
    if (patch.name !== undefined && patch.name.trim().length < 2) throw new Error("שם העסק קצר מדי");
    if (patch.username !== undefined) {
      const un = patch.username.trim().toLowerCase();
      if (!/^[a-z0-9._]{3,30}$/.test(un)) throw new Error("שם משתמש: 3–30 תווים באנגלית, ספרות, נקודה או קו תחתון");
      if (db.businesses.some((x) => x.username === un && x.id !== b.id)) throw new Error("שם המשתמש תפוס");
      patch.username = un;
    }
    const { id: _id, ownerId: _o, status: _s, isDemo: _d, ...safe } = patch;
    void _id;
    void _o;
    void _s;
    void _d;
    Object.assign(b, safe);
  });
}

export function upsertService(input: Partial<Service> & { name: string }) {
  return mutate((db, u) => {
    const b = ownBusiness(db, u);
    if (input.name.trim().length < 2) throw new Error("נא להזין שם שירות");
    if (!input.durationMin || input.durationMin < 5) throw new Error("משך לא תקין");
    if (input.price == null || input.price < 0) throw new Error("מחיר לא תקין");
    if (input.payment === "deposit" && (!input.deposit || input.deposit.value <= 0)) throw new Error("הגדירו סכום מקדמה");
    if (input.deposit?.type === "percent" && input.deposit.value > 100) throw new Error("מקדמה באחוזים עד 100%");
    let s = input.id ? db.services.find((x) => x.id === input.id && x.businessId === b.id) : undefined;
    if (!s) {
      s = { id: uid("svc"), businessId: b.id, name: "", description: "", category: b.categories[0], durationMin: 60, bufferMin: 0, price: 0, priceFrom: false, approval: "auto", payment: "at_business", deposit: { type: "fixed", value: 0 }, active: true };
      db.services.push(s);
    }
    // Existing appointments keep their snapshot — only future bookings use the new values.
    Object.assign(s, { ...input, id: s.id, businessId: b.id, name: input.name.trim() });
    return s;
  });
}

export function upsertProfessional(input: Partial<Professional> & { name: string }) {
  return mutate((db, u) => {
    const b = ownBusiness(db, u);
    if (input.name.trim().length < 2) throw new Error("נא להזין שם");
    for (const r of [...(input.workingHours ?? []), ...(input.breaks ?? [])]) if (r.end <= r.start) throw new Error("שעת סיום חייבת להיות אחרי שעת התחלה");
    let p = input.id ? db.professionals.find((x) => x.id === input.id && x.businessId === b.id) : undefined;
    if (!p) {
      p = { id: uid("pro"), businessId: b.id, name: "", title: "", specialties: [], avatar: "", serviceIds: [], workingHours: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start: 540, end: 1080 })), breaks: [], active: true };
      db.professionals.push(p);
    }
    const serviceIds = (input.serviceIds ?? p.serviceIds).filter((id) => db.services.some((s) => s.id === id && s.businessId === b.id));
    Object.assign(p, { ...input, id: p.id, businessId: b.id, serviceIds, name: input.name.trim() });
    return p;
  });
}

/* ---------------- Business: appointments & calendar ---------------- */

function staffOrOwner(db: DB, u: User | null, appointmentId: ID) {
  const me = requireUser(u);
  const a = booking.mustGet(db, appointmentId);
  assert(can.manageAppointment(me, a), "אין לך הרשאה לתור הזה");
  return { me, a };
}

export function approveAppointment(id: ID) {
  return mutate((db, u) => booking.approve(db, staffOrOwner(db, u, id).a.id, u!.id));
}
export function rejectAppointment(id: ID, reason: string) {
  return mutate((db, u) => booking.reject(db, staffOrOwner(db, u, id).a.id, u!.id, reason));
}
export function cancelAsBusiness(id: ID, reason: string) {
  return mutate((db, u) => booking.cancel(db, staffOrOwner(db, u, id).a.id, { id: u!.id, kind: "business" }, reason));
}
export function rescheduleAsBusiness(id: ID, start: string, professionalId?: ID) {
  return mutate((db, u) => {
    const { me, a } = staffOrOwner(db, u, id);
    if (me.role === "staff" && professionalId && professionalId !== me.professionalId) throw new PermissionError("אפשר לשבץ רק ביומן שלך");
    return booking.reschedule(db, a.id, { id: me.id, kind: "business" }, { start, professionalId });
  });
}
export function markOutcome(id: ID, outcome: "completed" | "no_show") {
  return mutate((db, u) => booking.markOutcome(db, staffOrOwner(db, u, id).a.id, u!.id, outcome));
}
export function setBusinessNote(id: ID, note: string) {
  return mutate((db, u) => {
    staffOrOwner(db, u, id).a.businessNote = note;
  });
}

export function createManualAppointment(input: { serviceId: ID; professionalId: ID; start: string; guestName: string; guestPhone?: string; note?: string }) {
  return mutate((db, u) => {
    const me = requireUser(u);
    assert(!!me.businessId && (me.role === "business" || me.role === "staff"));
    if (me.role === "staff" && input.professionalId !== me.professionalId) throw new PermissionError("אפשר לקבוע רק ביומן שלך");
    if (input.guestName.trim().length < 2) throw new Error("נא להזין שם לקוח/ה");
    return booking.createManual(db, { ...input, businessId: me.businessId!, actorId: me.id });
  });
}

export function addBlockedTime(input: { professionalId: ID; start: string; end: string; reason: string }) {
  return mutate((db, u) => {
    const me = requireUser(u);
    assert(!!me.businessId && (me.role === "business" || (me.role === "staff" && me.professionalId === input.professionalId)));
    return booking.addBlockedTime(db, { ...input, businessId: me.businessId! });
  });
}

export function removeBlockedTime(id: ID) {
  return mutate((db, u) => {
    const me = requireUser(u);
    const b = db.blockedTimes.find((x) => x.id === id);
    assert(!!b && b.businessId === me.businessId && (me.role === "business" || me.professionalId === b.professionalId));
    db.blockedTimes = db.blockedTimes.filter((x) => x.id !== id);
  });
}

/* ---------------- Google Calendar (simulated) ---------------- */

export async function connectCalendar() {
  const s = useApp.getState();
  const b = s.db.businesses.find((x) => x.id === s.db.users.find((u) => u.id === s.userId)?.businessId);
  if (!b) return null;
  return calendarAdapter.connect(b);
}

export function setCalendarState(patch: Partial<Business["calendar"]>) {
  return mutate((db, u) => {
    const b = ownBusiness(db, u);
    b.calendar = { ...b.calendar, ...patch };
  });
}

export async function syncCalendar() {
  const s = useApp.getState();
  const b = s.db.businesses.find((x) => x.id === s.db.users.find((u) => u.id === s.userId)?.businessId);
  if (!b) return;
  try {
    const r = await calendarAdapter.sync(b, s.db.appointments.filter((a) => a.businessId === b.id));
    setCalendarState({ status: "connected", lastSyncAt: r.syncedAt, lastError: undefined });
    toast("ok", `סנכרון דמו הושלם (${r.pushed} תורים). לא בוצע חיבור אמיתי ל־Google.`);
  } catch (e) {
    const msg = (e as Error).message;
    mutate((db, u) => {
      const biz = ownBusiness(db, u);
      biz.calendar = { ...biz.calendar, status: "error", lastError: msg };
      db.integrationEvents.unshift({ id: uid("ie"), businessId: biz.id, integration: "google_calendar", level: "error", message: `סנכרון נכשל: ${msg}`, createdAt: nowISO(), resolved: false });
    });
    toast("error", "הסנכרון נכשל (סימולציה)");
  }
}

export async function disconnectCalendar() {
  const s = useApp.getState();
  const b = s.db.businesses.find((x) => x.id === s.db.users.find((u) => u.id === s.userId)?.businessId);
  if (!b) return;
  await calendarAdapter.disconnect(b);
  setCalendarState({ status: "disconnected", accountEmail: undefined, calendarId: undefined, calendarName: undefined, lastSyncAt: undefined, lastError: undefined, simulateFailure: false });
}

/* ---------------- Promotion (later-phase concept, simulated) ---------------- */

export function upsertCampaign(input: { id?: ID; postId: ID; cityIds: ID[]; budget: number; start: string; end: string }) {
  return mutate((db, u) => {
    const b = ownBusiness(db, u);
    if (!input.cityIds.length) throw new Error("בחרו לפחות עיר אחת");
    if (input.budget <= 0) throw new Error("תקציב לא תקין");
    if (new Date(input.end) <= new Date(input.start)) throw new Error("תאריך סיום חייב להיות אחרי ההתחלה");
    assert(db.posts.some((p) => p.id === input.postId && p.businessId === b.id && p.status === "published"), "אפשר לקדם רק תוכן מפורסם של העסק");
    let c = input.id ? db.campaigns.find((x) => x.id === input.id && x.businessId === b.id) : undefined;
    if (!c) {
      c = { id: uid("cmp"), businessId: b.id, postId: input.postId, cityIds: [], budget: 0, start: input.start, end: input.end, status: "active", metrics: { impressions: 0, clicks: 0, bookings: 0 }, createdAt: nowISO() };
      db.campaigns.unshift(c);
    }
    Object.assign(c, input);
    return c;
  });
}

export function setCampaignStatus(id: ID, status: "active" | "paused") {
  return mutate((db, u) => {
    const me = requireUser(u);
    const c = db.campaigns.find((x) => x.id === id)!;
    assert((me.role === "business" && c.businessId === me.businessId) || isAdmin(me));
    c.status = status;
    if (isAdmin(me)) audit(db, me, status === "paused" ? "pause_campaign" : "resume_campaign", "campaign", id, "ניהול קמפיינים");
  });
}

/* ---------------- Platform administration ---------------- */

function requireReason(reason: string) {
  if (reason.trim().length < 3) throw new Error("פעולה רגישה — חובה לציין סיבה");
}

export function adminSetBusinessStatus(businessId: ID, status: Business["status"], reason: string) {
  return mutate((db, u) => {
    assert(can.admin(u), "נדרשת הרשאת מנהל מערכת");
    requireReason(reason);
    const b = db.businesses.find((x) => x.id === businessId)!;
    const action = status === "suspended" ? "suspend_business" : b.status === "pending" ? "approve_business" : "restore_business";
    b.status = status;
    b.statusReason = reason;
    audit(db, u!, action, "business", businessId, reason);
    notify(db, b.ownerId, "business", status === "active" ? "העסק אושר / שוחזר" : "העסק הושעה", reason, "/manage");
  });
}

export function adminSetPostHidden(postId: ID, hidden: boolean, reason: string) {
  return mutate((db, u) => {
    assert(can.admin(u), "נדרשת הרשאת מנהל מערכת");
    requireReason(reason);
    const p = db.posts.find((x) => x.id === postId)!;
    p.status = hidden ? "hidden" : "published";
    p.hiddenReason = hidden ? reason : undefined;
    audit(db, u!, hidden ? "hide_content" : "restore_content", "post", postId, reason);
    notify(db, db.businesses.find((b) => b.id === p.businessId)?.ownerId, "business", hidden ? "תוכן הוסתר" : "תוכן שוחזר", reason, "/manage/content");
  });
}

export function adminSetCommentHidden(commentId: ID, hidden: boolean, reason: string) {
  return mutate((db, u) => {
    assert(can.admin(u), "נדרשת הרשאת מנהל מערכת");
    requireReason(reason);
    db.comments.find((x) => x.id === commentId)!.hidden = hidden;
    audit(db, u!, hidden ? "hide_comment" : "restore_comment", "comment", commentId, reason);
  });
}

export function adminSetReviewHidden(reviewId: ID, hidden: boolean, reason: string) {
  return mutate((db, u) => {
    assert(can.hideReview(u), "נדרשת הרשאת מנהל מערכת");
    requireReason(reason);
    const r = db.reviews.find((x) => x.id === reviewId)!;
    r.hidden = hidden;
    r.hiddenReason = hidden ? reason : undefined;
    audit(db, u!, hidden ? "hide_review" : "restore_review", "review", reviewId, reason);
  });
}

export function adminResolveReport(reportId: ID, status: "resolved" | "dismissed", reason: string) {
  return mutate((db, u) => {
    assert(can.admin(u), "נדרשת הרשאת מנהל מערכת");
    requireReason(reason);
    const r = db.reports.find((x) => x.id === reportId)!;
    r.status = status;
    r.resolution = reason;
    r.resolvedBy = u!.id;
    audit(db, u!, status === "resolved" ? "resolve_report" : "dismiss_report", "report", reportId, reason);
  });
}

export function adminSetUserStatus(userId: ID, status: User["status"], reason: string) {
  return mutate((db, u) => {
    assert(can.admin(u), "נדרשת הרשאת מנהל מערכת");
    requireReason(reason);
    if (userId === u!.id) throw new Error("אי אפשר להשעות את עצמך");
    db.users.find((x) => x.id === userId)!.status = status;
    audit(db, u!, status === "suspended" ? "suspend_user" : "restore_user", "user", userId, reason);
  });
}

export function adminCancelAppointment(appointmentId: ID, reason: string) {
  return mutate((db, u) => {
    assert(can.admin(u), "נדרשת הרשאת מנהל מערכת");
    requireReason(reason);
    booking.cancel(db, appointmentId, { id: u!.id, kind: "admin" }, reason);
    audit(db, u!, "cancel_appointment", "appointment", appointmentId, reason);
  });
}

export function adminSetCityActive(cityId: ID, active: boolean, reason: string) {
  return mutate((db, u) => {
    assert(can.admin(u), "נדרשת הרשאת מנהל מערכת");
    requireReason(reason);
    db.cities.find((c) => c.id === cityId)!.active = active;
    audit(db, u!, active ? "activate_city" : "deactivate_city", "city", cityId, reason);
  });
}

export function adminResolveIntegration(eventId: ID, reason: string) {
  return mutate((db, u) => {
    assert(can.admin(u), "נדרשת הרשאת מנהל מערכת");
    requireReason(reason);
    db.integrationEvents.find((e) => e.id === eventId)!.resolved = true;
    audit(db, u!, "resolve_integration_failure", "integration", eventId, reason);
  });
}

/** Restores the original demo dataset on this device. */
export function resetDemo() {
  useApp.setState({ db: repository.reset(), bookingDraft: null });
}
