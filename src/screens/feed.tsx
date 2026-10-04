import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AlertTriangle, Bell, Bookmark, CalendarPlus, ChevronDown, Film, Heart, Info, MapPin, MessageCircle, MoreHorizontal, Play, Plus, Send, Sparkles, Volume2, VolumeX } from "lucide-react";
import clsx from "clsx";
import { rankFeed, type FeedTab, type RankedPost } from "../domain/feed";
import { compact, price } from "../domain/format";
import type { MediaItem, Post, TrafficSource } from "../domain/types";
import { isSaved, savePost, sharePostCount, toggleFollowBusiness, toggleLike, trackEvent, trackWatch } from "../store/actions";
import { Overlays, RichText, filterCss } from "../ui/media-fx";
import { gate, toast, useApp, useMe, useMode } from "../store/app";
import { shareLink } from "../integrations/share";
import { useMediaUrl, useReducedMotion } from "../ui/hooks";
import { Avatar, Button, EmptyState, btn } from "../ui/kit";
import { Sheet } from "../ui/overlays";
import { CommentsSheet, PostMoreSheet, ReportSheet, SaveSheet } from "./social-sheets";
import { CityPicker } from "./city-picker";
import { StoryAvatar, hasLiveStory } from "./stories";
import { unreadMessages, unreadNotifications } from "../ui/shell";

const TABS: { id: FeedTab; label: string }[] = [
  { id: "for_you", label: "בשבילך" },
  { id: "following", label: "במעקב" },
  { id: "nearby", label: "קרוב אליי" },
];

export function FeedScreen() {
  const db = useApp((s) => s.db);
  const me = useMe();
  const tab = useApp((s) => s.feedTab);
  const cityId = useApp((s) => s.settings.cityId);
  const [cityOpen, setCityOpen] = useState(false);
  const items = useMemo(() => rankFeed(db, me, { tab, cityId: tab === "nearby" ? cityId : null }), [db, me, tab, cityId]);
  const city = db.cities.find((c) => c.id === cityId);
  const notify = useApp((s) => s.settings.notify);
  const msgs = unreadMessages(db, me);
  const notes = unreadNotifications(db, me, notify);

  return (
    <div className="on-media relative h-[100dvh] bg-black text-white">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/60 to-transparent pb-10">
        <div className="safe-top" />
        <div className="flex items-center justify-between gap-2 px-3 pt-2 lg:justify-center">
          <span className="pointer-events-auto hidden text-xl font-black tracking-tight min-[430px]:block lg:hidden">Beautigo</span>
          <nav aria-label="סוג פיד" className="glass-dark pointer-events-auto flex rounded-full p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={tab === t.id}
                onClick={() => useApp.setState({ feedTab: t.id })}
                className={clsx("h-9 whitespace-nowrap rounded-full px-3 text-sm font-semibold transition", tab === t.id ? "bg-white text-[#111]" : "text-white/85 hover:text-white")}
              >
                {t.label}
              </button>
            ))}
          </nav>
          {me ? (
            <div className="pointer-events-auto flex lg:hidden">
              <Link to="/messages" className="relative grid size-10 place-items-center rounded-full" aria-label={`הודעות${msgs ? ` (${msgs} שלא נקראו)` : ""}`}>
                <MessageCircle className="size-6" aria-hidden />
                {msgs > 0 && <span className="absolute end-1.5 top-1.5 size-2.5 rounded-full bg-bad ring-2 ring-black" aria-hidden />}
              </Link>
              <Link to="/notifications" className="relative grid size-10 place-items-center rounded-full" aria-label={`התראות${notes ? ` (${notes} חדשות)` : ""}`}>
                <Bell className="size-6" aria-hidden />
                {notes > 0 && <span className="absolute end-1.5 top-1.5 size-2.5 rounded-full bg-bad ring-2 ring-black" aria-hidden />}
              </Link>
            </div>
          ) : (
            <Link to="/discover" className="pointer-events-auto grid size-11 place-items-center rounded-full lg:hidden" aria-label="חיפוש וגילוי">
              <Sparkles className="size-6" aria-hidden />
            </Link>
          )}
        </div>
        {tab === "nearby" && (
          <div className="mt-2 flex justify-center">
            <button type="button" onClick={() => setCityOpen(true)} className="glass-dark pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium">
              <MapPin className="size-4" aria-hidden /> {city?.name ?? "בחירת עיר"} <ChevronDown className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </header>
      <FeedList key={tab + (cityId ?? "")} items={items} tabKey={tab} empty={<FeedEmpty tab={tab} cityName={city?.name} onPickCity={() => setCityOpen(true)} />} />
      <CityPicker open={cityOpen} onClose={() => setCityOpen(false)} />
    </div>
  );
}

