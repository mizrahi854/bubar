import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { CalendarPlus, Clock, Flag, MapPin, MessageCircle, MoreHorizontal, Pencil, Phone, Pin, PinOff, Share2, ShieldOff, Star, Truck } from "lucide-react";
import clsx from "clsx";
import type { Business, DB, Review, Service } from "../domain/types";
import { CATEGORY_LABEL, duration, price, WEEKDAYS } from "../domain/format";
import { ratingOf, proRating } from "../domain/discover";
import { visibleTo } from "../domain/feed";
import { depositFor } from "../domain/booking";
import { fmtRelative, minToHHMM } from "../domain/time";
import { blockBusiness, openConversation, togglePin, toggleFollowBusiness, trackEvent, updateBusiness } from "../store/actions";
import { gate, toast, useApp, useMe, useMode } from "../store/app";
import { shareLink } from "../integrations/share";
import { Avatar, Badge, Button, DemoLabel, EmptyState, Field, IconButton, Input, LinkButton, Stars, Textarea } from "../ui/kit";
import { Sheet } from "../ui/overlays";
import { useMediaUrl } from "../ui/hooks";
import { TopBar } from "../ui/shell";
import { PostTile } from "./discover";
import { ReportSheet } from "./social-sheets";
import { StoryAvatar, hasLiveStory } from "./stories";

const TABS = [
  ["posts", "פוסטים"],
  ["reels", "רילס"],
  ["services", "שירותים"],
  ["team", "צוות"],
  ["reviews", "ביקורות"],
  ["about", "אודות"],
] as const;
type Tab = (typeof TABS)[number][0];

