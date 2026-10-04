import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CalendarPlus, Eye, Heart, Send, Trash2, X } from "lucide-react";
import clsx from "clsx";
import type { Business, DB, Story, User } from "../domain/types";
import { fmtRelative } from "../domain/time";
import { deleteStory, isLive, replyToStory, toggleStoryLike, viewStory } from "../store/actions";
import { gate, toast, useApp, useMe, useMode } from "../store/app";
import { useMediaUrl } from "../ui/hooks";
import { Avatar } from "../ui/kit";
import { ConfirmDialog, Sheet } from "../ui/overlays";
import { Overlays, filterCss } from "../ui/media-fx";

/** Businesses with live stories, the viewer's follows and unseen ones first. */
export function storyQueue(db: DB, me: User | null, now = Date.now()) {
  const byBiz = new Map<string, Story[]>();
  for (const st of db.stories) {
    if (!isLive(st, now)) continue;
    const b = db.businesses.find((x) => x.id === st.businessId);
    if (!b || b.status !== "active" || me?.blockedBusinessIds.includes(b.id)) continue;
    byBiz.set(b.id, [...(byBiz.get(b.id) ?? []), st]);
  }
  const rows = [...byBiz.entries()].map(([id, list]) => {
    const stories = list.sort((x, y) => x.createdAt.localeCompare(y.createdAt));
    const seen = !!me && stories.every((s) => s.viewers.some((v) => v.userId === me.id));
    return { business: db.businesses.find((b) => b.id === id)!, stories, seen, follows: !!me?.followingBusinesses.includes(id), own: me?.businessId === id && me.role === "business", latest: stories.at(-1)!.createdAt };
  });
  return rows.sort((a, b) => Number(b.own) - Number(a.own) || Number(a.seen) - Number(b.seen) || Number(b.follows) - Number(a.follows) || b.latest.localeCompare(a.latest));
}

export function hasLiveStory(db: DB, businessId: string) {
  return db.stories.some((s) => s.businessId === businessId && isLive(s));
}

/** Avatar with a story ring; opens the story when there is one. */
export function StoryAvatar({ business, size = 44, dark }: { business: Business; size?: number; dark?: boolean }) {
  const db = useApp((s) => s.db);
  const me = useMe();
  const live = db.stories.filter((s) => s.businessId === business.id && isLive(s));
  const seen = !!me && live.length > 0 && live.every((s) => s.viewers.some((v) => v.userId === me.id));
  const inner = <Avatar src={business.avatar} name={business.name} size={size} ring={dark} />;
  if (!live.length) return inner;
  return (
    <Link to={`/story/${business.id}`} aria-label={`סטורי של ${business.name}`} className={clsx("grid shrink-0 place-items-center rounded-full p-[3px]", seen ? "bg-line" : "bg-[conic-gradient(from_200deg,var(--ink),var(--muted),var(--ink))]")}>
      <span className="grid place-items-center rounded-full bg-bg p-[2px]">{inner}</span>
    </Link>
  );
}

export function StoriesTray({ className }: { className?: string }) {
  const db = useApp((s) => s.db);
  const me = useMe();
  const rows = useMemo(() => storyQueue(db, me), [db, me]);
  const canCreate = useMode() === "business";
  if (!rows.length && !canCreate) return null;
  return (
    <nav aria-label="סטוריז" className={clsx("no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 py-1", className)}>
      {canCreate && (
        <Link to="/create?kind=story" className="flex w-[72px] shrink-0 flex-col items-center gap-1 text-center">
          <span className="grid size-[64px] place-items-center rounded-full border-2 border-dashed border-line text-2xl font-light">+</span>
          <span className="w-full truncate text-[11px]">הסטורי שלך</span>
        </Link>
      )}
      {rows.map((r) => (
        <Link key={r.business.id} to={`/story/${r.business.id}`} className="flex w-[72px] shrink-0 flex-col items-center gap-1 text-center">
          <span className={clsx("grid place-items-center rounded-full p-[3px]", r.seen ? "bg-line" : "bg-[conic-gradient(from_200deg,var(--ink),var(--muted),var(--ink))]")}>
            <span className="grid place-items-center rounded-full bg-bg p-[2px]">
              <Avatar src={r.business.avatar} name={r.business.name} size={56} />
            </span>
          </span>
          <span className={clsx("w-full truncate text-[11px]", !r.seen && "font-semibold")}>{r.own ? "שלך" : r.business.name}</span>
        </Link>
      ))}
    </nav>
  );
}

const IMAGE_MS = 5000;

