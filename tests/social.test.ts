import { beforeEach, describe, expect, it } from "vitest";
import { createSeed, DEMO_ACCOUNTS } from "../src/data/seed";
import { useApp } from "../src/store/app";
import * as act from "../src/store/actions";
import { storyQueue } from "../src/screens/stories";

function as(userId: string | null) {
  useApp.setState({ userId, viewMode: userId === DEMO_ACCOUNTS.owner ? "business" : "customer", toasts: [] });
}
const db = () => useApp.getState().db;
const media = { type: "image" as const, src: "media/square-hair.jpg", source: "test" };

describe("stories", () => {
  beforeEach(() => {
    useApp.setState({ db: createSeed(new Date()) });
    as(null);
  });

  it("only a business can post a story, and it expires after 24h", () => {
    as(DEMO_ACCOUNTS.customer);
    expect(act.createStory({ media })).toBeUndefined();
    as(DEMO_ACCOUNTS.owner);
    const st = act.createStory({ media, serviceId: "b-nova-s1" })!;
    expect(st.businessId).toBe("b-nova");
    expect(Date.parse(st.expiresAt) - Date.parse(st.createdAt)).toBe(24 * 3600_000);
    expect(act.isLive(st)).toBe(true);
    expect(act.isLive(st, Date.parse(st.expiresAt) + 1)).toBe(false);
  });

  it("rejects a service from another business", () => {
    as(DEMO_ACCOUNTS.owner);
    const foreign = db().services.find((s) => s.businessId !== "b-nova")!;
    expect(act.createStory({ media, serviceId: foreign.id })).toBeUndefined();
  });

  it("counts a view once per viewer, never the owner", () => {
    as(DEMO_ACCOUNTS.owner);
    const st = act.createStory({ media })!;
    act.viewStory(st.id);
    as(DEMO_ACCOUNTS.customer);
    act.viewStory(st.id);
    act.viewStory(st.id);
    const s = db().stories.find((x) => x.id === st.id)!;
    expect(s.viewers.map((v) => v.userId)).toEqual([DEMO_ACCOUNTS.customer]);
    expect(db().analytics.filter((e) => e.storyId === st.id && e.type === "story_view")).toHaveLength(1);
  });

  it("a story reply lands in the business's messages", () => {
    as(DEMO_ACCOUNTS.owner);
    const st = act.createStory({ media })!;
    as(DEMO_ACCOUNTS.customer);
    const cid = act.replyToStory(st.id, "יש מקום מחר?")!;
    const c = db().conversations.find((x) => x.id === cid)!;
    expect(c.businessId).toBe("b-nova");
    expect(c.messages.at(-1)!.text).toContain("יש מקום מחר?");
  });

  it("only the owning business can delete its story", () => {
    as(DEMO_ACCOUNTS.owner);
    const st = act.createStory({ media })!;
    as(DEMO_ACCOUNTS.customer);
    expect(act.deleteStory(st.id)).toBeUndefined();
    as(DEMO_ACCOUNTS.owner);
    expect(act.deleteStory(st.id)).toBe(true);
    expect(db().stories.some((x) => x.id === st.id)).toBe(false);
  });

  it("the tray shows only live stories, unseen first", () => {
    as(DEMO_ACCOUNTS.customer);
    const me = db().users.find((u) => u.id === DEMO_ACCOUNTS.customer)!;
    const q = storyQueue(db(), me);
    expect(q.length).toBeGreaterThan(0);
    for (const row of q) for (const s of row.stories) expect(act.isLive(s)).toBe(true);
    const firstSeen = q.findIndex((r) => r.seen);
    if (firstSeen >= 0) expect(q.slice(firstSeen).every((r) => r.seen)).toBe(true);
  });
});

describe("comments", () => {
  beforeEach(() => {
    useApp.setState({ db: createSeed(new Date()) });
    as(DEMO_ACCOUNTS.customer);
  });

  it("replies stay one level deep", () => {
    const post = db().posts.find((p) => p.status === "published")!;
    const top = act.addComment(post.id, "מהמם")!;
    const r1 = act.addComment(post.id, "מסכימה", top.id)!;
    const r2 = act.addComment(post.id, "גם אני", r1.id)!;
    expect(r1.parentId).toBe(top.id);
    expect(r2.parentId).toBe(top.id);
  });

  it("@mentions notify the mentioned business", () => {
    const post = db().posts.find((p) => p.status === "published" && p.businessId !== "b-nova")!;
    const nova = db().businesses.find((b) => b.id === "b-nova")!;
    const before = db().notifications.filter((n) => n.userId === nova.ownerId).length;
    act.addComment(post.id, `תראו @${nova.username}`);
    expect(db().notifications.filter((n) => n.userId === nova.ownerId).length).toBe(before + 1);
  });

  it("comment likes toggle; only the post's business can pin", () => {
    const post = db().posts.find((p) => p.status === "published" && p.businessId === "b-nova")!;
    const c = act.addComment(post.id, "וואו")!;
    expect(act.toggleCommentLike(c.id)).toBe(true);
    expect(act.toggleCommentLike(c.id)).toBe(false);
    expect(act.togglePinComment(c.id)).toBeUndefined();
    as(DEMO_ACCOUNTS.owner);
    expect(act.togglePinComment(c.id)).toBe(true);
    expect(db().comments.filter((x) => x.postId === post.id && x.pinned)).toHaveLength(1);
  });
});

describe("media provenance", () => {
  it("keeps source and creator on published media", () => {
    useApp.setState({ db: createSeed(new Date()) });
    as(DEMO_ACCOUNTS.owner);
    const m = { ...media, sourceReelUrl: "https://www.instagram.com/reel/abc/", sourceProfileUrl: "https://www.instagram.com/someone/", creator: "Someone" };
    const p = act.savePostDraftOrPublish({ kind: "image", media: [m], caption: "עבודה", tags: [], cityId: "tlv" }, true)!;
    const saved = db().posts.find((x) => x.id === (typeof p === "string" ? p : p.id))!;
    expect(saved.media[0].sourceReelUrl).toBe(m.sourceReelUrl);
    expect(saved.media[0].creator).toBe("Someone");
  });
});