export function BusinessScreen() {
  const { businessId } = useParams();
  const db = useApp((s) => s.db);
  const me = useMe();
  const mode = useMode();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = (TABS.some(([t]) => t === sp.get("tab")) ? sp.get("tab") : "posts") as Tab;
  const [edit, setEdit] = useState(false);
  const [more, setMore] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const b = db.businesses.find((x) => x.id === businessId || x.username === businessId);
  const isOwner = !!b && me?.role === "business" && me.businessId === b.id;

  useEffect(() => {
    if (b && !isOwner) trackEvent("profile_visit", b.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.id]);

  if (!b || (b.status !== "active" && !isOwner && me?.role !== "admin") || (me?.blockedBusinessIds.includes(b.id) && !isOwner))
    return (
      <>
        <TopBar title="פרופיל לא זמין" back />
        <div className="p-4">
          <EmptyState
            title="הפרופיל לא זמין"
            text={me?.blockedBusinessIds.includes(b?.id ?? "") ? "חסמת את העסק הזה. אפשר לבטל את החסימה בהגדרות." : "ייתכן שהעסק עדיין בבדיקה, הושעה או הוסר."}
            action={<LinkButton to="/discover">לגילוי עסקים</LinkButton>}
          />
        </div>
      </>
    );

  const city = db.cities.find((c) => c.id === b.cityId);
  const rating = ratingOf(db, b.id);
  const following = !!me?.followingBusinesses.includes(b.id);
  const followers = db.users.filter((u) => u.followingBusinesses.includes(b.id)).length;
  const posts = db.posts.filter((p) => p.businessId === b.id && (isOwner || visibleTo(db, p, me)));
  const publicCount = db.posts.filter((p) => p.businessId === b.id && p.status === "published").length;

  const message = () => {
    if (!gate("כדי לשלוח הודעה לעסק צריך חשבון.")) return;
    if (mode !== "customer") return toast("info", "הודעות לעסקים נשלחות מחשבון לקוח");
    const id = openConversation(b.id);
    if (id) navigate(`/messages/${id}`);
  };
  const follow = () => {
    if (!gate("כדי לעקוב אחרי עסקים צריך חשבון.")) return;
    const on = toggleFollowBusiness(b.id);
    if (on !== undefined) toast("ok", on ? `עוקב/ת אחרי ${b.name}` : "הפסקת לעקוב");
  };
  const share = async () => {
    const r = await shareLink(b.name, `/b/${b.id}`);
    if (r === "copied") toast("ok", "הקישור לפרופיל הועתק");
    else if (r === "failed") toast("error", "השיתוף נכשל");
  };

  return (
    <>
      <TopBar
        title={b.username}
        back
        actions={
          <>
            <IconButton label="שיתוף הפרופיל" onClick={share}>
              <Share2 className="size-5" />
            </IconButton>
            {!isOwner && (
              <IconButton label="אפשרויות נוספות" onClick={() => setMore(true)}>
                <MoreHorizontal className="size-5" />
              </IconButton>
            )}
          </>
        }
      />
      <Cover src={b.cover} />
      <div className="mx-auto max-w-5xl px-4 lg:px-6">
        <div className="-mt-12 flex items-end gap-4">
          {hasLiveStory(db, b.id) ? <span className="rounded-full bg-bg p-1"><StoryAvatar business={b} size={88} /></span> : <Avatar src={b.avatar} name={b.name} size={96} className="border-4 border-bg" />}
          <dl className="mb-1 grid flex-1 grid-cols-3 text-center">
            <Stat n={publicCount} label="פוסטים" />
            <Stat n={followers} label="עוקבים" />
            <Stat n={rating.count ? rating.avg.toFixed(1) : "—"} label={`${rating.count} ביקורות`} />
          </dl>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-black tracking-tight">{b.name}</h1>
          {b.isDemo && <DemoLabel>עסק לדוגמה</DemoLabel>}
          {b.status !== "active" && <Badge tone="warn">{b.status === "pending" ? "ממתין לאישור" : "מושעה"}</Badge>}
        </div>
        <p className="mt-0.5 text-sm text-muted">
          {b.categories.map((c) => CATEGORY_LABEL[c]).join(" · ")} ·{" "}
          {b.isMobile ? (
            <span>
              <Truck className="inline size-3.5" aria-hidden /> שירות נייד: {[b.cityId, ...b.serviceAreaCityIds].map((id) => db.cities.find((c) => c.id === id)?.name).filter((x, i, a) => a.indexOf(x) === i).join(", ")}
            </span>
          ) : (
            city?.name
          )}
        </p>
        <p className="mt-2 max-w-2xl whitespace-pre-line text-[15px] leading-relaxed">{b.description}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {isOwner ? (
            <>
              <Button variant="secondary" onClick={() => setEdit(true)}>
                <Pencil className="size-4" aria-hidden /> עריכת פרופיל
              </Button>
              <LinkButton to="/create" variant="secondary">
                פוסט חדש
              </LinkButton>
              <LinkButton to="/manage" variant="secondary">
                ניהול העסק
              </LinkButton>
            </>
          ) : (
            <>
              <LinkButton to={`/book/${b.id}`} size="md" className="min-w-36 flex-1 sm:flex-none" onClick={() => trackEvent("booking_start", b.id)}>
                <CalendarPlus className="size-5" aria-hidden /> קביעת תור
              </LinkButton>
              <Button variant="secondary" onClick={follow} aria-pressed={following}>
                {following ? "במעקב" : "מעקב"}
              </Button>
              <Button variant="secondary" onClick={message}>
                <MessageCircle className="size-4" aria-hidden /> הודעה
              </Button>
            </>
          )}
        </div>

        <div role="tablist" aria-label="תוכן הפרופיל" className="no-scrollbar sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 mt-6 flex overflow-x-auto border-b border-line bg-bg px-2 lg:mx-0">
          {TABS.map(([t, label]) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => setSp({ tab: t }, { replace: true })}
              className={clsx("h-12 shrink-0 border-b-2 px-4 text-sm font-semibold transition", tab === t ? "border-ink text-ink" : "border-transparent text-muted")}
            >
              {label}
            </button>
          ))}
        </div>

        <div role="tabpanel" className="py-4">
          {tab === "posts" && <PostsTab db={db} b={b} posts={posts} isOwner={isOwner} />}
          {tab === "reels" && <PostsTab db={db} b={b} posts={posts.filter((p) => p.kind === "reel")} isOwner={isOwner} />}
          {tab === "services" && <ServicesTab db={db} b={b} canBook={!isOwner} />}
          {tab === "team" && <TeamTab db={db} b={b} />}
          {tab === "reviews" && <ReviewsTab db={db} b={b} />}
          {tab === "about" && <AboutTab db={db} b={b} />}
        </div>
      </div>
      {isOwner && <EditBusinessSheet open={edit} onClose={() => setEdit(false)} b={b} />}
      <Sheet open={more} onClose={() => setMore(false)} title={b.name}>
        <button type="button" className="flex h-14 w-full items-center gap-3 rounded-2xl px-4 font-medium hover:bg-surface" onClick={() => gate("כדי לדווח צריך חשבון.") && (setMore(false), setReportOpen(true))}>
          <Flag className="size-5 text-bad" aria-hidden /> דיווח על העסק
        </button>
        <button
          type="button"
          className="flex h-14 w-full items-center gap-3 rounded-2xl px-4 font-medium hover:bg-surface"
          onClick={() => {
            if (!gate("כדי לחסום צריך חשבון.")) return;
            if (blockBusiness(b.id) !== undefined) {
              toast("ok", `${b.name} נחסם`);
              navigate("/");
            }
          }}
        >
          <ShieldOff className="size-5 text-muted" aria-hidden /> חסימת העסק
        </button>
      </Sheet>
      <ReportSheet open={reportOpen} onClose={() => setReportOpen(false)} targetType="business" targetId={b.id} />
    </>
  );
}

