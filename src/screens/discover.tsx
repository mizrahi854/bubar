import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CalendarCheck, ChevronDown, Grid3x3, Images, List, Map as MapIcon, MapPin, Play, Search, SearchX, SlidersHorizontal, Star, X } from "lucide-react";
import clsx from "clsx";
import { DateTime } from "luxon";
import { activeFilterCount, allTags, EMPTY_FILTERS, searchBusinesses, searchPosts, type BusinessResult, type DiscoverFilters } from "../domain/discover";
import { CATEGORIES, CATEGORY_LABEL, compact, price } from "../domain/format";
import { TZ, fmtShortDate, fmtTime } from "../domain/time";
import type { DB, Post } from "../domain/types";
import { useApp, useMe } from "../store/app";
import { requestGeo, useMediaUrl, useScrollRestore } from "../ui/hooks";
import { Avatar, Button, Chip, DemoLabel, EmptyState, Field, Input, Segmented, Select, btn } from "../ui/kit";
import { Sheet } from "../ui/overlays";
import { TopBar } from "../ui/shell";
import { CityPicker } from "./city-picker";
import { StoriesTray } from "./stories";

type DiscoverState = ReturnType<typeof useApp.getState>["discover"];

function setDiscover(patch: Partial<DiscoverState>) {
  useApp.setState((s) => ({ discover: { ...s.discover, ...patch } }));
}

