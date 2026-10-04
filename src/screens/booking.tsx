import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowRight, Armchair, BellRing, CalendarClock, CalendarHeart, Check, ChevronLeft, ChevronRight, CircleX, Clock, Info, Sparkles, X, Zap } from "lucide-react";
import clsx from "clsx";
import { DateTime } from "luxon";
import type { Appointment, DB, ID, Professional, Service } from "../domain/types";
import { availableDays, depositFor, getSlots } from "../domain/booking";
import { price, WEEKDAYS, WEEKDAYS_SHORT } from "../domain/format";
import { TZ, fmtDate, fmtTime, local } from "../domain/time";
import { book, openConversation, payDeposit, sendMessage } from "../store/actions";
import { gate, toast, useApp, useMe, useMode, type BookingDraft } from "../store/app";
import { DemoPayments } from "../integrations/payments";
import { Avatar, Button, DemoLabel, EmptyState, LinkButton, Textarea } from "../ui/kit";
import { Sheet } from "../ui/overlays";

/**
 * Booking flow, step by step like a dedicated salon app:
 * staff → treatment → month calendar → time list → confirm sheet → success → policy notice.
 * Availability, holds, deposits and manual approval use the same domain rules as before.
 */
const STEP_TITLE = ["בחירת איש צוות", "בחירת טיפול", "בחירת תאריך", "בחירת שעה"];
const MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const HORIZON_DAYS = 60;

function setDraft(patch: Partial<BookingDraft>) {
  useApp.setState((s) => (s.bookingDraft ? { bookingDraft: { ...s.bookingDraft, ...patch } } : {}));
}

const dayLabel = (iso: string) => {
  const d = local(iso);
  return `${WEEKDAYS[d.weekday % 7]}, ${d.day}/${d.month}`;
};

