import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { AlertTriangle, Bell, Bookmark, CalendarPlus, ChevronDown, Heart, Info, Loader2, MapPin, MessageCircle, MoreHorizontal, Pause, Play, Send, Sparkles, Volume2, VolumeX } from "lucide-react";
import clsx from "clsx";
import { rankFeed, type FeedTab, type RankedPost } from "../domain/feed";
import { CATEGORY_LABEL, compact, duration, price } from "../domain/format";
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

/** Vertical snap list; exactly one item is active and only it may play. */
const sourceOf = (tabKey: string): TrafficSource => (tabKey === "following" ? "following" : tabKey === "nearby" ? "nearby" : tabKey === "for_you" ? "feed" : "share");

export function FeedList({ items, tabKey, empty, startIndex = 0 }: { items: RankedPost[]; tabKey: string; empty?: React.ReactNode; startIndex?: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  const saved = useApp((s) => (tabKey in s.feedIndex ? s.feedIndex[tabKey as FeedTab] : 0));
  const [active, setActive] = useState(startIndex || saved || 0);
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  const [muted, setMuted] = useState(true);
  const reduced = useReducedMotion();

  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  // Restore position when returning from a profile or booking
  useEffect(() => {
    const idx = startIndex || saved;
    if (idx && scroller.current) scroller.current.querySelector<HTMLElement>(`[data-index="${idx}"]`)?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting && e.intersectionRatio >= 0.6) setActive(Number((e.target as HTMLElement).dataset.index));
      },
      { root, threshold: [0.6] },
    );
    root.querySelectorAll("[data-index]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [items.length]);

  useEffect(() => {
    if (tabKey in useApp.getState().feedIndex) useApp.setState((s) => ({ feedIndex: { ...s.feedIndex, [tabKey]: active } }));
  }, [active, tabKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select,[role=dialog]")) return;
      const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = Math.max(0, Math.min(items.length - 1, active + step));
      scroller.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, items.length, reduced]);

  if (!items.length) return <div className="grid h-full place-items-center px-6 text-ink">{empty}</div>;
  return (
    <div ref={scroller} className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto overscroll-contain" aria-label="פיד עבודות">
      {items.map((it, i) => (
        <FeedItem key={it.post.id} item={it} index={i} active={i === active} near={Math.abs(i - active) <= 1} pageVisible={visible} muted={muted} onToggleMute={() => setMuted((m) => !m)} source={sourceOf(tabKey)} />
      ))}
      <div className="flex h-40 snap-end items-center justify-center text-sm text-white/70">ראית הכול כרגע ✨</div>
    </div>
  );
}

function FeedItem({ item, index, active, near, pageVisible, muted, onToggleMute, source }: { item: RankedPost; index: number; active: boolean; near: boolean; pageVisible: boolean; muted: boolean; onToggleMute: () => void; source: TrafficSource }) {
  const { post, business, service } = item;
  const db = useApp((s) => s.db);
  const me = useMe();
  const mode = useMode();
  const navigate = useNavigate();
  const captionsOn = useApp((s) => s.settings.captions);
  const [sheet, setSheet] = useState<null | "comments" | "save" | "more" | "report" | "why">(null);
  const [burst, setBurst] = useState(0);
  const liked = !!me && post.likedBy.includes(me.id);
  const saved = isSaved(db, me?.id ?? null, post.id);
  const following = !!me?.followingBusinesses.includes(business.id);
  const pro = db.professionals.find((p) => p.id === post.professionalId);
  const city = db.cities.find((c) => c.id === post.cityId);
  const comments = db.comments.filter((c) => c.postId === post.id && !c.hidden).length;
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
    <section data-index={index} aria-label={`${post.kind === "reel" ? "רילס" : "פוסט"} של ${business.name}`} className="relative flex h-[100dvh] snap-start snap-always items-center justify-center lg:py-4">
      <div className="relative h-full w-full overflow-hidden bg-[#111] lg:aspect-[9/16] lg:h-full lg:w-auto lg:rounded-[28px]">
        {post.kind === "reel" ? (
          <ReelVideo media={post.media[0]} active={active} near={near} pageVisible={pageVisible} muted={muted} onToggleMute={onToggleMute} onDoubleTap={() => !liked && like()} onWatch={(sec, done) => trackWatch(business.id, post.id, sec, done, source)} />
        ) : (
          <ImageMedia media={post.media} onDoubleTap={() => !liked && like()} />
        )}
        {burst > 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Heart key={burst} className="size-28 animate-heart fill-white text-white drop-shadow-xl" aria-hidden />
          </div>
        )}
        {captionsOn && post.subtitle && (
          <p className="pointer-events-none absolute inset-x-6 top-[42%] text-center text-lg font-bold leading-snug text-white text-shadow" aria-hidden>
            {post.subtitle}
          </p>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
        <div className="absolute start-3 top-[calc(4.5rem+env(safe-area-inset-top))] flex flex-col items-start gap-1.5 lg:top-16">
          {item.campaignId && <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-[#111]">ממומן</span>}
          {post.isSample && <span className="rounded-full bg-black/50 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">תוכן לדוגמה · איור מקורי</span>}
          {(post.media[0]?.sourceReelUrl || post.media[0]?.creator) && (
            <a
              href={post.media[0].sourceReelUrl ?? post.media[0].sourceProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-black/50 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur underline-offset-2 hover:underline"
            >
              קרדיט: {post.media[0].creator ?? "המקור המקורי"} ↗
            </a>
          )}
        </div>

        {/* Bottom info */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2.5 p-4 pb-[calc(6.25rem+env(safe-area-inset-bottom))] pe-[4.5rem] lg:pb-5 lg:pe-4">
          <div className="flex items-center gap-2.5">
            {hasLiveStory(db, business.id) ? (
              <StoryAvatar business={business} size={40} dark />
            ) : (
              <Link to={`/b/${business.id}`} aria-hidden tabIndex={-1}>
                <Avatar src={business.avatar} name={business.name} size={42} ring />
              </Link>
            )}
            <Link to={`/b/${business.id}`} className="flex min-w-0 items-center gap-2.5">
              <span className="min-w-0">
                <span className="block truncate font-bold text-shadow">{business.name}</span>
                <span className="block truncate text-xs text-white/80">
                  {pro ? `${pro.name} · ` : ""}
                  {service ? CATEGORY_LABEL[service.category] : CATEGORY_LABEL[business.categories[0]]}
                </span>
              </span>
            </Link>
            {mode !== "business" && (
              <button type="button" onClick={follow} aria-pressed={following} className={clsx("h-8 shrink-0 rounded-full px-3.5 text-xs font-bold transition active:scale-95", following ? "border border-white/60 text-white" : "bg-white text-[#111]")}>
                {following ? "במעקב" : "מעקב"}
              </button>
            )}
          </div>
          <p className="line-clamp-2 text-[15px] leading-snug text-shadow">
            <RichText text={post.caption} resolveHandle={(h) => { const b = db.businesses.find((x) => x.username === h); return b ? `/b/${b.id}` : null; }} />
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/85">
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden /> {business.isMobile ? `שירות נייד · ${city?.name}` : city?.name}
            </span>
            {post.tags.slice(0, 3).map((t) => (
              <Link key={t} to={`/tag/${encodeURIComponent(t)}`} className="rounded-full bg-white/15 px-2 py-0.5 hover:bg-white/25">
                #{t}
              </Link>
            ))}
            <button type="button" onClick={() => setSheet("why")} className="inline-flex items-center gap-1 rounded-full px-1 py-0.5 text-white/70 hover:text-white">
              <Info className="size-3.5" aria-hidden /> למה זה מוצג לי
            </button>
          </div>
          <div className="glass-light flex items-center gap-3 rounded-[22px] p-2 ps-4">
            <div className="min-w-0 flex-1">
              {service ? (
                <>
                  <div className="truncate text-sm font-bold">{service.name}</div>
                  <div className="truncate text-xs text-[#4a4a52]">
                    <span className="num font-semibold text-[#111]">{price(service.price, service.priceFrom)}</span> · {duration(service.durationMin)}
                    {service.approval === "manual" && " · באישור העסק"}
                  </div>
                </>
              ) : (
                <>
                  <div className="truncate text-sm font-bold">רוצה את זה?</div>
                  <div className="truncate text-xs text-[#4a4a52]">בחרו שירות ב{business.name}</div>
                </>
              )}
            </div>
            {me?.businessId === business.id && (mode === "business" || mode === "staff") ? (
              <Link to={mode === "business" ? `/create?edit=${post.id}` : "/manage"} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-[#111] px-4 text-sm font-bold text-white active:scale-95">
                {mode === "business" ? "עריכת הפוסט" : "ליומן שלי"}
              </Link>
            ) : (
              <button type="button" onClick={book} className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-[#111] px-4 text-sm font-bold text-white active:scale-95">
                <CalendarPlus className="size-4" aria-hidden /> קביעת תור
              </button>
            )}
          </div>
        </div>

        {/* Action rail */}
        <div className="absolute bottom-[calc(13.5rem+env(safe-area-inset-bottom))] end-2 flex flex-col items-center gap-3 lg:bottom-28">
          <Rail label={liked ? "ביטול לייק" : "לייק"} count={post.likedBy.length} pressed={liked} onClick={like}>
            <Heart className={clsx("size-7", liked && "animate-pop fill-white")} />
          </Rail>
          <Rail label="תגובות" count={comments} onClick={() => setSheet("comments")}>
            <MessageCircle className="size-7 -scale-x-100" />
          </Rail>
          <Rail label={saved ? "שמור — ניהול אוספים" : "שמירה"} count={post.savedCount} pressed={saved} onClick={save}>
            <Bookmark className={clsx("size-7", saved && "fill-white")} />
          </Rail>
          <Rail label="שיתוף" count={post.shares} onClick={share}>
            <Send className="size-7 flip-rtl" />
          </Rail>
          <Rail label="אפשרויות נוספות" onClick={() => setSheet("more")}>
            <MoreHorizontal className="size-7" />
          </Rail>
        </div>
      </div>

      <CommentsSheet post={post} open={sheet === "comments"} onClose={() => setSheet(null)} />
      <SaveSheet post={post} open={sheet === "save"} onClose={() => setSheet(null)} />
      <PostMoreSheet post={post} open={sheet === "more"} onClose={() => setSheet(null)} onReport={() => setSheet("report")} />
      <ReportSheet open={sheet === "report"} onClose={() => setSheet(null)} targetType="post" targetId={post.id} />
      <WhySheet item={item} open={sheet === "why"} onClose={() => setSheet(null)} />
    </section>
  );
}

function Rail({ label, count, pressed, onClick, children }: { label: string; count?: number; pressed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <button type="button" onClick={onClick} aria-label={label} aria-pressed={pressed} className="grid size-12 place-items-center rounded-full text-white drop-shadow transition active:scale-90">
        {children}
      </button>
      {count !== undefined && <span className="num -mt-1 text-xs font-semibold text-shadow">{compact(count)}</span>}
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

/** Plays only when active and the page is visible. Poster first; resilient to failures. */
function ReelVideo({ media, active, near, pageVisible, muted, onToggleMute, onDoubleTap, onWatch }: { media: MediaItem; active: boolean; near: boolean; pageVisible: boolean; muted: boolean; onToggleMute: () => void; onDoubleTap: () => void; onWatch?: (seconds: number, completed: boolean) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  // Watch time for creator insights: seconds actually played while this reel is the active one
  const watch = useRef({ seconds: 0, last: -1, completed: false });
  const onWatchRef = useRef(onWatch);
  onWatchRef.current = onWatch;
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
  const lastTap = useRef(0);
  const shouldAutoplay = active && pageVisible && autoplay && !reduced && !userPaused;

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (shouldAutoplay) v.play().catch(() => setState("paused"));
    else {
      v.pause();
      if (!active) setUserPaused(false);
    }
  }, [shouldAutoplay, active]);

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

  return (
    <>
      {poster && <img src={poster} alt="" className="media absolute inset-0 size-full object-cover" aria-hidden />}
      {src && (
        <video
          ref={ref}
          className="media absolute inset-0 size-full object-cover"
          style={{ filter: filterCss(media.filter) }}
          poster={poster ?? undefined}
          muted={muted}
          playsInline
          loop={!media.trimEnd}
          preload={active ? "auto" : near && !dataSaver ? "metadata" : "none"}
          onPlaying={() => setState("playing")}
          onPause={() => setState((s) => (s === "error" ? s : "paused"))}
          onWaiting={() => setState("loading")}
          onCanPlay={() => setState((s) => (s === "loading" ? (ref.current?.paused ? "paused" : "playing") : s))}
          onLoadedMetadata={() => {
            if (media.trimStart && ref.current) ref.current.currentTime = media.trimStart;
          }}
          onTimeUpdate={onTime}
          onClick={onClick}
          aria-label="סרטון"
        >
          <source src={src} type="video/mp4" onError={media.srcWebm ? undefined : () => setState("error")} />
          {media.srcWebm && <source src={media.srcWebm} type="video/webm" onError={() => setState("error")} />}
        </video>
      )}
      <Overlays items={media.overlays} />
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        {active && state === "loading" && <Loader2 className="size-10 animate-spin text-white/80" aria-label="טוען סרטון" />}
        {active && state === "paused" && (
          <button type="button" onClick={toggle} className="glass-dark pointer-events-auto grid size-[72px] place-items-center rounded-full" aria-label="הפעלה">
            <Play className="size-8 translate-x-[-2px] fill-white" />
          </button>
        )}
        {state === "error" && (
          <div className="glass-dark pointer-events-auto flex flex-col items-center gap-3 rounded-3xl px-6 py-5 text-center">
            <AlertTriangle className="size-7" aria-hidden />
            <p className="text-sm">לא הצלחנו לטעון את הסרטון</p>
            <button type="button" onClick={toggle} className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-[#111]">
              נסו שוב
            </button>
          </div>
        )}
      </div>
      <div className="absolute end-3 top-[calc(4.5rem+env(safe-area-inset-top))] z-10 flex flex-col gap-2 lg:top-4">
        <button type="button" onClick={onToggleMute} className="glass-dark grid size-11 place-items-center rounded-full" aria-label={muted ? "הפעלת קול" : "השתקה"} aria-pressed={!muted}>
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>
        {active && (
          <button type="button" onClick={toggle} className="glass-dark grid size-11 place-items-center rounded-full" aria-label={state === "playing" ? "השהיה" : "הפעלה"}>
            {state === "playing" ? <Pause className="size-5" /> : <Play className="size-5" />}
          </button>
        )}
      </div>
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