function FeedEmpty({ tab, cityName, onPickCity }: { tab: FeedTab; cityName?: string; onPickCity: () => void }) {
  const me = useMe();
  if (tab === "following")
    return (
      <EmptyState
        title={me ? "עוד לא עקבת אחרי עסקים" : "התחברו כדי לראות עסקים שאתם עוקבים אחריהם"}
        text="עקבו אחרי עסקים ואנשי מקצוע שאהבתם — העבודות החדשות שלהם יופיעו כאן."
        action={
          me ? (
            <button type="button" className={btn("primary")} onClick={() => useApp.setState({ feedTab: "for_you" })}>
              לגלות עבודות
            </button>
          ) : (
            <Link to="/signin?next=/" className={btn("primary")}>
              התחברות
            </Link>
          )
        }
      />
    );
  return (
    <EmptyState
      title={`אין עדיין תוכן ב${cityName ?? "אזור"}`}
      text="לא נציג תוכן מערים אחרות בלי לשאול. אפשר לבחור עיר אחרת או להרחיב לכל הארץ."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={onPickCity}>בחירת עיר</Button>
          <Button variant="secondary" onClick={() => useApp.setState({ feedTab: "for_you" })}>
            הרחבה לכל הארץ
          </Button>
        </div>
      }
    />
  );
}

const sourceOf = (tabKey: string): TrafficSource => (tabKey === "following" ? "following" : tabKey === "nearby" ? "nearby" : tabKey === "for_you" ? "feed" : "share");

/** Items further than this from the active one render as a lightweight poster only. */
const LIVE_WINDOW = 2;

/**
 * Vertical, full-screen snap list (TikTok / Reels). Exactly one item is active and only it plays;
 * its neighbours are mounted and buffered so the next swipe starts instantly.
 */