function Cover({ src }: { src: string }) {
  const url = useMediaUrl(src);
  return <div className="h-40 w-full bg-surface sm:h-56 lg:mx-auto lg:max-w-5xl lg:rounded-b-[28px] lg:overflow-hidden">{url && <img src={url} alt="" className="media size-full object-cover" />}</div>;
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className="num text-lg font-bold">{n}</dd>
      <dd className="text-xs text-muted">{label}</dd>
    </div>
  );
}

function PostsTab({ b, posts, isOwner }: { db: DB; b: Business; posts: DB["posts"]; isOwner: boolean }) {
  const pinned = b.pinnedPostIds.map((id) => posts.find((p) => p.id === id)).filter((p): p is DB["posts"][number] => !!p);
  const rest = posts.filter((p) => !b.pinnedPostIds.includes(p.id)).sort((x, y) => (y.publishedAt ?? y.createdAt).localeCompare(x.publishedAt ?? x.createdAt));
  const all = [...pinned, ...rest];
  if (!all.length)
    return <EmptyState title="עוד אין כאן תוכן" text={isOwner ? "פרסמו את העבודה הראשונה כדי שלקוחות יגלו אתכם." : "העסק עוד לא פרסם עבודות."} action={isOwner ? <LinkButton to="/create">יצירת פוסט</LinkButton> : undefined} />;
  return (
    <>
      {isOwner && <p className="mb-3 text-sm text-muted">אפשר לנעוץ עד 3 פוסטים בראש הפרופיל. טיוטות ותוכן מוסתר מוצגים רק לך.</p>}
      <ul className="grid grid-cols-3 gap-1 md:gap-2 lg:grid-cols-4">
        {all.map((p) => {
          const isPinned = b.pinnedPostIds.includes(p.id);
          return (
            <li key={p.id} className="relative">
              <PostTile post={p} pinned={isPinned} />
              {isOwner && p.status === "published" && (
                <button
                  type="button"
                  onClick={() => {
                    if (togglePin(p.id) !== undefined) toast("ok", isPinned ? "הנעיצה הוסרה" : "הפוסט ננעץ בראש הפרופיל");
                  }}
                  className="absolute end-1.5 top-1.5 grid size-8 place-items-center rounded-full bg-white/90 text-[#111] shadow"
                  aria-label={isPinned ? "ביטול נעיצה" : "נעיצה בראש הפרופיל"}
                >
                  {isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function ServiceRow({ s, onBook }: { s: Service; onBook?: () => void }) {
  const dep = depositFor(s);
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line p-4">
      <div className="min-w-0 flex-1">
        <div className="font-bold">{s.name}</div>
        {s.description && <p className="mt-0.5 text-sm text-muted">{s.description}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge>
            <Clock className="size-3" aria-hidden /> {duration(s.durationMin)}
          </Badge>
          <Badge tone={s.approval === "manual" ? "warn" : "ok"}>{s.approval === "manual" ? "באישור העסק" : "אישור מיידי"}</Badge>
          <Badge tone={dep ? "info" : "neutral"}>{dep ? `מקדמה ${price(dep)}` : "תשלום בעסק"}</Badge>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="num font-bold">{price(s.price, s.priceFrom)}</span>
        {onBook && (
          <Button size="sm" onClick={onBook}>
            הזמנה
          </Button>
        )}
      </div>
    </div>
  );
}

function ServicesTab({ db, b, canBook }: { db: DB; b: Business; canBook: boolean }) {
  const navigate = useNavigate();
  const services = db.services.filter((s) => s.businessId === b.id && s.active);
  if (!services.length) return <EmptyState title="אין שירותים פעילים" />;
  return (
    <ul className="flex flex-col gap-3">
      {services.map((s) => (
        <li key={s.id}>
          <ServiceRow s={s} onBook={canBook ? () => (trackEvent("booking_start", b.id), navigate(`/book/${b.id}?service=${s.id}`)) : undefined} />
        </li>
      ))}
    </ul>
  );
}

function TeamTab({ db, b }: { db: DB; b: Business }) {
  const pros = db.professionals.filter((p) => p.businessId === b.id && p.active);
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {pros.map((p) => {
        const r = proRating(db, p.id);
        return (
          <li key={p.id}>
            <Link to={`/pro/${p.id}`} className="flex items-center gap-3 rounded-2xl border border-line p-4 hover:bg-surface">
              <Avatar src={p.avatar} name={p.name} size={56} />
              <div className="min-w-0 flex-1">
                <div className="font-bold">{p.name}</div>
                <div className="text-sm text-muted">{p.title}</div>
                <div className="mt-1 truncate text-xs text-muted">{p.specialties.join(" · ")}</div>
              </div>
              {r.count > 0 && (
                <span className="flex items-center gap-1 text-sm font-semibold">
                  <Star className="size-4 fill-ink" aria-hidden /> <span className="num">{r.avg.toFixed(1)}</span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function ReviewCard({ r, db, footer }: { r: Review; db: DB; footer?: React.ReactNode }) {
  const u = db.users.find((x) => x.id === r.customerId);
  const pro = db.professionals.find((x) => x.id === r.professionalId);
  const a = db.appointments.find((x) => x.id === r.appointmentId);
  const b = db.businesses.find((x) => x.id === r.businessId);
  const photo = useMediaUrl(r.photo);
  return (
    <article className="rounded-2xl border border-line p-4">
      <header className="flex items-center gap-3">
        <Avatar name={u?.name ?? "לקוח/ה"} size={36} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{u?.name ?? "לקוח/ה"}</div>
          <div className="text-xs text-muted">
            {a?.snapshot.serviceName} · אצל {pro?.name} · {fmtRelative(r.createdAt)}
          </div>
        </div>
        <Stars value={r.rating} />
      </header>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge tone="ok">ביקורת מתור שהושלם</Badge>
        {r.isSample && <DemoLabel>ביקורת לדוגמה</DemoLabel>}
        {r.hidden && <Badge tone="bad">מוסתרת · {r.hiddenReason}</Badge>}
      </div>
      {r.text && <p className="mt-2 text-[15px] leading-relaxed">{r.text}</p>}
      {photo && <img src={photo} alt="תמונה מהביקורת" className="media mt-3 h-40 rounded-xl object-cover" loading="lazy" />}
      {r.reply && (
        <div className="mt-3 rounded-xl bg-surface p-3 text-sm">
          <div className="mb-0.5 font-semibold">תגובת {b?.name}</div>
          {r.reply.text}
        </div>
      )}
      {footer}
    </article>
  );
}

function ReviewsTab({ db, b }: { db: DB; b: Business }) {
  const me = useMe();
  const [reportId, setReportId] = useState<string | null>(null);
  const reviews = db.reviews.filter((r) => r.businessId === b.id && !r.hidden);
  const rating = ratingOf(db, b.id);
  const dist = [5, 4, 3, 2, 1].map((n) => reviews.filter((r) => r.rating === n).length);
  if (!reviews.length) return <EmptyState icon={<Star className="size-6" aria-hidden />} title="עוד אין ביקורות" text="ביקורות נכתבות רק על ידי לקוחות שהשלימו טיפול." />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-6 rounded-2xl bg-surface p-4">
        <div className="text-center">
          <div className="num text-4xl font-black">{rating.avg.toFixed(1)}</div>
          <Stars value={rating.avg} />
          <div className="mt-1 text-xs text-muted">{rating.count} ביקורות</div>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          {dist.map((n, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="num w-3">{5 - i}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg">
                <div className="h-full rounded-full bg-ink" style={{ width: `${(n / reviews.length) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted">רק לקוחות עם תור שהושלם יכולים לכתוב ביקורת — ביקורת אחת לכל תור. העסק יכול להגיב אך לא למחוק.</p>
      {reviews.map((r) => (
        <ReviewCard
          key={r.id}
          r={r}
          db={db}
          footer={
            me && me.id !== r.customerId ? (
              <button type="button" onClick={() => setReportId(r.id)} className="mt-2 flex items-center gap-1 text-xs text-muted hover:text-ink">
                <Flag className="size-3.5" aria-hidden /> דיווח על הביקורת
              </button>
            ) : null
          }
        />
      ))}
      <ReportSheet open={!!reportId} onClose={() => setReportId(null)} targetType="review" targetId={reportId ?? ""} />
    </div>
  );
}

function AboutTab({ db, b }: { db: DB; b: Business }) {
  const byDay = useMemo(() => WEEKDAYS.map((name, wd) => ({ name, ranges: b.openingHours.filter((h) => h.weekday === wd) })), [b]);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="rounded-2xl border border-line p-4">
        <h2 className="mb-3 font-bold">פרטים</h2>
        <p className="flex items-start gap-2 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden /> {b.isMobile ? `שירות נייד · ${b.address}` : b.address}
        </p>
        <p className="mt-2 flex items-center gap-2 text-sm">
          <Phone className="size-4" aria-hidden /> <span dir="ltr">{b.phone}</span>
        </p>
        {b.isMobile && <p className="mt-2 text-sm text-muted">אזורי שירות: {b.serviceAreaCityIds.map((id) => db.cities.find((c) => c.id === id)?.name).join(", ")}</p>}
      </section>
      <section className="rounded-2xl border border-line p-4">
        <h2 className="mb-3 font-bold">שעות פתיחה</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          {byDay.map((d) => (
            <div key={d.name} className="contents">
              <dt className="text-muted">{d.name}</dt>
              <dd className="num">{d.ranges.length ? d.ranges.map((r) => `${minToHHMM(r.start)}–${minToHHMM(r.end)}`).join(", ") : "סגור"}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="rounded-2xl border border-line p-4 md:col-span-2">
        <h2 className="mb-2 font-bold">מדיניות ביטול</h2>
        <p className="text-sm leading-relaxed">{b.policy.text}</p>
        <p className="mt-2 text-xs text-muted">ביטול או שינוי עצמאי עד {b.policy.cancelHours} שעות לפני התור.</p>
      </section>
    </div>
  );
}

function EditBusinessSheet({ open, onClose, b }: { open: boolean; onClose: () => void; b: Business }) {
  const [f, setF] = useState({ name: b.name, username: b.username, description: b.description, address: b.address, phone: b.phone });
  useEffect(() => {
    if (open) setF({ name: b.name, username: b.username, description: b.description, address: b.address, phone: b.phone });
  }, [open, b]);
  return (
    <Sheet open={open} onClose={onClose} title="עריכת פרופיל העסק" wide>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (updateBusiness(f) !== undefined) {
            toast("ok", "הפרופיל עודכן");
            onClose();
          }
        }}
      >
        <Field label="שם העסק" htmlFor="eb-name">
          <Input id="eb-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="שם משתמש" htmlFor="eb-user" hint="באנגלית, 3–30 תווים">
          <Input id="eb-user" dir="ltr" className="text-start" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
        </Field>
        <Field label="תיאור" htmlFor="eb-desc">
          <Textarea id="eb-desc" value={f.description} maxLength={400} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        <Field label="כתובת" htmlFor="eb-addr">
          <Input id="eb-addr" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </Field>
        <Field label="טלפון" htmlFor="eb-phone">
          <Input id="eb-phone" dir="ltr" className="text-start" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <p className="text-xs text-muted">שעות, שירותים, צוות ומדיניות נערכים ב״ניהול״.</p>
        <Button type="submit" size="lg">
          שמירה
        </Button>
      </form>
    </Sheet>
  );
}