/** Full-screen viewer: /story/:businessId — progress bars, tap to move, hold to pause, reply, like, book. */
export function StoryViewer() {
  const { businessId } = useParams();
  const db = useApp((s) => s.db);
  const me = useMe();
  const navigate = useNavigate();
  // Freeze the queue when the viewer opens so marking stories as seen doesn't reorder it mid-way
  const [queue] = useState(() => storyQueue(db, me));
  const bi = Math.max(0, queue.findIndex((q) => q.business.id === businessId));
  const group = queue[bi];
  const firstUnseen = group ? Math.max(0, group.stories.findIndex((s) => !me || !s.viewers.some((v) => v.userId === me.id))) : 0;
  const [index, setIndex] = useState(firstUnseen);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState("");
  const [viewersOpen, setViewersOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const holdTimer = useRef<number>(0);
  const held = useRef(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => setIndex(firstUnseen), [businessId]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = group?.stories.filter((s) => db.stories.some((x) => x.id === s.id)) ?? [];
  const story = live[Math.min(index, live.length - 1)];
  const st = story ? db.stories.find((x) => x.id === story.id) ?? story : undefined;
  const src = useMediaUrl(st?.media.src);
  const isOwner = !!st && me?.role === "business" && me.businessId === st.businessId;
  const service = st?.serviceId ? db.services.find((s) => s.id === st.serviceId) : undefined;
  const shared = st?.sharedPostId ? db.posts.find((p) => p.id === st.sharedPostId) : undefined;
  const sharedCover = useMediaUrl(shared?.cover ?? shared?.media[0]?.poster ?? shared?.media[0]?.src);

  const close = () => navigate(-1);
  const next = () => {
    if (index < live.length - 1) return (setIndex(index + 1), setProgress(0));
    const n = queue[bi + 1];
    if (n) navigate(`/story/${n.business.id}`, { replace: true });
    else close();
  };
  const prev = () => {
    if (index > 0) return (setIndex(index - 1), setProgress(0));
    const p = queue[bi - 1];
    if (p) navigate(`/story/${p.business.id}`, { replace: true });
    else setProgress(0);
  };

  useEffect(() => {
    if (st) viewStory(st.id);
    setProgress(0);
  }, [st?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Images advance on a timer; videos follow their own playback
  const isVideo = st?.media.type === "video";
  const stop = paused || viewersOpen || confirmDel || reply.length > 0;
  useEffect(() => {
    if (!st || isVideo || stop) return;
    const t0 = performance.now() - progress * IMAGE_MS;
    let raf = 0;
    const tick = () => {
      const p = (performance.now() - t0) / IMAGE_MS;
      if (p >= 1) return next();
      setProgress(p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [st?.id, isVideo, stop]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (stop) v.pause();
    else v.play().catch(() => undefined);
  }, [stop, src]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") next(); // RTL: left is forward
      if (e.key === "ArrowRight") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!group || !st)
    return (
      <div className="grid h-dvh place-items-center bg-black text-white">
        <div className="text-center">
          <p className="mb-4">הסטורי כבר לא זמין (עבר 24 שעות).</p>
          <button type="button" onClick={() => navigate("/")} className="rounded-full bg-white px-5 py-2 font-semibold text-[#111]">
            לפיד
          </button>
        </div>
      </div>
    );
  const b = group.business;
  const liked = !!me && st.likedBy.includes(me.id);

  const onPointerDown = () => {
    held.current = false;
    holdTimer.current = window.setTimeout(() => {
      held.current = true;
      setPaused(true);
    }, 220);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    clearTimeout(holdTimer.current);
    if (held.current) return setPaused(false);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // RTL: tapping the left third moves forward, the right third goes back
    if (e.clientX - rect.left < rect.width / 3) next();
    else if (e.clientX - rect.left > (rect.width * 2) / 3) prev();
    else next();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black text-white" role="dialog" aria-label={`סטורי של ${b.name}`}>
      <div className="relative h-full w-full max-w-[480px] overflow-hidden sm:h-[92dvh] sm:rounded-[28px]">
        <div className="absolute inset-0" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => (clearTimeout(holdTimer.current), setPaused(false))}>
          {isVideo ? (
            src && (
              <video
                key={st.id}
                ref={videoRef}
                src={src}
                poster={st.media.poster}
                className="media size-full object-cover"
                style={{ filter: filterCss(st.media.filter) }}
                autoPlay
                muted
                playsInline
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  if (v.duration) setProgress(v.currentTime / v.duration);
                }}
                onEnded={next}
              />
            )
          ) : (
            src && <img key={st.id} src={src} alt="" className="media size-full object-cover" style={{ filter: filterCss(st.media.filter) }} />
          )}
          <Overlays items={st.media.overlays} />
          {shared && (
            <Link to={`/post/${shared.id}`} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} className="absolute inset-x-12 top-1/4 z-20 overflow-hidden rounded-2xl bg-white text-[#111] shadow-2xl">
              {sharedCover && <img src={sharedCover} alt="" className="aspect-[4/5] w-full object-cover" />}
              <span className="block truncate px-3 py-2 text-sm font-semibold">{shared.caption}</span>
            </Link>
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/60 to-transparent p-3 pb-10">
          <div className="safe-top" />
          <div className="flex gap-1" dir="ltr">
            {live.map((s, i) => (
              <div key={s.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/35">
                <div className="h-full bg-white" style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }} />
              </div>
            ))}
          </div>
          <div className="pointer-events-auto mt-3 flex items-center gap-2">
            <Link to={`/b/${b.id}`} className="flex min-w-0 flex-1 items-center gap-2">
              <Avatar src={b.avatar} name={b.name} size={34} />
              <span className="truncate text-sm font-bold">{b.name}</span>
              <span className="shrink-0 text-xs text-white/70">{fmtRelative(st.createdAt)}</span>
              {st.isSample && <span className="shrink-0 rounded-full bg-black/50 px-2 text-[10px]">דוגמה</span>}
            </Link>
            <button type="button" onClick={close} className="grid size-10 place-items-center rounded-full" aria-label="סגירה">
              <X className="size-6" />
            </button>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/70 to-transparent p-3 pt-12 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {service && !isOwner && (
            <Link to={`/book/${b.id}?service=${service.id}`} className="mb-3 flex h-12 items-center justify-center gap-2 rounded-full bg-white text-sm font-bold text-[#111]">
              <CalendarPlus className="size-5" aria-hidden /> קביעת תור · {service.name}
            </Link>
          )}
          {isOwner ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setViewersOpen(true)} className="flex h-11 items-center gap-2 rounded-full bg-white/15 px-4 text-sm font-semibold backdrop-blur">
                <Eye className="size-4" aria-hidden /> {st.viewers.length} צפיות · {st.likedBy.length} ♥
              </button>
              <span className="flex-1" />
              <button type="button" onClick={() => setConfirmDel(true)} className="grid size-11 place-items-center rounded-full bg-white/15" aria-label="מחיקת הסטורי">
                <Trash2 className="size-5" />
              </button>
            </div>
          ) : (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!gate("כדי להגיב לסטורי צריך חשבון.")) return;
                if (replyToStory(st.id, reply) !== undefined) {
                  toast("ok", `התגובה נשלחה ל${b.name}`);
                  setReply("");
                }
              }}
            >
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`תגובה ל${b.name}…`} aria-label="תגובה לסטורי" maxLength={500} className="h-11 min-w-0 flex-1 rounded-full border border-white/50 bg-transparent px-4 text-sm text-white placeholder:text-white/70 focus:border-white focus:outline-none" />
              {reply.trim() ? (
                <button type="submit" className="grid size-11 place-items-center rounded-full bg-white text-[#111]" aria-label="שליחה">
                  <Send className="flip-rtl size-5" />
                </button>
              ) : (
                <button type="button" onClick={() => gate("כדי לסמן לייק צריך חשבון.") && toggleStoryLike(st.id)} className="grid size-11 place-items-center" aria-label={liked ? "ביטול לייק" : "לייק"} aria-pressed={liked}>
                  <Heart className={clsx("size-7", liked && "fill-white")} />
                </button>
              )}
            </form>
          )}
        </div>
      </div>
      <Sheet open={viewersOpen} onClose={() => setViewersOpen(false)} title={`צפו בסטורי (${st.viewers.length})`}>
        <ul className="flex flex-col gap-1">
          {st.viewers.length === 0 && <li className="py-4 text-center text-sm text-muted">עוד אין צפיות.</li>}
          {[...st.viewers].reverse().map((v) => {
            const u = db.users.find((x) => x.id === v.userId);
            return (
              <li key={v.userId} className="flex items-center gap-3 rounded-2xl p-2">
                <Avatar name={u?.name ?? "משתמש/ת"} size={36} />
                <span className="flex-1 font-medium">{u?.name}</span>
                {st.likedBy.includes(v.userId) && <Heart className="size-4 fill-ink" aria-label="סימן/ה לייק" />}
                <span className="text-xs text-muted">{fmtRelative(v.at)}</span>
              </li>
            );
          })}
        </ul>
      </Sheet>
      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title="למחוק את הסטורי?"
        confirmLabel="מחיקה"
        danger
        onConfirm={() => {
          if (deleteStory(st.id) !== undefined) {
            toast("ok", "הסטורי נמחק");
            if (live.length <= 1) close();
          }
        }}
      />
    </div>
  );
}