export function FeedList({ items, tabKey, empty, startIndex = 0 }: { items: RankedPost[]; tabKey: string; empty?: React.ReactNode; startIndex?: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  const saved = useApp((s) => (tabKey in s.feedIndex ? s.feedIndex[tabKey as FeedTab] : 0));
  const [active, setActive] = useState(Math.min(startIndex || saved || 0, Math.max(0, items.length - 1)));
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  const [muted, setMuted] = useState(true);
  const reduced = useReducedMotion();
  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  // Restore position when returning from a profile or booking
  useEffect(() => {
    const idx = startIndex || saved;
    if (idx && scroller.current) scroller.current.scrollTop = idx * scroller.current.clientHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Active item = the page the snap position sits on. Computed from scrollTop so it flips the moment
  // a swipe settles past the midpoint, without waiting for observers.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const idx = Math.round(el.scrollTop / Math.max(1, el.clientHeight));
        setActive(Math.max(0, Math.min(items.length - 1, idx)));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [items.length]);

  useEffect(() => {
    if (tabKey in useApp.getState().feedIndex) useApp.setState((s) => ({ feedIndex: { ...s.feedIndex, [tabKey]: active } }));
  }, [active, tabKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select,[role=dialog]")) return;
      const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (!step || !scroller.current) return;
      e.preventDefault();
      const next = Math.max(0, Math.min(items.length - 1, active + step));
      scroller.current.scrollTo({ top: next * scroller.current.clientHeight, behavior: reduced ? "auto" : "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, items.length, reduced]);

  if (!items.length) return <div className="grid h-full place-items-center px-6 text-ink">{empty}</div>;
  return (
    <div ref={scroller} className="feed-scroller no-scrollbar h-full snap-y snap-mandatory overflow-y-auto overscroll-contain" aria-label="פיד עבודות">
      {items.map((item, i) =>
        Math.abs(i - active) > LIVE_WINDOW ? (
          <FeedPlaceholder key={item.post.id} post={item.post} index={i} />
        ) : (
          <FeedItem key={item.post.id} item={item} index={i} active={i === active} preload={i > active && i - active <= 1} pageVisible={visible} muted={muted} onToggleMute={toggleMute} source={sourceOf(tabKey)} />
        ),
      )}
    </div>
  );
}

/** Off-screen page: keeps the scroll geometry and shows the poster frame, nothing else. */
const FeedPlaceholder = memo(function FeedPlaceholder({ post, index }: { post: Post; index: number }) {
  const poster = useMediaUrl(post.media[0]?.poster ?? post.cover ?? post.media[0]?.src);
  return (
    <section data-index={index} className="feed-page relative h-[100dvh] snap-start snap-always bg-black" aria-hidden>
      {poster && <img src={poster} alt="" loading="lazy" decoding="async" className="media absolute inset-0 size-full object-cover" />}
    </section>
  );
});

const FeedItem = memo(function FeedItem({ item, index, active, preload, pageVisible, muted, onToggleMute, source }: { item: RankedPost; index: number; active: boolean; preload: boolean; pageVisible: boolean; muted: boolean; onToggleMute: () => void; source: TrafficSource }) {
  const { post, business, service } = item;
  const db = useApp((s) => s.db);
  const me = useMe();
  const mode = useMode();
  const navigate = useNavigate();
  const captionsOn = useApp((s) => s.settings.captions);
  const [sheet, setSheet] = useState<null | "comments" | "save" | "more" | "report" | "why">(null);
  const [burst, setBurst] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const liked = !!me && post.likedBy.includes(me.id);
  const saved = isSaved(db, me?.id ?? null, post.id);
  const following = !!me?.followingBusinesses.includes(business.id);
  const pro = db.professionals.find((p) => p.id === post.professionalId);
  const city = db.cities.find((c) => c.id === post.cityId);
  const comments = db.comments.filter((c) => c.postId === post.id && !c.hidden).length;
  const credit = post.media[0];
  const own = me?.businessId === business.id && (mode === "business" || mode === "staff");
  const viewed = useRef(false);

  useEffect(() => {
    if (!active || viewed.current) return;
    const t = setTimeout(() => {
      viewed.current = true;
      trackEvent("view", business.id, post.id);
    }, 1500);
    return () => clearTimeout(t);
  }, [active, business.id, post.id]);

  const like = () => {
    if (!gate("כדי לסמן לייק צריך חשבון.")) return;
    const on = toggleLike(post.id);
    if (on) setBurst((b) => b + 1);
  };
  const save = () => {
    if (!gate("כדי לשמור השראה לאוספים צריך חשבון.")) return;
    if (saved) setSheet("save");
    else if (savePost(post.id)) toast("ok", "נשמר בשמורים", { label: "לאוסף אחר", run: () => setSheet("save") });
  };
  const follow = () => {
    if (!gate("כדי לעקוב אחרי עסקים צריך חשבון.")) return;
    const on = toggleFollowBusiness(business.id);
    if (on !== undefined) toast("ok", on ? `עוקב/ת אחרי ${business.name}` : "הפסקת לעקוב");
  };
  const share = async () => {
    const r = await shareLink(`${business.name} ב־Beautigo`, `/post/${post.id}`);
    if (r === "copied") toast("ok", "הקישור הועתק");
    else if (r === "failed") toast("error", "לא הצלחנו לשתף. נסו שוב.");
    if (r === "shared" || r === "copied") sharePostCount(post.id);
  };
  const book = () => {
    trackEvent("booking_start", business.id, post.id);
    const q = new URLSearchParams({ post: post.id });
    if (service) q.set("service", service.id);
    if (pro && service && pro.serviceIds.includes(service.id)) q.set("pro", pro.id);
    navigate(`/book/${business.id}?${q}`);
  };

  return (
    <section data-index={index} aria-label={`${post.kind === "reel" ? "רילס" : "פוסט"} של ${business.name}`} className="feed-page relative h-[100dvh] snap-start snap-always overflow-hidden bg-black">
      {post.kind === "reel" ? (
        <ReelVideo media={post.media[0]} active={active} preload={preload} pageVisible={pageVisible} muted={muted} onToggleMute={onToggleMute} onDoubleTap={() => !liked && like()} onWatch={(sec, done) => trackWatch(business.id, post.id, sec, done, source)} />
      ) : (
        <ImageMedia media={post.media} onDoubleTap={() => !liked && like()} />
      )}
      {burst > 0 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <Heart key={burst} className="size-28 animate-heart fill-white text-white drop-shadow-xl" aria-hidden />
        </div>
      )}
      {captionsOn && post.subtitle && (
        <p className="pointer-events-none absolute inset-x-6 top-[40%] text-center text-lg font-bold leading-snug text-white text-shadow" aria-hidden>
          {post.subtitle}
        </p>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[52%] bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      {item.campaignId && <span className="absolute start-3 top-[calc(4.25rem+env(safe-area-inset-top))] rounded-md bg-white/90 px-2 py-0.5 text-[11px] font-bold text-[#111]">ממומן</span>}

      {/* Bottom info — name, caption, credit, booking */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 ps-4 pe-[4.75rem] pb-[calc(6.4rem+env(safe-area-inset-bottom))]">
        <Link to={`/b/${business.id}`} className="flex min-w-0 items-center gap-2 self-start">
          <span className="truncate text-[16px] font-bold text-shadow">{business.name}</span>
          <span className="truncate text-[13px] text-white/75 text-shadow">· {city?.name}</span>
        </Link>
        <button type="button" onClick={() => setExpanded((e) => !e)} className={clsx("text-start text-[14.5px] leading-[1.4] text-shadow", !expanded && "line-clamp-2")} aria-expanded={expanded}>
          <RichText text={post.caption} resolveHandle={(h) => { const b = db.businesses.find((x) => x.username === h); return b ? `/b/${b.id}` : null; }} />
          {post.tags.length > 0 && (
            <span className="text-white/90">
              {" "}
              {post.tags.slice(0, 3).map((t) => (
                <Link key={t} to={`/tag/${encodeURIComponent(t)}`} onClick={(e) => e.stopPropagation()} className="font-semibold">
                  #{t}{" "}
                </Link>
              ))}
            </span>
          )}
        </button>
        {credit?.creator && (
          <a href={credit.sourceReelUrl ?? credit.sourceProfileUrl} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1.5 self-start text-[12.5px] text-white/85 text-shadow hover:text-white">
            <Film className="size-3.5 shrink-0" aria-hidden />
            <span className="credit-marquee truncate">
              <span className="ltr">{credit.creator}</span> · הסרטון המקורי באינסטגרם
            </span>
          </a>
        )}
        {own ? (
          <Link to={mode === "business" ? `/create?edit=${post.id}` : "/manage"} className="feed-cta">
            {mode === "business" ? "עריכת הפוסט" : "ליומן שלי"}
          </Link>
        ) : (
          <button type="button" onClick={book} className="feed-cta">
            <CalendarPlus className="size-[18px] shrink-0" aria-hidden />
            <span className="truncate">{service ? `קביעת תור · ${service.name}` : `קביעת תור ב${business.name}`}</span>
            {service && <span className="num ms-auto shrink-0 font-semibold text-[#55555c]">{price(service.price, service.priceFrom)}</span>}
          </button>
        )}
      </div>

      {/* Action rail */}
      <div className="absolute bottom-[calc(10.75rem+env(safe-area-inset-bottom))] end-2 flex w-14 flex-col items-center gap-[18px]">
        <div className="relative mb-2">
          {hasLiveStory(db, business.id) ? (
            <StoryAvatar business={business} size={46} dark />
          ) : (
            <Link to={`/b/${business.id}`} aria-label={`הפרופיל של ${business.name}`} className="block rounded-full ring-2 ring-white">
              <Avatar src={business.avatar} name={business.name} size={46} />
            </Link>
          )}
          {mode !== "business" && !following && (
            <button type="button" onClick={follow} aria-label={`מעקב אחרי ${business.name}`} className="absolute -bottom-2.5 start-1/2 grid size-6 -translate-x-1/2 place-items-center rounded-full bg-white text-[#111] shadow active:scale-90 rtl:translate-x-1/2">
              <Plus className="size-4 stroke-[3]" aria-hidden />
            </button>
          )}
        </div>
        <Rail label={liked ? "ביטול לייק" : "לייק"} count={post.likedBy.length} pressed={liked} onClick={like}>
          <Heart className={clsx("size-[30px]", liked && "animate-pop fill-[#ff3b5c] text-[#ff3b5c]")} />
        </Rail>
        <Rail label="תגובות" count={comments} onClick={() => setSheet("comments")}>
          <MessageCircle className="size-[30px] -scale-x-100" />
        </Rail>
        <Rail label={saved ? "שמור — ניהול אוספים" : "שמירה"} count={post.savedCount} pressed={saved} onClick={save}>
          <Bookmark className={clsx("size-[28px]", saved && "fill-white")} />
        </Rail>
        <Rail label="שיתוף" count={post.shares} onClick={share}>
          <Send className="size-[28px] flip-rtl" />
        </Rail>
        <Rail label="אפשרויות נוספות" onClick={() => setSheet("more")}>
          <MoreHorizontal className="size-7" />
        </Rail>
        <button type="button" onClick={() => setSheet("why")} aria-label="למה זה מוצג לי" className="grid size-9 place-items-center rounded-full text-white/70 hover:text-white">
          <Info className="size-5" aria-hidden />
        </button>
      </div>

      <CommentsSheet post={post} open={sheet === "comments"} onClose={() => setSheet(null)} />
      <SaveSheet post={post} open={sheet === "save"} onClose={() => setSheet(null)} />
      <PostMoreSheet post={post} open={sheet === "more"} onClose={() => setSheet(null)} onReport={() => setSheet("report")} />
      <ReportSheet open={sheet === "report"} onClose={() => setSheet(null)} targetType="post" targetId={post.id} />
      <WhySheet item={item} open={sheet === "why"} onClose={() => setSheet(null)} />
    </section>
  );
});

function Rail({ label, count, pressed, onClick, children }: { label: string; count?: number; pressed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <button type="button" onClick={onClick} aria-label={label} aria-pressed={pressed} className="grid size-11 place-items-center rounded-full text-white drop-shadow-[0_1px_6px_rgb(0_0_0/0.45)] transition-transform duration-150 active:scale-[0.86]">
        {children}
      </button>
      {count !== undefined && <span className="num -mt-0.5 text-[12px] font-semibold text-shadow">{compact(count)}</span>}
    </div>
  );
}

function WhySheet({ item, open, onClose }: { item: RankedPost; open: boolean; onClose: () => void }) {
  const s = item.score;
  const rows: [string, number][] = [
    ["רלוונטיות (תחומי עניין, מעקב, תגיות ששמרת)", s.relevance],
    ["טריות", s.freshness],
    ["שמירות", s.saves],
    ["מעורבות (לייקים, שיתופים, צפיות)", s.engagement],
    ["קידום ממומן", s.promoted],
  ];
  return (
    <Sheet open={open} onClose={onClose} title="למה זה מוצג לך">
      <ul className="mb-4 flex flex-wrap gap-2">
        {s.reasons.map((r) => (
          <li key={r} className="rounded-full bg-surface px-3 py-1 text-sm font-medium">
            {r}
          </li>
        ))}
      </ul>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-line">
              <td className="py-2">{k}</td>
              <td className="num py-2 text-end font-semibold">{v.toFixed(2)}</td>
            </tr>
          ))}
          <tr>
            <td className="py-2 font-bold">ציון כולל</td>
            <td className="num py-2 text-end font-bold">{s.total.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        מודל דמו פשוט ושקוף: קודם מסננים לפי נראות, חסימות, עיר וקטגוריה, ואז מדרגים. אין יותר משני פריטים רצופים מאותו עסק, וכמות העלאות לבדה לא מעלה דירוג.
      </p>
    </Sheet>
  );
}

/**
 * Plays only when active and the page is visible. The next reel is buffered (preload=auto) and parked
 * on its first frame, so swiping to it starts playback with no spinner. Progress is drawn with a
 * transform on every frame (no React state per tick).
 */
function ReelVideo({ media, active, preload, pageVisible, muted, onToggleMute, onDoubleTap, onWatch }: { media: MediaItem; active: boolean; preload: boolean; pageVisible: boolean; muted: boolean; onToggleMute: () => void; onDoubleTap: () => void; onWatch?: (seconds: number, completed: boolean) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  // Watch time for creator insights: seconds actually played while this reel is the active one
  const watch = useRef({ seconds: 0, last: -1, completed: false });
  const onWatchRef = useRef(onWatch);
  useEffect(() => {
    onWatchRef.current = onWatch;
  });
  useEffect(() => {
    if (active) {
      watch.current = { seconds: 0, last: -1, completed: false };
      return;
    }
    if (watch.current.seconds > 0) onWatchRef.current?.(watch.current.seconds, watch.current.completed);
    watch.current = { seconds: 0, last: -1, completed: false };
  }, [active]);
  useEffect(
    () => () => {
      if (watch.current.seconds > 0) onWatchRef.current?.(watch.current.seconds, watch.current.completed);
    },
    [],
  );
  const src = useMediaUrl(media.src);
  const poster = useMediaUrl(media.poster);
  const { autoplay, dataSaver } = useApp((s) => s.settings);
  const reduced = useReducedMotion();
  const [state, setState] = useState<"loading" | "playing" | "paused" | "error">("loading");
  const [userPaused, setUserPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const lastTap = useRef(0);
  const shouldAutoplay = active && pageVisible && autoplay && !reduced && !userPaused;

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (shouldAutoplay) {
      v.play().then(() => setBlocked(false)).catch(() => {
        setBlocked(true);
        setState("paused");
      });
    } else {
      v.pause();
      if (!active) {
        setUserPaused(false);
        // Leaving a reel rewinds it, like Reels/TikTok
        if (v.currentTime > 0) v.currentTime = media.trimStart ?? 0;
      }
    }
  }, [shouldAutoplay, active, media.trimStart]);

  // Progress bar: one rAF loop while active
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      const v = ref.current;
      const el = bar.current;
      if (v && el && v.duration) {
        const start = media.trimStart ?? 0;
        const end = media.trimEnd ?? v.duration;
        el.style.transform = `scaleX(${Math.min(1, Math.max(0, (v.currentTime - start) / Math.max(0.1, end - start)))})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, media.trimStart, media.trimEnd]);

  // Respect the trim window chosen in the composer (playback range only).
  const onTime = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    const w = watch.current;
    if (active && !v.paused) {
      if (w.last >= 0 && v.currentTime > w.last && v.currentTime - w.last < 1.5) w.seconds += v.currentTime - w.last;
      const end = media.trimEnd ?? v.duration;
      if (end && v.currentTime >= end - 0.35) w.completed = true;
    }
    w.last = v.currentTime;
    if (media.trimEnd && v.currentTime >= media.trimEnd) v.currentTime = media.trimStart ?? 0;
  }, [media.trimEnd, media.trimStart, active]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (state === "error") {
      setState("loading");
      v.load();
      return;
    }
    if (v.paused) {
      setUserPaused(false);
      v.play().catch(() => setState("paused"));
    } else {
      setUserPaused(true);
      v.pause();
    }
  };
  const onClick = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      onDoubleTap();
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    setTimeout(() => lastTap.current && Date.now() - lastTap.current >= 270 && toggle(), 290);
  };

  // Scrub along the progress track (RTL-aware: progress grows from the start edge)
  const seek = (clientX: number) => {
    const v = ref.current;
    const t = track.current;
    if (!v || !t || !v.duration) return;
    const r = t.getBoundingClientRect();
    const rtl = getComputedStyle(t).direction === "rtl";
    const f = Math.min(1, Math.max(0, rtl ? (r.right - clientX) / r.width : (clientX - r.left) / r.width));
    const start = media.trimStart ?? 0;
    const end = media.trimEnd ?? v.duration;
    v.currentTime = start + f * (end - start);
  };

  const mountVideo = active || (preload && !dataSaver) || ready;

  return (
    <>
      {poster && <img src={poster} alt="" decoding="async" className="media absolute inset-0 size-full object-cover" aria-hidden />}
      {src && mountVideo && (
        <video
          ref={ref}
          className={clsx("media absolute inset-0 size-full object-cover transition-opacity duration-200", ready ? "opacity-100" : "opacity-0")}
          style={{ filter: filterCss(media.filter) }}
          muted={muted}
          playsInline
          loop={!media.trimEnd}
          preload="auto"
          disablePictureInPicture
          onPlaying={() => setState("playing")}
          onPause={() => setState((s) => (s === "error" ? s : "paused"))}
          onWaiting={() => setState("loading")}
          onLoadedData={() => setReady(true)}
          onCanPlay={() => setState((s) => (s === "loading" ? (ref.current?.paused ? "paused" : "playing") : s))}
          onLoadedMetadata={() => {
            if (media.trimStart && ref.current) ref.current.currentTime = media.trimStart;
          }}
          onTimeUpdate={onTime}
          onError={() => setState("error")}
          onClick={onClick}
          aria-label="סרטון"
          src={src}
        />
      )}
      <Overlays items={media.overlays} />
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        {active && state === "loading" && ready && <span className="feed-buffering" aria-label="טוען סרטון" />}
        {active && state === "paused" && (userPaused || blocked) && (
          <button type="button" onClick={toggle} className="pointer-events-auto grid size-[76px] place-items-center rounded-full bg-black/35 animate-fade" aria-label="הפעלה">
            <Play className="size-9 translate-x-[-2px] fill-white text-white" />
          </button>
        )}
        {state === "error" && (
          <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-3xl bg-black/70 px-6 py-5 text-center">
            <AlertTriangle className="size-7" aria-hidden />
            <p className="text-sm">לא הצלחנו לטעון את הסרטון</p>
            <button type="button" onClick={toggle} className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-[#111]">
              נסו שוב
            </button>
          </div>
        )}
      </div>
      <button type="button" onClick={onToggleMute} className="absolute end-3 top-[calc(4.25rem+env(safe-area-inset-top))] z-10 grid size-9 place-items-center rounded-full bg-black/35 text-white" aria-label={muted ? "הפעלת קול" : "השתקה"} aria-pressed={!muted}>
        {muted ? <VolumeX className="size-[18px]" /> : <Volume2 className="size-[18px]" />}
      </button>
      {active && (
        <div
          ref={track}
          className={clsx("feed-progress absolute inset-x-0 z-10", scrubbing && "is-scrubbing")}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setScrubbing(true);
            seek(e.clientX);
          }}
          onPointerMove={(e) => scrubbing && seek(e.clientX)}
          onPointerUp={() => setScrubbing(false)}
          onPointerCancel={() => setScrubbing(false)}
          role="slider"
          aria-label="מיקום בסרטון"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={0}
          tabIndex={-1}
        >
          <div className="feed-progress-track">
            <div ref={bar} className="feed-progress-bar" />
          </div>
        </div>
      )}
    </>
  );
}

/** Image post or carousel (swipe/arrow buttons). Never presented as video. */
export function ImageMedia({ media, onDoubleTap, rounded }: { media: MediaItem[]; onDoubleTap?: () => void; rounded?: boolean }) {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const lastTap = useRef(0);
  const onScroll = () => {
    const el = ref.current;
    if (el) setI(Math.round(Math.abs(el.scrollLeft) / el.clientWidth));
  };
  const go = (n: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: -n * el.clientWidth, behavior: "smooth" });
  };
  return (
    <div className={clsx("absolute inset-0", rounded && "overflow-hidden rounded-[24px]")}>
      <div
        ref={ref}
        onScroll={onScroll}
        className="no-scrollbar flex size-full snap-x snap-mandatory overflow-x-auto"
        onClick={() => {
          const now = Date.now();
          if (now - lastTap.current < 280) onDoubleTap?.();
          lastTap.current = now;
        }}
      >
        {media.map((m, k) => (
          <ImageSlide key={k} media={m} label={media.length > 1 ? `תמונה ${k + 1} מתוך ${media.length}` : "תמונה"} />
        ))}
      </div>
      {media.length > 1 && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-[calc(4.6rem+env(safe-area-inset-top))] flex justify-center gap-1.5 lg:top-5" aria-hidden>
            {media.map((_, k) => (
              <span key={k} className={clsx("h-1.5 rounded-full bg-white transition-all", k === i ? "w-5" : "w-1.5 opacity-60")} />
            ))}
          </div>
          <span className="glass-dark absolute end-3 top-[calc(7.5rem+env(safe-area-inset-top))] rounded-full px-2.5 py-0.5 text-xs font-semibold lg:top-14">
            <span className="num">
              {i + 1}/{media.length}
            </span>
          </span>
          {i > 0 && (
            <button type="button" onClick={() => go(i - 1)} className="glass-dark absolute start-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full" aria-label="התמונה הקודמת">
              <span aria-hidden className="text-xl leading-none">›</span>
            </button>
          )}
          {i < media.length - 1 && (
            <button type="button" onClick={() => go(i + 1)} className="glass-dark absolute end-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full" aria-label="התמונה הבאה">
              <span aria-hidden className="text-xl leading-none">‹</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ImageSlide({ media, label }: { media: MediaItem; label: string }) {
  const url = useMediaUrl(media.src);
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative size-full shrink-0 snap-center bg-[#1c1c1e]">
      {failed ? (
        <div className="grid size-full place-items-center text-sm text-white/70">התמונה לא נטענה</div>
      ) : (
        url && <img src={url} alt={label} className="media size-full object-cover" style={{ filter: filterCss(media.filter) }} onError={() => setFailed(true)} />
      )}
      <Overlays items={media.overlays} />
    </div>
  );
}

export function usePostItems(posts: Post[]) {
  const db = useApp((s) => s.db);
  return useMemo(
    () =>
      posts.map(
        (post): RankedPost => ({
          post,
          business: db.businesses.find((b) => b.id === post.businessId)!,
          service: db.services.find((s) => s.id === post.serviceId && s.active),
          score: { relevance: 0, freshness: 0, saves: 0, engagement: 0, promoted: 0, total: 0, reasons: ["נפתח מתוך קישור או פרופיל"] },
        }),
      ),
    [posts, db],
  );
}