export function DiscoverScreen() {
  useScrollRestore("discover");
  const db = useApp((s) => s.db);
  const me = useMe();
  const geo = useApp((s) => s.geo);
  const d = useApp((s) => s.discover);
  const [sp, setSp] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const [q, setQ] = useState(d.q);

  // #tag links from the feed
  useEffect(() => {
    const tag = sp.get("tag");
    if (tag) {
      setDiscover({ ...EMPTY_FILTERS, tags: [tag], cityId: d.cityId, mode: "posts", view: d.view });
      setSp({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDiscover({ q }), 250);
    return () => clearTimeout(t);
  }, [q]);

  const results = useMemo(() => searchBusinesses(db, me, d, geo), [db, me, d, geo]);
  const posts = useMemo(() => searchPosts(db, me, d, new Set(results.map((r) => r.business.id))), [db, me, d, results]);
  const city = db.cities.find((c) => c.id === d.cityId);
  const count = activeFilterCount(d);
  const reset = () => {
    setQ("");
    setDiscover({ ...EMPTY_FILTERS, mode: d.mode, view: d.view });
  };
  const empty = d.mode === "posts" ? posts.length === 0 : results.length === 0;

  return (
    <>
      <TopBar title="גילוי" large />
      <div className="mx-auto max-w-5xl px-4 pb-6 lg:px-6">
        <StoriesTray className="mb-2" />
        <Link to="/inspiration" className="mb-1 flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3 text-sm hover:bg-surface-2">
          <span>
            <span className="block font-semibold">השראה מאינסטגרם</span>
            <span className="text-xs text-muted">20 רילסים של שיער, ציפורניים ואיפור, עם קרדיט ליוצרים</span>
          </span>
          <span aria-hidden>‹</span>
        </Link>
        <form role="search" onSubmit={(e) => e.preventDefault()} className="mt-2 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="עסק, שירות, איש מקצוע או סגנון" aria-label="חיפוש" className="ps-12" enterKeyHint="search" />
          </div>
          <button type="button" onClick={() => setFiltersOpen(true)} className={clsx(btn("secondary", "md"), "relative w-12 shrink-0 px-0")} aria-label={`מסננים${count ? ` (${count} פעילים)` : ""}`}>
            <SlidersHorizontal className="size-5" aria-hidden />
            {count > 0 && <span className="absolute -end-1 -top-1 grid size-5 place-items-center rounded-full bg-ink text-[11px] font-bold text-ink-inverse">{count}</span>}
          </button>
        </form>

        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
          <Chip active={!!d.cityId} onClick={() => setCityOpen(true)}>
            <MapPin className="size-4" aria-hidden /> {city?.name ?? "כל הארץ"} <ChevronDown className="size-4" aria-hidden />
          </Chip>
          <Chip active={d.today} onClick={() => setDiscover({ today: !d.today, date: null })}>
            <CalendarCheck className="size-4" aria-hidden /> פנוי היום
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c.id} active={d.category === c.id} onClick={() => setDiscover({ category: d.category === c.id ? null : c.id })}>
              {c.label}
            </Chip>
          ))}
        </div>

        <ActiveChips db={db} d={d} onReset={reset} />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label="מה להציג"
            value={d.mode}
            onChange={(mode) => setDiscover({ mode })}
            options={[
              { value: "posts", label: "עבודות", icon: <Images className="size-4" aria-hidden /> },
              { value: "businesses", label: "עסקים", icon: <List className="size-4" aria-hidden /> },
            ]}
          />
          {d.mode === "businesses" && (
            <div role="radiogroup" aria-label="תצוגה" className="flex rounded-full bg-surface p-1">
              {(
                [
                  ["list", "רשימה", List],
                  ["grid", "רשת", Grid3x3],
                  ["map", "מפה", MapIcon],
                ] as const
              ).map(([v, label, Icon]) => (
                <button key={v} type="button" role="radio" aria-checked={d.view === v} aria-label={label} onClick={() => setDiscover({ view: v })} className={clsx("grid size-10 place-items-center rounded-full", d.view === v ? "bg-bg shadow-sm" : "text-muted")}>
                  <Icon className="size-5" aria-hidden />
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="mt-3 text-sm text-muted" aria-live="polite">
          {d.mode === "posts" ? `${posts.length} עבודות` : `${results.length} עסקים`}
          {city ? ` ב${city.name}` : " בכל הארץ"}
        </p>

        <section className="mt-3">
          {empty ? (
            <EmptyState
              icon={<SearchX className="size-6" aria-hidden />}
              title={city ? `אין תוצאות ב${city.name}` : "לא נמצאו תוצאות"}
              text={
                city
                  ? "לא נציג תוצאות מערים אחרות בלי לשאול. אפשר להרחיב את האזור או לשנות מסננים."
                  : d.today || d.date
                    ? "ייתכן שאין תורים פנויים במועד שבחרת. נסו תאריך אחר."
                    : "נסו מילה אחרת או פחות מסננים."
              }
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  {city && <Button onClick={() => setDiscover({ cityId: null })}>הרחבה לכל הארץ</Button>}
                  {count > 0 && (
                    <Button variant="secondary" onClick={reset}>
                      ניקוי מסננים
                    </Button>
                  )}
                </div>
              }
            />
          ) : d.mode === "posts" ? (
            <PostGrid posts={posts} />
          ) : d.view === "map" ? (
            <DemoMap db={db} results={results} />
          ) : d.view === "grid" ? (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {results.map((r) => (
                <li key={r.business.id}>
                  <BusinessTile r={r} />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="flex flex-col gap-3">
              {results.map((r) => (
                <li key={r.business.id}>
                  <BusinessRow r={r} db={db} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <CityPicker open={cityOpen} onClose={() => setCityOpen(false)} onPick={(cityId) => setDiscover({ cityId, maxKm: null })} />
      <FiltersSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} db={db} />
    </>
  );
}

function ActiveChips({ db, d, onReset }: { db: DB; d: DiscoverFilters; onReset: () => void }) {
  const chips: { label: string; clear: () => void }[] = [];
  if (d.maxKm) chips.push({ label: `עד ${d.maxKm} ק״מ ממך`, clear: () => setDiscover({ maxKm: null }) });
  if (d.serviceQuery) chips.push({ label: `שירות: ${d.serviceQuery}`, clear: () => setDiscover({ serviceQuery: "" }) });
  for (const t of d.tags) chips.push({ label: `#${t}`, clear: () => setDiscover({ tags: d.tags.filter((x) => x !== t) }) });
  if (d.professionalId) chips.push({ label: `איש מקצוע: ${db.professionals.find((p) => p.id === d.professionalId)?.name}`, clear: () => setDiscover({ professionalId: null }) });
  if (d.minPrice != null || d.maxPrice != null) chips.push({ label: `₪${d.minPrice ?? 0}–${d.maxPrice ?? "∞"}`, clear: () => setDiscover({ minPrice: null, maxPrice: null }) });
  if (d.minRating) chips.push({ label: `דירוג ${d.minRating}+`, clear: () => setDiscover({ minRating: null }) });
  if (d.date) chips.push({ label: fmtShortDate(DateTime.fromISO(d.date, { zone: TZ }).toISO()!), clear: () => setDiscover({ date: null }) });
  const total = activeFilterCount(d);
  if (!chips.length && !total) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <span key={c.label} className="inline-flex h-8 items-center gap-1 rounded-full bg-surface ps-3 pe-1 text-sm">
          {c.label}
          <button type="button" onClick={c.clear} className="grid size-7 place-items-center rounded-full hover:bg-surface-2" aria-label={`הסרת ${c.label}`}>
            <X className="size-3.5" />
          </button>
        </span>
      ))}
      <button type="button" onClick={onReset} className="text-sm font-semibold underline underline-offset-4">
        איפוס הכול
      </button>
    </div>
  );
}

function PostGrid({ posts }: { posts: Post[] }) {
  return (
    <ul className="grid grid-cols-3 gap-1 md:gap-2">
      {posts.map((p) => (
        <li key={p.id}>
          <PostTile post={p} />
        </li>
      ))}
    </ul>
  );
}

export function PostTile({ post, pinned }: { post: Post; pinned?: boolean }) {
  const cover = useMediaUrl(post.cover ?? post.media[0]?.poster ?? post.media[0]?.src);
  return (
    <Link to={`/post/${post.id}`} className="group relative block aspect-[3/4] overflow-hidden rounded-xl bg-surface" aria-label={post.caption || "פוסט"}>
      {cover && <img src={cover} alt="" loading="lazy" className="media size-full object-cover transition duration-500 group-hover:scale-105" />}
      <span className="absolute start-1.5 top-1.5 flex gap-1">
        {post.kind === "reel" && (
          <span className="grid size-6 place-items-center rounded-full bg-black/45 text-white backdrop-blur">
            <Play className="size-3 fill-white" aria-label="רילס" />
          </span>
        )}
        {post.kind === "carousel" && (
          <span className="grid size-6 place-items-center rounded-full bg-black/45 text-white backdrop-blur">
            <Images className="size-3.5" aria-label="קרוסלה" />
          </span>
        )}
        {pinned && <span className="rounded-full bg-white px-1.5 text-[10px] font-bold text-[#111]">נעוץ</span>}
      </span>
      <span className="absolute bottom-1.5 start-1.5 rounded-full bg-black/45 px-1.5 text-[11px] font-semibold text-white backdrop-blur">
        ♥ <span className="num">{compact(post.likedBy.length)}</span>
      </span>
      {post.status !== "published" && <span className="absolute inset-x-1.5 bottom-1.5 rounded-full bg-white/90 text-center text-[11px] font-bold text-[#111]">{post.status === "draft" ? "טיוטה" : "מוסתר"}</span>}
    </Link>
  );
}

function BusinessRow({ r, db }: { r: BusinessResult; db: DB }) {
  const city = db.cities.find((c) => c.id === r.business.cityId);
  return (
    <Link to={`/b/${r.business.id}`} className="block overflow-hidden rounded-[var(--radius-card)] border border-line bg-bg transition hover:shadow-md">
      <div className="grid h-36 grid-cols-3 gap-0.5 bg-surface">
        {[0, 1, 2].map((k) => {
          const p = r.thumbs[k];
          return <Thumb key={k} src={p ? (p.cover ?? p.media[0]?.src) : k === 0 ? r.business.cover : undefined} />;
        })}
      </div>
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-center gap-3">
          <Avatar src={r.business.avatar} name={r.business.name} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-bold">{r.business.name}</h3>
              {r.business.isDemo && <DemoLabel>עסק לדוגמה</DemoLabel>}
            </div>
            <div className="truncate text-sm text-muted">
              {r.business.categories.map((c) => CATEGORY_LABEL[c]).join(" · ")} · {r.business.isMobile ? `נייד, ${city?.name} והסביבה` : city?.name}
              {r.distanceKm != null && <span className="num"> · {r.distanceKm.toFixed(1)} ק״מ</span>}
            </div>
          </div>
          {r.rating.count > 0 && (
            <span className="flex shrink-0 items-center gap-1 text-sm font-semibold">
              <Star className="size-4 fill-ink" aria-hidden /> <span className="num">{r.rating.avg.toFixed(1)}</span>
              <span className="font-normal text-muted">({r.rating.count})</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-muted">{r.matchingPros.map((p) => p.name.split(" ")[0]).join(", ")}</span>
          {r.minPrice != null && <span className="num font-semibold">{price(r.minPrice, true)}</span>}
        </div>
        {r.nextSlot && (
          <div className="flex items-center gap-1.5 rounded-xl bg-ok-soft px-3 py-1.5 text-xs font-semibold text-ok">
            <CalendarCheck className="size-3.5" aria-hidden /> פנוי {fmtShortDate(r.nextSlot)} ב־<span className="num">{fmtTime(r.nextSlot)}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

function BusinessTile({ r }: { r: BusinessResult }) {
  const src = r.thumbs[0]?.cover ?? r.business.cover;
  return (
    <Link to={`/b/${r.business.id}`} className="group block overflow-hidden rounded-[var(--radius-card)] border border-line">
      <div className="relative aspect-square bg-surface">
        <Thumb src={src} />
        {r.rating.count > 0 && (
          <span className="glass-light absolute start-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold">
            ★ <span className="num">{r.rating.avg.toFixed(1)}</span>
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="truncate font-bold">{r.business.name}</div>
        <div className="truncate text-xs text-muted">{r.minPrice != null ? price(r.minPrice, true) : ""}</div>
      </div>
    </Link>
  );
}

function Thumb({ src }: { src?: string }) {
  const url = useMediaUrl(src);
  return <div className="size-full overflow-hidden bg-surface">{url && <img src={url} alt="" loading="lazy" className="media size-full object-cover" />}</div>;
}

/** Schematic map drawn from city coordinates — clearly a demo, no external map service. */
function DemoMap({ db, results }: { db: DB; results: BusinessResult[] }) {
  const [sel, setSel] = useState<string | null>(null);
  const bounds = { minLat: 31.1, maxLat: 33.0, minLng: 34.5, maxLng: 35.4 };
  const pos = (lat: number, lng: number) => ({ x: ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100, y: ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 100 });
  const byCity = new Map<string, BusinessResult[]>();
  for (const r of results) byCity.set(r.business.cityId, [...(byCity.get(r.business.cityId) ?? []), r]);
  const selected = sel ? byCity.get(sel) ?? [] : [];
  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[3/4] max-h-[70vh] w-full overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface sm:aspect-[4/3]">
        <DemoLabel className="absolute start-3 top-3 z-10 bg-bg">מפת דמו — ייצוג סכמטי, לא מפה אמיתית</DemoLabel>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
          <path d="M18 0 L22 20 L24 38 L27 55 L30 72 L33 100 L0 100 L0 0 Z" fill="var(--surface-2)" />
        </svg>
        {[...byCity.entries()].map(([cityId, rs]) => {
          const c = db.cities.find((x) => x.id === cityId)!;
          const p = pos(c.lat, c.lng);
          return (
            <button
              key={cityId}
              type="button"
              onClick={() => setSel(cityId)}
              aria-label={`${c.name}: ${rs.length} עסקים`}
              aria-pressed={sel === cityId}
              className={clsx("absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold shadow-md transition", sel === cityId ? "bg-ink text-ink-inverse" : "bg-bg text-ink")}
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              <MapPin className="size-3.5" aria-hidden /> {c.name} <span className="num">{rs.length}</span>
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <ul className="flex flex-col gap-3">
          {selected.map((r) => (
            <li key={r.business.id}>
              <BusinessRow r={r} db={db} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FiltersSheet({ open, onClose, db }: { open: boolean; onClose: () => void; db: DB }) {
  const d = useApp((s) => s.discover);
  const geoStatus = useApp((s) => s.geoStatus);
  const [draft, setDraft] = useState(d);
  useEffect(() => {
    if (open) setDraft(d);
  }, [open, d]);
  const tags = useMemo(() => allTags(db).slice(0, 16), [db]);
  const pros = useMemo(
    () =>
      db.professionals
        .filter((p) => p.active)
        .filter((p) => {
          const b = db.businesses.find((x) => x.id === p.businessId)!;
          return b.status === "active" && (!draft.cityId || b.cityId === draft.cityId || b.serviceAreaCityIds.includes(draft.cityId)) && (!draft.category || b.categories.includes(draft.category));
        }),
    [db, draft.cityId, draft.category],
  );
  const today = DateTime.now().setZone(TZ).toISODate()!;
  return (
    <Sheet open={open} onClose={onClose} title="מסננים" wide>
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">מרחק</legend>
          {geoStatus === "granted" ? (
            <Select aria-label="מרחק מקסימלי" value={draft.maxKm ?? ""} onChange={(e) => setDraft({ ...draft, maxKm: e.target.value ? Number(e.target.value) : null })}>
              <option value="">ללא הגבלה</option>
              {[3, 5, 10, 20, 40].map((k) => (
                <option key={k} value={k}>
                  עד {k} ק״מ ממני
                </option>
              ))}
            </Select>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface p-3 text-sm">
              <span className="flex-1 text-muted">{geoStatus === "denied" ? "אין הרשאת מיקום — סננו לפי עיר." : "מרחק זמין רק אחרי שתאשרו מיקום."}</span>
              {geoStatus !== "denied" && (
                <Button size="sm" variant="secondary" onClick={() => requestGeo()}>
                  שימוש במיקום
                </Button>
              )}
            </div>
          )}
        </fieldset>
        <Field label="קטגוריה" htmlFor="f-cat">
          <Select id="f-cat" value={draft.category ?? ""} onChange={(e) => setDraft({ ...draft, category: (e.target.value || null) as DiscoverFilters["category"], professionalId: null })}>
            <option value="">הכול</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="שירות" htmlFor="f-svc">
          <Input id="f-svc" value={draft.serviceQuery} onChange={(e) => setDraft({ ...draft, serviceQuery: e.target.value })} placeholder="למשל: בלייאז׳, פייד, ג׳ל" />
        </Field>
        <Field label="איש מקצוע" htmlFor="f-pro" hint="בחירה מסננת את העבודות, השירותים והזמינות של אותו אדם.">
          <Select id="f-pro" value={draft.professionalId ?? ""} onChange={(e) => setDraft({ ...draft, professionalId: e.target.value || null })}>
            <option value="">כל אנשי המקצוע</option>
            {pros.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {db.businesses.find((b) => b.id === p.businessId)?.name}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">סגנון</legend>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <Chip key={t} active={draft.tags.includes(t)} onClick={() => setDraft({ ...draft, tags: draft.tags.includes(t) ? draft.tags.filter((x) => x !== t) : [...draft.tags, t] })}>
                #{t}
              </Chip>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">טווח מחיר (₪)</legend>
          <div className="flex items-center gap-2">
            <Input inputMode="numeric" aria-label="מחיר מינימלי" placeholder="מ־" value={draft.minPrice ?? ""} onChange={(e) => setDraft({ ...draft, minPrice: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null })} />
            <span aria-hidden>—</span>
            <Input inputMode="numeric" aria-label="מחיר מקסימלי" placeholder="עד" value={draft.maxPrice ?? ""} onChange={(e) => setDraft({ ...draft, maxPrice: e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null })} />
          </div>
          {draft.minPrice != null && draft.maxPrice != null && draft.minPrice > draft.maxPrice && <p className="mt-1 text-xs text-bad">המחיר המינימלי גבוה מהמקסימלי</p>}
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">דירוג מינימלי</legend>
          <div className="flex gap-2">
            {[null, 3, 4, 4.5].map((r) => (
              <Chip key={String(r)} active={draft.minRating === r} onClick={() => setDraft({ ...draft, minRating: r })}>
                {r ? `★ ${r}+` : "הכול"}
              </Chip>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">מתי</legend>
          <label className="flex h-12 items-center gap-3 rounded-2xl border border-line px-4">
            <input type="checkbox" className="size-5 accent-[#111]" checked={draft.today} onChange={(e) => setDraft({ ...draft, today: e.target.checked, date: null })} />
            זמינות היום
          </label>
          {!draft.today && <Input type="date" aria-label="תאריך" min={today} value={draft.date ?? ""} onChange={(e) => setDraft({ ...draft, date: e.target.value || null })} />}
        </fieldset>
        <div className="sticky bottom-0 -mx-5 flex gap-2 bg-bg px-5 pt-2">
          <Button
            size="lg"
            className="flex-1"
            disabled={draft.minPrice != null && draft.maxPrice != null && draft.minPrice > draft.maxPrice}
            onClick={() => {
              setDiscover(draft);
              onClose();
            }}
          >
            הצגת תוצאות
          </Button>
          <Button
            size="lg"
            variant="secondary"
            onClick={() => {
              setDiscover({ ...EMPTY_FILTERS, q: d.q, mode: d.mode, view: d.view });
              onClose();
            }}
          >
            איפוס
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