export function BookingScreen() {
  const { businessId } = useParams();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const db = useApp((s) => s.db);
  const me = useMe();
  const mode = useMode();
  const draft = useApp((s) => s.bookingDraft);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [doneId, setDoneId] = useState<ID | null>(null);
  const [policyFor, setPolicyFor] = useState<ID | null>(null);
  const [conflict, setConflict] = useState(false);
  const b = db.businesses.find((x) => x.id === businessId);

  // Initialise (or reuse a restored) draft for this business
  useEffect(() => {
    if (!b) return;
    const post = sp.get("post") ?? undefined;
    const service = sp.get("service") ?? undefined;
    const pro = sp.get("pro") ?? undefined;
    const fresh = !draft || draft.businessId !== b.id || post || service || pro;
    if (!fresh) return;
    const svc = db.services.find((s) => s.id === service && s.businessId === b.id && s.active);
    const proOk = db.professionals.find((p) => p.id === pro && p.businessId === b.id && p.active && (!svc || p.serviceIds.includes(svc.id)));
    useApp.setState({
      bookingDraft: {
        businessId: b.id,
        serviceId: svc?.id,
        professionalId: proOk ? proOk.id : undefined,
        note: "",
        inspirationPostIds: post ? [post] : [],
        sourcePostId: post,
        // staff first; a known service skips the treatment step, a known pro + service goes straight to the calendar
        step: proOk ? (svc ? 2 : 1) : 0,
      },
    });
    if (post || service || pro) navigate(`/book/${b.id}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.id, sp.toString()]);

  // Returning from sign-in with a chosen time: reopen the confirmation
  useEffect(() => {
    if (draft?.start && (draft.step ?? 0) === 3 && me) setConfirmOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  if (!b || b.status !== "active")
    return (
      <>
        <BookingHeader title="קביעת תור" onClose={() => navigate(-1)} />
        <div className="p-4">
          <EmptyState title="העסק לא זמין להזמנות" action={<LinkButton to="/discover">לגילוי עסקים</LinkButton>} />
        </div>
      </>
    );

  const doneAppt = doneId ? db.appointments.find((a) => a.id === doneId) : undefined;
  if (!draft || draft.businessId !== b.id) {
    // After booking the draft is cleared; keep the result sheets on screen
    return doneAppt ? <ResultLayer appointment={doneAppt} policyFor={policyFor} setPolicyFor={setPolicyFor} /> : null;
  }

  const step = draft.step ?? 0;
  const service = db.services.find((s) => s.id === draft.serviceId);
  const pro = (draft.professionalId && db.professionals.find((p) => p.id === draft.professionalId)) || null;
  const goto = (n: number) => {
    setDraft({ step: n });
    window.scrollTo({ top: 0 });
  };
  const back = () => {
    if (step === 0) return navigate(-1);
    // skip the treatment step when it was preselected from a post and the staff step comes before it
    goto(step - 1);
  };
  const close = () => {
    useApp.setState({ bookingDraft: null });
    navigate(`/b/${b.id}`);
  };

  const confirm = () => {
    if (!service || !draft.start) return;
    if (!useApp.getState().userId) setConfirmOpen(false); // the sign-in sheet takes over; reopened on return
    if (!gate("כדי לשריין את המועד צריך חשבון. הבחירות שלך נשמרות.", `/book/${b.id}`)) return;
    if (mode !== "customer" || me?.role !== "customer") return;
    const a = book({ businessId: b.id, serviceId: service.id, professionalId: draft.professionalId ?? null, start: draft.start, note: draft.note, inspirationPostIds: draft.inspirationPostIds, sourcePostId: draft.sourcePostId });
    setConfirmOpen(false);
    if (a) {
      setDoneId(a.id);
      useApp.setState({ bookingDraft: null });
    } else {
      // Most likely the slot was taken meanwhile — back to the time list, everything else kept
      setConflict(true);
      setDraft({ start: undefined, step: 3 });
    }
  };

  const who = pro?.name ?? "איש הצוות הפנוי הראשון";
  const subtitle = step === 1 ? `בחרת את ${who}${service ? "" : " ל"}` : service ? `בחרת את ${who} ל${service.name}` : "";

  return (
    <div className="min-h-[100dvh] bg-bg pb-40">
      <BookingHeader title={STEP_TITLE[step]} onBack={step > 0 ? back : undefined} onClose={close} />
      <div className="mx-auto max-w-md px-5 pt-5">
        {me && me.role !== "customer" && (
          <div className="mb-4 flex gap-2 rounded-2xl bg-warn-soft p-3 text-sm text-warn">
            <Info className="size-5 shrink-0" aria-hidden />
            <span>
              הזמנת תורים זמינה לחשבון לקוח בלבד. אפשר לעבור לחשבון לקוח ב<Link to="/demo" className="font-semibold underline">מצב דמו</Link>.
            </span>
          </div>
        )}
        {step > 0 && subtitle && (
          <p className="mb-5 text-center text-lg font-semibold leading-snug">
            {subtitle}
            {step === 3 && draft.date && (
              <>
                <br />
                ביום {WEEKDAYS[DateTime.fromISO(draft.date, { zone: TZ }).weekday % 7]}, {DateTime.fromISO(draft.date, { zone: TZ }).toFormat("d.M")}
              </>
            )}
          </p>
        )}
        {conflict && step === 3 && (
          <div role="alert" className="mb-4 rounded-2xl bg-bad-soft p-3 text-center text-sm text-bad">
            המועד שבחרת נתפס בינתיים. בחרו שעה אחרת — שאר הפרטים נשמרו.
          </div>
        )}

        {step === 0 && (
          <StaffStep
            db={db}
            businessId={b.id}
            serviceId={draft.serviceId}
            onPick={(id) => {
              setDraft({ professionalId: id, start: undefined, date: undefined });
              const keep = draft.serviceId && (id === null || db.professionals.find((p) => p.id === id)?.serviceIds.includes(draft.serviceId));
              if (!keep) setDraft({ serviceId: undefined });
              goto(keep ? 2 : 1);
            }}
          />
        )}
        {step === 1 && (
          <TreatmentStep
            db={db}
            businessId={b.id}
            pro={pro}
            onPick={(id) => {
              setDraft({ serviceId: id, start: undefined, date: undefined });
              goto(2);
            }}
          />
        )}
        {step === 2 && service && (
          <CalendarStep
            db={db}
            service={service}
            professionalId={draft.professionalId ?? null}
            selected={draft.date}
            onPick={(date) => {
              setDraft({ date, start: undefined });
              goto(3);
            }}
            onWaitlist={() => waitlist(b.id, service, pro, draft.date)}
          />
        )}
        {step === 3 && service && draft.date && (
          <TimeStep
            db={db}
            service={service}
            professionalId={draft.professionalId ?? null}
            date={draft.date}
            selected={draft.start}
            onPick={(start) => {
              setConflict(false);
              setDraft({ start });
              setConfirmOpen(true);
            }}
            onWaitlist={() => waitlist(b.id, service, pro, draft.date)}
          />
        )}
      </div>

      {service && draft.start && (
        <ConfirmSheet
          open={confirmOpen}
          draft={draft}
          service={service}
          pro={pro}
          disabled={!!me && me.role !== "customer"}
          onCancel={() => {
            setConfirmOpen(false);
            setDraft({ start: undefined });
          }}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}

/** Black bar: back arrow at the start, title centered, close at the end (as in RTL apps). */
function BookingHeader({ title, onBack, onClose }: { title: string; onBack?: () => void; onClose: () => void }) {
  return (
    <header className="sticky top-0 z-30 bg-[#111] pt-[env(safe-area-inset-top)] text-white">
      <div className="mx-auto grid h-14 max-w-md grid-cols-[48px_1fr_48px] items-center px-2">
        <span>
          {onBack && (
            <button type="button" onClick={onBack} className="grid size-11 place-items-center rounded-full hover:bg-white/10" aria-label="חזרה לשלב הקודם">
              <ArrowRight className="size-5" />
            </button>
          )}
        </span>
        <h1 className="text-center text-[17px] font-bold">{title}</h1>
        <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full hover:bg-white/10" aria-label="סגירת קביעת התור">
          <X className="size-5" />
        </button>
      </div>
    </header>
  );
}

/* ---------------- Step 1: staff ---------------- */

function StaffStep({ db, businessId, serviceId, onPick }: { db: DB; businessId: ID; serviceId?: ID; onPick: (id: ID | null) => void }) {
  const b = db.businesses.find((x) => x.id === businessId)!;
  const pros = db.professionals.filter((p) => p.businessId === businessId && p.active && (!serviceId || p.serviceIds.includes(serviceId)));
  return (
    <ul className="mt-6 flex flex-col gap-5" aria-label="אנשי צוות">
      <li>
        <PillRow onClick={() => onPick(null)} avatar={<Avatar src={b.avatar} name={b.name} size={64} />}>
          <span className="inline-flex items-center gap-1.5">
            תמצא לי תור מהיר <Zap className="size-4 fill-current" aria-hidden />
          </span>
        </PillRow>
      </li>
      {pros.map((p) => (
        <li key={p.id}>
          <PillRow onClick={() => onPick(p.id)} avatar={<Avatar src={p.avatar} name={p.name} size={64} />}>
            {p.name}
          </PillRow>
        </li>
      ))}
    </ul>
  );
}

function PillRow({ onClick, avatar, children }: { onClick: () => void; avatar: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="group relative flex h-16 w-full items-center ps-12 transition active:scale-[0.98]">
      <span className="absolute start-0 z-10 rounded-full bg-bg p-[3px] shadow-[0_2px_10px_rgb(0_0_0/0.18)]">{avatar}</span>
      <span className="flex h-14 flex-1 items-center justify-center rounded-full bg-bg ps-6 text-[15px] shadow-[0_3px_12px_rgb(0_0_0/0.12)] group-hover:bg-surface">{children}</span>
    </button>
  );
}

/* ---------------- Step 2: treatment ---------------- */

function TreatmentStep({ db, businessId, pro, onPick }: { db: DB; businessId: ID; pro: Professional | null; onPick: (id: ID) => void }) {
  const services = db.services.filter((s) => s.businessId === businessId && s.active && (!pro || pro.serviceIds.includes(s.id)));
  return (
    <ul className="mt-6 flex flex-col gap-4" aria-label="טיפולים">
      {services.map((s) => {
        const dep = depositFor(s);
        return (
          <li key={s.id}>
            <button type="button" onClick={() => onPick(s.id)} className="flex h-[68px] w-full items-stretch overflow-hidden rounded-[22px] bg-bg text-start shadow-[0_3px_12px_rgb(0_0_0/0.12)] transition hover:bg-surface active:scale-[0.98]">
              <span className="flex min-w-0 flex-1 flex-col justify-center px-5">
                <span className="truncate text-[15px] font-semibold">{s.name}</span>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                  <CalendarClock className="size-3.5" aria-hidden /> זמן טיפול: {s.durationMin} דק׳
                  {s.approval === "manual" && " · באישור העסק"}
                  {dep > 0 && ` · מקדמה ${price(dep)}`}
                </span>
              </span>
              <span className="num flex w-[92px] shrink-0 items-center justify-center bg-[#3a3a3c] ps-3 text-[15px] font-semibold text-white [clip-path:polygon(0_0,100%_0,100%_100%,0_100%,0_0)] rtl:[clip-path:polygon(0_0,100%_0,82%_100%,0_100%)]">
                {price(s.price, s.priceFrom)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------- Step 3: month calendar ---------------- */

function CalendarStep({ db, service, professionalId, selected, onPick, onWaitlist }: { db: DB; service: Service; professionalId: ID | null; selected?: string; onPick: (date: string) => void; onWaitlist: () => void }) {
  const [now] = useState(() => new Date());
  const today = DateTime.fromJSDate(now).setZone(TZ).startOf("day");
  const [month, setMonth] = useState(() => (selected ? DateTime.fromISO(selected, { zone: TZ }) : today).startOf("month"));
  const [note, setNote] = useState(!!service.description);
  const horizonEnd = today.plus({ days: HORIZON_DAYS - 1 });
  const counts = useMemo(() => new Map(availableDays(db, { businessId: service.businessId, serviceId: service.id, professionalId }, HORIZON_DAYS, now).map((d) => [d.date, d.count])), [db, service, professionalId, now]);
  const working = useMemo(() => {
    const pros = db.professionals.filter((p) => p.businessId === service.businessId && p.active && p.serviceIds.includes(service.id) && (!professionalId || p.id === professionalId));
    return new Set(pros.flatMap((p) => p.workingHours.map((h) => h.weekday)));
  }, [db, service, professionalId]);
  const firstOpen = [...counts].find(([, n]) => n > 0)?.[0];

  const lead = month.weekday % 7; // Sunday-first grid
  const cells = Array.from({ length: Math.ceil((lead + month.daysInMonth!) / 7) * 7 }, (_, i) => (i < lead || i >= lead + month.daysInMonth! ? null : month.plus({ days: i - lead })));
  const canPrev = month > today.startOf("month");
  const canNext = month.plus({ months: 1 }) <= horizonEnd.startOf("month");

  return (
    <section>
      <div className="overflow-hidden rounded-2xl bg-bg shadow-[0_4px_18px_rgb(0_0_0/0.14)]">
        <div className="bg-[#111] text-white">
          <div className="flex items-center justify-between px-3 py-3">
            <button type="button" disabled={!canPrev} onClick={() => setMonth(month.minus({ months: 1 }))} className="grid size-10 place-items-center rounded-full disabled:opacity-30" aria-label="החודש הקודם">
              <ChevronRight className="size-5" />
            </button>
            <h2 className="text-[17px]" aria-live="polite">
              {MONTHS[month.month - 1]} {month.year}
            </h2>
            <button type="button" disabled={!canNext} onClick={() => setMonth(month.plus({ months: 1 }))} className="grid size-10 place-items-center rounded-full disabled:opacity-30" aria-label="החודש הבא">
              <ChevronLeft className="size-5" />
            </button>
          </div>
          <div className="grid grid-cols-7 pb-2 text-center text-[13px]" aria-hidden>
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-7" role="radiogroup" aria-label="תאריך">
          {cells.map((d, i) => {
            if (!d) return <span key={i} className="h-12 border-b border-e border-line/70" aria-hidden />;
            const iso = d.toISODate()!;
            const inRange = d >= today && d <= horizonEnd;
            const n = counts.get(iso) ?? 0;
            const open = inRange && n > 0;
            const full = inRange && n === 0 && working.has(d.weekday % 7);
            const on = selected === iso;
            return (
              <button
                key={iso}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!open}
                onClick={() => onPick(iso)}
                aria-label={`${WEEKDAYS[d.weekday % 7]} ${d.day} ב${MONTHS[d.month - 1]}${open ? `, ${n} מועדים` : full ? ", אין תורים" : ""}`}
                className={clsx("num grid h-12 place-items-center border-b border-e border-line/70 text-[13px] transition", open ? "font-bold text-ink hover:bg-surface" : full ? "text-bad" : "text-muted/50")}
              >
                <span className={clsx("grid size-8 place-items-center rounded-full", on && "bg-ink text-ink-inverse")}>{d.day}</span>
              </button>
            );
          })}
        </div>
      </div>
      <ul className="mt-5 flex flex-col items-center gap-1.5 text-xs">
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-ink" aria-hidden /> יש תורים
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-bad" aria-hidden /> אין תורים
        </li>
      </ul>
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-center">
        <div>
          <p className="mb-2 text-xs font-semibold">חייב תור דחוף?</p>
          <button type="button" disabled={!firstOpen} onClick={() => firstOpen && onPick(firstOpen)} className="h-11 w-full rounded-full bg-[#3a3a3c] text-xs font-semibold text-white disabled:opacity-40">
            התורים הקרובים ביותר
          </button>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold">לא מצאת תור לזמן שלך?</p>
          <button type="button" onClick={onWaitlist} className="h-11 w-full rounded-full bg-ink text-xs font-semibold text-ink-inverse">
            כניסה לרשימת המתנה
          </button>
        </div>
      </div>
      {note && service.description && (
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-[28px] bg-bg p-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgb(0_0_0/0.25)] lg:pb-6" role="dialog" aria-label="לתשומת ליבך">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold">לתשומת ליבך:</h3>
            <button type="button" onClick={() => setNote(false)} className="grid size-9 place-items-center" aria-label="סגירת ההודעה">
              <CircleX className="size-6" />
            </button>
          </div>
          <p className="text-center text-sm leading-relaxed text-muted">{service.description}</p>
        </div>
      )}
    </section>
  );
}

/* ---------------- Step 4: time list ---------------- */

function TimeStep({ db, service, professionalId, date, selected, onPick, onWaitlist }: { db: DB; service: Service; professionalId: ID | null; date: string; selected?: string; onPick: (start: string) => void; onWaitlist: () => void }) {
  const [now] = useState(() => new Date());
  const slots = useMemo(() => getSlots(db, { businessId: service.businessId, serviceId: service.id, date, professionalId }, now), [db, service, date, professionalId, now]);
  return (
    <section className="flex flex-col items-center">
      {slots.length === 0 ? (
        <p className="rounded-2xl bg-surface p-4 text-center text-sm text-muted">אין מועדים פנויים ביום הזה. חזרו ללוח ובחרו יום אחר.</p>
      ) : (
        <ul className="flex w-full max-w-[240px] flex-col gap-3" role="radiogroup" aria-label={`שעות ${fmtDate(DateTime.fromISO(date, { zone: TZ }).toISO()!)}`}>
          {slots.map((s) => (
            <li key={s.start}>
              <button
                type="button"
                role="radio"
                aria-checked={selected === s.start}
                onClick={() => onPick(s.start)}
                className={clsx("num h-[50px] w-full rounded-full text-[15px] shadow-[0_3px_12px_rgb(0_0_0/0.12)] transition active:scale-[0.98]", selected === s.start ? "bg-ink text-ink-inverse" : "bg-bg hover:bg-surface")}
              >
                {fmtTime(s.start)}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs font-semibold">לא מצאת תור לזמן שלך?</p>
      <button type="button" onClick={onWaitlist} className="mt-1.5 h-11 w-full max-w-[240px] rounded-full bg-ink text-xs font-semibold text-ink-inverse">
        כניסה לרשימת המתנה
      </button>
    </section>
  );
}

/** Waitlist request goes to the business inbox (no separate waitlist store in the local demo). */
function waitlist(businessId: ID, service: Service, pro: Professional | null, date?: string) {
  if (!gate("כדי להיכנס לרשימת ההמתנה צריך חשבון.")) return;
  const cid = openConversation(businessId);
  if (!cid) return;
  const when = date ? ` ליום ${fmtDate(DateTime.fromISO(date, { zone: TZ }).toISO()!)}` : "";
  if (sendMessage(cid, `📋 בקשה לרשימת המתנה: ${service.name}${pro ? ` אצל ${pro.name}` : ""}${when}. אשמח שתעדכנו אם מתפנה תור.`)) toast("ok", "נכנסת לרשימת ההמתנה. העסק קיבל את הבקשה בהודעות.");
}

/* ---------------- Confirm / success / policy ---------------- */

function SummaryIcons({ start, serviceName, proName }: { start: string; serviceName: string; proName: string }) {
  const items = [
    [CalendarHeart, dayLabel(start)],
    [BellRing, `בשעה ${fmtTime(start)}`],
    [Armchair, serviceName],
    [Sparkles, `אצל ${proName}`],
  ] as const;
  return (
    <ul className="grid grid-cols-4 gap-1 py-4 text-center">
      {items.map(([Icon, label]) => (
        <li key={label} className="flex flex-col items-center gap-2 px-1">
          <Icon className="size-9 stroke-[1.25] text-muted" aria-hidden />
          <span className="text-xs leading-tight">{label}</span>
        </li>
      ))}
    </ul>
  );
}

function BottomLayer({ label, children, onDismiss }: { label: string; children: React.ReactNode; onDismiss?: () => void }) {
  useEffect(() => {
    if (!onDismiss) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onDismiss]);
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.target === e.currentTarget && onDismiss?.()}>
      <div className="animate-rise w-full max-w-md overflow-hidden rounded-t-[28px] bg-bg pb-[env(safe-area-inset-bottom)]">{children}</div>
    </div>
  );
}

function ConfirmSheet({ open, draft, service, pro, disabled, onCancel, onConfirm }: { open: boolean; draft: BookingDraft; service: Service; pro: Professional | null; disabled: boolean; onCancel: () => void; onConfirm: () => void }) {
  const [noteOpen, setNoteOpen] = useState(!!draft.note);
  if (!open || !draft.start) return null;
  const dep = depositFor(service);
  return (
    <BottomLayer label="אישור התור שבחרת" onDismiss={onCancel}>
      <h2 className="bg-[#111] py-4 text-center text-[17px] font-semibold text-white">אישור התור שבחרת</h2>
      <div className="px-5">
        <SummaryIcons start={draft.start} serviceName={service.name} proName={pro?.name ?? "הפנוי/ה הראשון/ה"} />
        <div className="flex flex-col gap-2 border-t border-line pt-3 text-center text-xs text-muted">
          <p>
            {price(service.price, service.priceFrom)}
            {dep > 0 ? ` · מקדמה ${price(dep)} עכשיו (דמו), היתרה בעסק` : " · תשלום בעסק"}
            {service.approval === "manual" && " · נשלח לאישור העסק"}
          </p>
          {draft.sourcePostId && <p>ההשראה מהפוסט שראית מצורפת לתור</p>}
          {noteOpen ? (
            <Textarea aria-label="הערה לעסק" maxLength={300} placeholder="הערה לעסק (לא חובה)" value={draft.note} onChange={(e) => setDraft({ note: e.target.value })} className="text-start text-sm text-ink" />
          ) : (
            <button type="button" onClick={() => setNoteOpen(true)} className="self-center font-semibold text-ink underline underline-offset-4">
              הוספת הערה לעסק
            </button>
          )}
        </div>
        <div className="flex justify-center gap-3 py-5">
          <button type="button" onClick={onConfirm} disabled={disabled} className="h-12 min-w-[96px] rounded-full bg-ink px-6 text-sm font-semibold text-ink-inverse disabled:opacity-40">
            {service.approval === "manual" ? "שליחת בקשה" : dep > 0 ? "אישור ותשלום מקדמה" : "אישור"}
          </button>
          <button type="button" onClick={onCancel} className="h-12 min-w-[96px] rounded-full bg-[#a1a1aa] px-6 text-sm font-semibold text-white">
            ביטול
          </button>
        </div>
      </div>
    </BottomLayer>
  );
}

/** .ics reminder, generated locally (no calendar account involved). */
function downloadIcs(a: Appointment, businessName: string, address: string) {
  const f = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Beautigo//Demo//HE", "BEGIN:VEVENT", `UID:${a.id}@beautigo.demo`, `DTSTAMP:${f(new Date().toISOString())}`, `DTSTART:${f(a.start)}`, `DTEND:${f(a.end)}`, `SUMMARY:${a.snapshot.serviceName} · ${businessName}`, `LOCATION:${address}`, "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:תזכורת לתור", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
  const el = document.createElement("a");
  el.href = url;
  el.download = "beautigo-appointment.ics";
  el.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function ResultLayer({ appointment: a, policyFor, setPolicyFor }: { appointment: Appointment; policyFor: ID | null; setPolicyFor: (id: ID | null) => void }) {
  const db = useApp((s) => s.db);
  const me = useMe();
  const navigate = useNavigate();
  const [pay, setPay] = useState(a.status === "pending_payment");
  const b = db.businesses.find((x) => x.id === a.businessId)!;
  const pro = db.professionals.find((x) => x.id === a.professionalId);
  const first = me?.name.split(" ")[0] ?? "";
  const title = a.status === "confirmed" ? `${first}, התור הוזמן בהצלחה` : a.status === "pending_approval" ? `${first}, הבקשה נשלחה לעסק` : a.status === "pending_payment" ? `${first}, נשאר רק לשלם מקדמה` : `${first}, התור עודכן`;
  const finish = () => setPolicyFor(a.id);

  return (
    <div className="min-h-[100dvh] bg-[#2b2b2e]">
      {policyFor === a.id ? (
        <BottomLayer label="שימו לב למדיניות" onDismiss={() => navigate(`/appointments/${a.id}`)}>
          <div className="bg-[#111] px-6 pb-6 pt-7 text-white">
            <h2 className="text-lg font-semibold">{first ? `${first} היקר/ה,` : "לקוח/ה יקר/ה,"}</h2>
            <p className="mt-5 text-sm font-semibold">שימו לב לגבי איחורים, ביטולים והברזות</p>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/85">{a.snapshot.policyText}</p>
            <p className="mt-3 text-sm leading-relaxed text-white/85">ביטול ללא חיוב עד {a.snapshot.cancelHours} שעות לפני התור.</p>
            <button type="button" onClick={() => navigate(`/appointments/${a.id}`)} className="mx-auto mt-6 block h-11 w-48 rounded-full bg-white text-sm font-semibold text-[#111]">
              סגור
            </button>
          </div>
        </BottomLayer>
      ) : (
        <BottomLayer label="התור הוזמן">
          <div className="flex flex-col items-center px-5 pt-7 text-center">
            <span className={clsx("grid size-[72px] place-items-center rounded-full text-white", a.status === "confirmed" ? "bg-[#4caf50]" : "bg-[#3a3a3c]")}>
              {a.status === "confirmed" ? <Check className="size-10 stroke-[3]" aria-hidden /> : <Clock className="size-9" aria-hidden />}
            </span>
            <h2 className="animate-pop mt-4 text-xl font-bold">{title}</h2>
            <p className="mt-1 text-sm text-muted">
              {a.status === "pending_approval" ? `נעדכן אותך באפליקציה ברגע שהעסק יאשר. הבקשה בתוקף עד ${fmtTime(a.holdExpiresAt!)}.` : a.status === "pending_payment" ? "המועד שמור לזמן קצר עד תשלום המקדמה." : "נא לא לאחר ולהגיע בזמן."}
            </p>
          </div>
          <div className="mx-5 mt-4 border-y border-line">
            <SummaryIcons start={a.start} serviceName={a.snapshot.serviceName} proName={pro?.name ?? ""} />
          </div>
          <div className="flex flex-col items-center gap-3 px-5 py-5">
            {a.status === "pending_payment" ? (
              <button type="button" onClick={() => setPay(true)} className="h-12 w-56 rounded-full bg-ink text-sm font-semibold text-ink-inverse">
                תשלום מקדמה {price(a.snapshot.deposit)} (דמו)
              </button>
            ) : (
              <button type="button" onClick={() => downloadIcs(a, b.name, a.snapshot.address)} className="h-11 w-56 rounded-full bg-[#3a3a3c] text-sm font-semibold text-white">
                הוספת תזכורת ליומן
              </button>
            )}
            <div className="w-full border-t border-line" />
            <button type="button" onClick={finish} className="h-12 w-56 rounded-full bg-ink text-sm font-semibold text-ink-inverse">
              סיום
            </button>
            <Link to={`/appointments/${a.id}`} className="text-xs font-semibold underline underline-offset-4">
              לפרטי התור
            </Link>
            <p className="text-[11px] text-muted">ההתראות בדמו מוצגות באפליקציה בלבד — לא נשלחים SMS, אימייל או פוש.</p>
          </div>
        </BottomLayer>
      )}
      <DemoPaymentSheet open={pay} onClose={() => setPay(false)} appointment={a} />
    </div>
  );
}

/** Date strip + time grid computed from hours, duration, buffer, breaks, appointments and blocked time. */
export function SlotPicker({
  db,
  businessId,
  serviceId,
  professionalId,
  date,
  selected,
  onDate,
  onPick,
  excludeAppointmentId,
  durationMin,
}: {
  db: DB;
  businessId: ID;
  serviceId: ID;
  professionalId: ID | null;
  date?: string;
  selected?: string;
  onDate: (d: string) => void;
  onPick: (start: string) => void;
  excludeAppointmentId?: ID;
  durationMin?: number;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const days = useMemo(() => availableDays(db, { businessId, serviceId, professionalId }, 21, now), [db, businessId, serviceId, professionalId, now]);
  const firstOpen = days.find((d) => d.count > 0)?.date;
  const active = date && days.some((d) => d.date === date) ? date : firstOpen;
  useEffect(() => {
    if (active && active !== date) onDate(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  const slots = useMemo(() => (active ? getSlots(db, { businessId, serviceId, date: active, professionalId, excludeAppointmentId, durationMin }, now) : []), [db, businessId, serviceId, active, professionalId, excludeAppointmentId, durationMin, now]);
  const groups = [
    ["בוקר", slots.filter((s) => local(s.start).hour < 12)],
    ["צהריים", slots.filter((s) => local(s.start).hour >= 12 && local(s.start).hour < 17)],
    ["ערב", slots.filter((s) => local(s.start).hour >= 17)],
  ] as const;
  return (
    <section>
      <h2 className="mb-3 text-xl font-black">מתי נוח לך?</h2>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-2" role="radiogroup" aria-label="תאריך">
        {days.map((d) => {
          const dt = DateTime.fromISO(d.date, { zone: TZ });
          const on = d.date === active;
          return (
            <button
              key={d.date}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={d.count === 0}
              onClick={() => onDate(d.date)}
              aria-label={`${fmtDate(dt.toISO()!)}${d.count ? `, ${d.count} מועדים` : ", אין מועדים"}`}
              className={clsx("flex h-[72px] w-14 shrink-0 flex-col items-center justify-center rounded-2xl border text-sm transition disabled:opacity-35", on ? "border-ink bg-ink text-ink-inverse" : "border-line hover:bg-surface")}
            >
              <span className="text-xs">{WEEKDAYS_SHORT[dt.weekday % 7]}</span>
              <span className="num text-lg font-bold">{dt.day}</span>
              <span className={clsx("size-1 rounded-full", d.count ? (on ? "bg-ink-inverse" : "bg-ok") : "bg-transparent")} aria-hidden />
            </button>
          );
        })}
      </div>
      {!firstOpen ? (
        <EmptyState title="אין מועדים פנויים ב־3 השבועות הקרובים" text="נסו איש מקצוע אחר או שלחו הודעה לעסק." />
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {active && <p className="text-sm font-semibold">{fmtDate(DateTime.fromISO(active, { zone: TZ }).toISO()!)}</p>}
          {groups.map(([label, list]) =>
            list.length ? (
              <div key={label}>
                <h3 className="mb-2 text-xs font-semibold text-muted">{label}</h3>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="radiogroup" aria-label={`שעות ${label}`}>
                  {list.map((s) => (
                    <button
                      key={s.start}
                      type="button"
                      role="radio"
                      aria-checked={selected === s.start}
                      onClick={() => onPick(s.start)}
                      className={clsx("num h-11 rounded-xl border text-sm font-semibold transition", selected === s.start ? "border-ink bg-ink text-ink-inverse" : "border-line hover:bg-surface")}
                    >
                      {fmtTime(s.start)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null,
          )}
          {slots.length === 0 && <p className="rounded-2xl bg-surface p-4 text-sm text-muted">אין מועדים ביום הזה. בחרו יום אחר.</p>}
        </div>
      )}
    </section>
  );
}

/** Simulated deposit payment. Never asks for card details. */
export function DemoPaymentSheet({ open, onClose, appointment: a }: { open: boolean; onClose: () => void; appointment: Appointment }) {
  const [busy, setBusy] = useState<"success" | "failure" | null>(null);
  const [failed, setFailed] = useState(false);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!open || !a.holdExpiresAt) return;
    const tick = () => setLeft(Math.max(0, Date.parse(a.holdExpiresAt!) - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [open, a.holdExpiresAt]);
  const run = async (outcome: "success" | "failure") => {
    setBusy(outcome);
    await DemoPayments.chargeDeposit({ amount: a.snapshot.deposit, outcome });
    const r = payDeposit(a.id, outcome);
    setBusy(null);
    if (!r) return;
    if (outcome === "failure") setFailed(true);
    else {
      setFailed(false);
      onClose();
    }
  };
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);
  return (
    <Sheet open={open} onClose={onClose} title="תשלום מקדמה">
      <div className="flex flex-col gap-4">
        <DemoLabel className="self-start">תשלום דמו — לא נגבה כסף ולא נאספים פרטי כרטיס</DemoLabel>
        <div className="rounded-2xl bg-surface p-4">
          <div className="flex justify-between">
            <span>מקדמה</span>
            <span className="num text-xl font-black">{price(a.snapshot.deposit)}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm text-muted">
            <span>יתרה בעסק</span>
            <span className="num">{price(Math.max(0, a.snapshot.price - a.snapshot.deposit))}</span>
          </div>
        </div>
        {a.holdExpiresAt && (
          <p className="flex items-center gap-2 text-sm" aria-live="polite">
            <Clock className="size-4" aria-hidden /> המועד שמור עבורך עוד <span className="num font-bold">{left > 0 ? `${mm}:${String(ss).padStart(2, "0")}` : "0:00"}</span>
          </p>
        )}
        {failed && (
          <p role="alert" className="rounded-2xl bg-bad-soft p-3 text-sm text-bad">
            התשלום (המדומה) נכשל. המועד עדיין שמור — אפשר לנסות שוב.
          </p>
        )}
        <Button size="lg" loading={busy === "success"} disabled={!!busy || left === 0} onClick={() => run("success")}>
          אישור תשלום (דמו)
        </Button>
        <Button variant="secondary" loading={busy === "failure"} disabled={!!busy || left === 0} onClick={() => run("failure")}>
          סימולציית כשל בתשלום
        </Button>
        <p className="text-xs leading-relaxed text-muted">בגרסה אמיתית התשלום יתבצע אצל ספק סליקה מאובטח (דף תשלום מתארח), והאישור יגיע מהשרת. Beautigo לא תשמור פרטי כרטיס.</p>
      </div>
    </Sheet>
  );
}
