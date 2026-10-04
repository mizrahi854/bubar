import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ExternalLink, Search } from "lucide-react";
import clsx from "clsx";
import { CATEGORY_LABEL, embedUrl, INSPIRATION_REELS, SOURCE_PROFILES, type InspirationReel } from "../data/inspiration";
import { useApp } from "../store/app";
import { Segmented } from "../ui/kit";
import { Page, TopBar } from "../ui/shell";

/** Outline glyph matching the lucide icon style (lucide no longer ships brand icons). */
function Instagram({ className }: { className?: string; "aria-hidden"?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  );
}

/** Sends the viewer to Discover, filtered to businesses offering this kind of service. */
function useFindBusiness() {
  const navigate = useNavigate();
  return (r: InspirationReel) => {
    useApp.setState((s) => ({ discover: { ...s.discover, category: r.category, mode: "businesses" } }));
    navigate("/discover");
  };
}

/**
 * Instagram's official embed. It loads straight from Instagram in the viewer's browser; nothing is
 * downloaded or re-hosted. The publishing account is shown inside the embed by Instagram itself.
 */
export function InstagramEmbed({ reel, mount = true, className }: { reel: InspirationReel; mount?: boolean; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!mount || loaded) return;
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, [mount, loaded]);
  return (
    <div className={clsx("relative overflow-hidden rounded-2xl bg-surface", className)}>
      {mount && (
        <iframe
          src={embedUrl(reel.sourceReelUrl)}
          title={`רילס מאינסטגרם: ${reel.topic}${reel.creator ? ` · ${reel.creator}` : ""}`}
          className="absolute inset-0 size-full border-0 bg-white"
          loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setLoaded(true)}
        />
      )}
      {!loaded && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-muted">
          <div className="flex flex-col items-center gap-3">
            <Instagram className="size-8" aria-hidden />
            {slow ? (
              <>
                <p>ההטמעה של אינסטגרם לא נטענת כאן (לפעמים חוסם תוכן או תצוגה מוטמעת חוסמים אותה).</p>
                <a href={reel.sourceReelUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-4">
                  צפייה באינסטגרם ↗
                </a>
              </>
            ) : (
              <p>טוען מאינסטגרם…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Credit line: the attribution from the source list, or an explicit "not verified". */
export function InspirationCredit({ reel, dark }: { reel: InspirationReel; dark?: boolean }) {
  const muted = dark ? "text-white/75" : "text-muted";
  return (
    <div className="flex flex-col gap-1 text-sm">
      <p>
        {reel.creator && reel.sourceProfileUrl ? (
          <>
            קרדיט:{" "}
            <a href={reel.sourceProfileUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline-offset-4 hover:underline">
              {reel.creator} ↗
            </a>
          </>
        ) : (
          <span className="font-semibold">היוצר/ת לא אומת/ה</span>
        )}
        <span className={clsx("ms-2 text-xs", muted)}>{reel.attribution === "per_source" ? "לפי המקור שנמסר, לא אומת מול החשבון" : "החשבון המפרסם מופיע בהטמעה"}</span>
      </p>
      <p className={clsx("text-xs", muted)}>מאינסטגרם · לא חלק מ־Beautigo ולא מציע/ה תורים כאן</p>
    </div>
  );
}

/** Full-height card shown between reels in the "For you" feed. Mounts the embed only when near the viewport. */
export function InspirationFeedCard({ reel, index, near }: { reel: InspirationReel; index: number; near: boolean }) {
  const find = useFindBusiness();
  return (
    <section data-index={index} aria-label={`השראה מאינסטגרם: ${reel.topic}`} className="relative flex h-[100dvh] snap-start snap-always items-center justify-center bg-[#0b0b0c] text-white lg:py-4">
      <div className="flex h-full w-full max-w-[440px] flex-col gap-3 px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-[calc(4.5rem+env(safe-area-inset-top))] lg:pb-4 lg:pt-4">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
            <Instagram className="size-3.5" aria-hidden /> השראה מאינסטגרם · {CATEGORY_LABEL[reel.category]}
          </span>
          <a href={reel.sourceReelUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold underline-offset-4 hover:underline">
            פתיחה באינסטגרם <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
        <InstagramEmbed reel={reel} mount={near} className="min-h-0 flex-1" />
        <InspirationCredit reel={reel} dark />
        <button type="button" onClick={() => find(reel)} className="flex h-12 items-center justify-center gap-2 rounded-full bg-white text-sm font-bold text-[#111]">
          <Search className="size-4" aria-hidden /> מצאו עסק ל{CATEGORY_LABEL[reel.category]} ב־Beautigo
        </button>
      </div>
    </section>
  );
}

type Filter = "all" | InspirationReel["category"];

/** /inspiration — all supplied reels by category, plus the source profiles as external links. */
export function InspirationScreen() {
  const [cat, setCat] = useState<Filter>("all");
  const find = useFindBusiness();
  const reels = useMemo(() => INSPIRATION_REELS.filter((r) => cat === "all" || r.category === cat), [cat]);
  return (
    <>
      <TopBar title="השראה מאינסטגרם" back />
      <Page className="max-w-5xl">
        <p className="mb-3 text-sm leading-relaxed text-muted">
          רילסים ציבוריים מאינסטגרם, מוצגים דרך ההטמעה הרשמית של אינסטגרם עם קרדיט ליוצרים. הם לא הועלו ל־Beautigo, והיוצרים לא פעילים כאן. אהבת סגנון? מצאו עסק שעושה את זה.
        </p>
        <Segmented
          label="קטגוריה"
          value={cat}
          onChange={setCat}
          options={[
            { value: "all", label: "הכול" },
            { value: "hair", label: "שיער" },
            { value: "nails", label: "ציפורניים" },
            { value: "makeup", label: "איפור" },
          ]}
        />
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reels.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-2xl border border-line p-3">
              <div className="flex items-center justify-between gap-2 text-xs text-muted">
                <span>
                  #{r.n} · {CATEGORY_LABEL[r.category]} · {r.topic}
                </span>
                <a href={r.sourceReelUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-ink" aria-label={`פתיחת רילס ${r.n} באינסטגרם`}>
                  <ExternalLink className="size-3.5" aria-hidden /> אינסטגרם
                </a>
              </div>
              <InstagramEmbed reel={r} className="h-[560px]" />
              <InspirationCredit reel={r} />
              <button type="button" onClick={() => find(r)} className="h-11 rounded-full bg-ink text-sm font-semibold text-ink-inverse">
                מצאו עסק ל{CATEGORY_LABEL[r.category]}
              </button>
            </li>
          ))}
        </ul>
        <section className="mt-8" aria-labelledby="src-profiles">
          <h2 id="src-profiles" className="mb-1 font-bold">
            יוצרים מהרשימה
          </h2>
          <p className="mb-3 text-sm text-muted">קישורים חיצוניים לאינסטגרם. אלה לא עסקים ב־Beautigo.</p>
          <ul className="flex flex-wrap gap-2">
            {SOURCE_PROFILES.map((p) => (
              <li key={p.handle}>
                <a href={p.sourceProfileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line px-3 text-sm hover:bg-surface">
                  <Instagram className="size-4" aria-hidden />
                  <span dir="ltr">@{p.handle}</span>
                  <span className="text-xs text-muted">· {p.field}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
        <p className="mt-6 text-xs text-muted">
          רוצים שהיוצרים יופיעו כעסקים אמיתיים עם תורים? הם צריכים להצטרף בעצמם. <Link to="/discover" className="underline">חזרה לגילוי</Link>
        </p>
      </Page>
    </>
  );
}
