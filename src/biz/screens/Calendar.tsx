import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Ban, ChevronLeft, ChevronRight, Phone, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import clsx from "clsx";
import { DateTime } from "luxon";
import { backend, type Appointment, type Block, type Catalogue, type CustomerRow, type Professional } from "../backend";
import { useMembership } from "../session";
import { displayPhone, toE164 } from "../slots";
import { Body, ErrorBox, StatusPill, TZ, fmtDay, fmtTime, ils, local, run, useLoad } from "../ui";
import { Button, Field, Input, Segmented, Select, Textarea } from "../../ui/kit";
import { ConfirmDialog, Sheet } from "../../ui/overlays";

type View = "list" | "day" | "week" | "month";
const DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const START_H = 7;
const END_H = 22;

function rangeFor(view: View, anchor: DateTime) {
  if (view === "day") return { from: anchor.startOf("day"), to: anchor.startOf("day").plus({ days: 1 }) };
  if (view === "month") {
    const first = anchor.startOf("month");
    const from = first.minus({ days: first.weekday % 7 });
    return { from, to: from.plus({ days: 42 }) };
  }
  const from = anchor.startOf("day").minus({ days: anchor.weekday % 7 });
  return { from, to: from.plus({ days: view === "list" ? 14 : 7 }) };
}

export function CalendarScreen() {
  const m = useMembership();
  const businessId = m?.business.id ?? null;
  const [sp, setSp] = useSearchParams();
  const [view, setView] = useState<View>(() => (sp.get("view") as View) || (window.innerWidth < 640 ? "day" : "week"));
  const [anchor, setAnchor] = useState<DateTime>(() => DateTime.now().setZone(TZ).startOf("day"));
  const [pro, setPro] = useState<string>("all");
  const [blockOpen, setBlockOpen] = useState(false);
  const { from, to } = rangeFor(view, anchor);
  const cat = useLoad(() => backend.catalogue(businessId!), [businessId]);
  const data = useLoad(
    async () => {
      const [appts, blocks] = await Promise.all([backend.appointments(businessId!, from.toUTC().toISO()!, to.toUTC().toISO()!), backend.blocks(businessId!, from.toUTC().toISO()!, to.toUTC().toISO()!)]);
      return { appts, blocks };
    },
    [businessId, from.toMillis(), to.toMillis()],
    { businessId, tables: ["appointments", "blocks"] },
  );
  const myPro = m?.role === "staff" ? m.professional_id : null;
  const pros = (cat.data?.professionals ?? []).filter((p) => p.active && (!myPro || p.id === myPro));
  const shown = pros.filter((p) => pro === "all" || p.id === pro);
  // keep showing the previous range while the next one loads (no flicker when paging weeks)
  const current = data.data ?? data.stale;
  const appts = (current?.appts ?? []).filter((a) => a.status !== "cancelled" && shown.some((p) => p.id === a.professional_id));
  const blocks = (current?.blocks ?? []).filter((b) => shown.some((p) => p.id === b.professional_id));
  const apptId = sp.get("appt");
  const newOpen = sp.get("new") === "1";
  const step = view === "day" ? { days: 1 } : view === "month" ? { months: 1 } : { weeks: view === "list" ? 2 : 1 };
  const title =
    view === "day" ? fmtDay(anchor.toISO()!) : view === "month" ? anchor.setLocale("he").toFormat("LLLL yyyy") : `${from.toFormat("d")} – ${to.minus({ days: 1 }).setLocale("he").toFormat("d בLLLL yyyy")}`;
  const openAppt = (id: string) => setSp((p) => (p.set("appt", id), p));

  return (
    <>
      <div className="sticky top-14 z-20 border-b border-line bg-bg/95 backdrop-blur">
        <Body className="flex flex-col gap-3 py-3">
          <div className="flex items-center gap-2">
            <Segmented
              label="תצוגה"
              value={view}
              onChange={(v) => {
                setView(v);
                setSp((p) => (p.set("view", v), p), { replace: true });
              }}
              options={[
                { value: "list", label: "רשימה" },
                { value: "day", label: "יום" },
                { value: "week", label: "שבוע" },
                { value: "month", label: "חודש" },
              ]}
            />
            <button type="button" onClick={() => void data.reload()} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-surface" aria-label="רענון">
              <RefreshCw className={clsx("size-5", data.loading && "animate-spin")} aria-hidden />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="grid size-10 place-items-center rounded-full bg-[#0d0b1a] text-white" aria-label="הקודם" onClick={() => setAnchor((a) => a.minus(step))}>
              <ChevronRight className="size-5" />
            </button>
            <span className="num flex-1 text-center text-sm font-bold">{title}</span>
            <button type="button" className="h-10 rounded-full bg-[#0d0b1a] px-4 text-sm font-bold text-white" onClick={() => setAnchor(DateTime.now().setZone(TZ).startOf("day"))}>
              היום
            </button>
            <button type="button" className="grid size-10 place-items-center rounded-full bg-[#0d0b1a] text-white" aria-label="הבא" onClick={() => setAnchor((a) => a.plus(step))}>
              <ChevronLeft className="size-5" />
            </button>
          </div>
          {pros.length > 1 && (
            <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
              <ProChip active={pro === "all"} onClick={() => setPro("all")} label="כל הצוות" />
              {pros.map((p) => (
                <ProChip key={p.id} active={pro === p.id} onClick={() => setPro(p.id)} label={p.name} color={p.color} />
              ))}
            </div>
          )}
        </Body>
      </div>
      <Body className="py-3">
        {data.error && <ErrorBox text={data.error} retry={data.reload} />}
        {view === "list" && <ListView appts={appts} pros={pros} onOpen={openAppt} />}
        {view === "day" && <DayView day={anchor} pros={shown} appts={appts} blocks={blocks} onOpen={openAppt} />}
        {view === "week" && <WeekView from={from} pros={shown} appts={appts} blocks={blocks} onOpen={openAppt} onDay={(d) => (setAnchor(d), setView("day"))} />}
        {view === "month" && <MonthView from={from} anchor={anchor} appts={appts} onDay={(d) => (setAnchor(d), setView("day"))} />}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setBlockOpen(true)}>
            <Ban className="size-4" aria-hidden /> חסימת זמן
          </Button>
        </div>
      </Body>
      <button
        type="button"
        onClick={() => setSp((p) => (p.set("new", "1"), p))}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] end-4 z-30 grid size-14 place-items-center rounded-2xl bg-brand text-white shadow-[0_12px_30px_-10px_var(--brand)] lg:bottom-8"
        aria-label="תור חדש"
      >
        <Plus className="size-7" />
      </button>
      {cat.data && (
        <>
          <NewAppointmentSheet open={newOpen} onClose={() => setSp((p) => (p.delete("new"), p))} cat={cat.data} pros={pros} defaultDay={anchor.toISODate()!} />
          <AppointmentSheet id={apptId} onClose={() => setSp((p) => (p.delete("appt"), p))} cat={cat.data} pros={pros} />
          <BlockSheet open={blockOpen} onClose={() => setBlockOpen(false)} pros={pros} day={anchor.toISODate()!} />
        </>
      )}
    </>
  );
}

function ProChip({ active, onClick, label, color }: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={clsx("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium", active ? "border-brand bg-brand text-white" : "border-line hover:bg-surface")}>
      {color && <span className="size-2.5 rounded-full" style={{ background: color }} aria-hidden />}
      {label}
    </button>
  );
}

/* ───────── List ───────── */

function ListView({ appts, pros, onOpen }: { appts: Appointment[]; pros: Professional[]; onOpen: (id: string) => void }) {
  const byDay = useMemo(() => {
    const m = new Map<string, Appointment[]>();
    for (const a of appts) {
      const k = local(a.starts_at).toISODate()!;
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return [...m.entries()];
  }, [appts]);
  if (!byDay.length) return <p className="rounded-2xl bg-surface p-6 text-center text-sm text-muted">אין תורים בשבועיים האלה.</p>;
  return (
    <div className="flex flex-col gap-5">
      {byDay.map(([day, list]) => (
        <section key={day}>
          <h3 className="mb-2 text-sm font-bold text-muted">{fmtDay(list[0].starts_at)}</h3>
          <ul className="flex flex-col gap-2">
            {list.map((a) => {
              const p = pros.find((x) => x.id === a.professional_id);
              return (
                <li key={a.id}>
                  <button type="button" onClick={() => onOpen(a.id)} className="flex w-full items-center gap-3 rounded-2xl border border-line p-3 text-start hover:bg-surface">
                    <span className="w-1.5 self-stretch rounded-full" style={{ background: p?.color }} aria-hidden />
                    <span className="num w-12 font-bold">{fmtTime(a.starts_at)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{a.customer_name}</span>
                      <span className="block truncate text-sm text-muted">
                        {a.service_name} · {p?.name}
                      </span>
                    </span>
                    <StatusPill status={a.status} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ───────── Time grids ───────── */

const minsOf = (iso: string, day: DateTime) => (Date.parse(iso) - day.toMillis()) / 60000;

/** Places overlapping events side by side (greedy lanes per cluster). */
function lanes<T extends { s: number; e: number }>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.s - b.s || b.e - a.e);
  const out: (T & { lane: number; lanes: number })[] = [];
  let cluster: (T & { lane: number; lanes: number })[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const n = Math.max(1, ...cluster.map((c) => c.lane + 1));
    for (const c of cluster) c.lanes = n;
    out.push(...cluster);
    cluster = [];
  };
  for (const it of sorted) {
    if (it.s >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    const used = new Set(cluster.filter((c) => c.e > it.s).map((c) => c.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    cluster.push({ ...it, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  flush();
  return out;
}

function TimeAxis({ px }: { px: number }) {
  return (
    <div className="w-11 shrink-0">
      <div className="h-10" />
      <div className="relative" style={{ height: (END_H - START_H) * 60 * px }}>
        {Array.from({ length: END_H - START_H }, (_, i) => (
          <span key={i} className="num absolute end-1 -translate-y-1/2 text-[11px] text-muted" style={{ top: i * 60 * px }}>
            {i ? `${START_H + i}:00` : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function Column({ day, pros, appts, blocks, px, label, onOpen, onHead }: { day: DateTime; pros: Professional[]; appts: Appointment[]; blocks: Block[]; px: number; label: React.ReactNode; onOpen: (id: string) => void; onHead?: () => void }) {
  const end = day.plus({ days: 1 }).toMillis();
  const top = (m: number) => Math.max(0, (m - START_H * 60) * px);
  const wd = day.weekday % 7;
  const items = lanes(
    appts
      .filter((a) => Date.parse(a.starts_at) < end && Date.parse(a.ends_at) > day.toMillis())
      .map((a) => ({ a, s: minsOf(a.starts_at, day), e: minsOf(a.ends_at, day) })),
  );
  const isToday = day.hasSame(DateTime.now().setZone(TZ), "day");
  const nowMin = isToday ? minsOf(new Date().toISOString(), day) : -1;
  // Grey where nobody in the selection works
  const hours = pros.flatMap((p) => p.hours.filter((h) => h.weekday === wd));
  return (
    <div className="min-w-0 flex-1 border-e border-line last:border-e-0">
      <button type="button" disabled={!onHead} onClick={onHead} className={clsx("flex h-10 w-full flex-col items-center justify-center text-xs", isToday && "font-black text-brand")}>
        {label}
      </button>
      <div className="relative bg-surface/80" style={{ height: (END_H - START_H) * 60 * px }}>
        {hours.map((h, i) => (
          <div key={i} className="absolute inset-x-0 bg-bg" style={{ top: top(h.start_min), height: (h.end_min - h.start_min) * px }} />
        ))}
        {Array.from({ length: END_H - START_H }, (_, i) => (
          <div key={i} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * 60 * px }} />
        ))}
        {pros.length === 1 &&
          pros[0].breaks
            .filter((b) => b.weekday === wd)
            .map((b, i) => (
              <div key={`b${i}`} className="absolute inset-x-0 bg-[repeating-linear-gradient(45deg,var(--surface-2),var(--surface-2)_4px,transparent_4px,transparent_8px)]" style={{ top: top(b.start_min), height: (b.end_min - b.start_min) * px }} />
            ))}
        {blocks
          .filter((b) => Date.parse(b.starts_at) < end && Date.parse(b.ends_at) > day.toMillis())
          .map((b) => {
            const s = Math.max(minsOf(b.starts_at, day), START_H * 60);
            const e = Math.min(minsOf(b.ends_at, day), END_H * 60);
            return (
              <div key={b.id} title={b.reason} className="absolute inset-x-0.5 overflow-hidden rounded-md bg-[repeating-linear-gradient(45deg,var(--surface-2),var(--surface-2)_4px,var(--surface)_4px,var(--surface)_8px)] p-1 text-[10px] font-semibold text-muted" style={{ top: top(s), height: Math.max(14, (e - s) * px) }}>
                {b.source === "google" ? "Google · " : ""}
                {b.reason}
              </div>
            );
          })}
        {items.map(({ a, s, e, lane, lanes: n }) => {
          const p = pros.find((x) => x.id === a.professional_id);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onOpen(a.id)}
              className={clsx("absolute overflow-hidden rounded-md p-1 text-start text-[10px] leading-tight text-white shadow-sm transition hover:brightness-110", a.status === "pending" && "opacity-80 outline-2 outline-dashed outline-white/70", a.status === "no_show" && "line-through opacity-60")}
              style={{ top: top(s) + 1, height: Math.max(18, (e - s) * px - 2), insetInlineStart: `calc(${(lane / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)`, background: p?.color ?? "var(--brand)" }}
              aria-label={`${fmtTime(a.starts_at)} ${a.customer_name} — ${a.service_name}`}
            >
              <span className="block truncate font-bold">{a.customer_name}</span>
              <span className="block truncate opacity-90">{a.service_name}</span>
            </button>
          );
        })}
        {nowMin > START_H * 60 && nowMin < END_H * 60 && <div className="absolute inset-x-0 z-10 h-0.5 bg-bad" style={{ top: top(nowMin) }} aria-hidden />}
      </div>
    </div>
  );
}

function DayView({ day, pros, appts, blocks, onOpen }: { day: DateTime; pros: Professional[]; appts: Appointment[]; blocks: Block[]; onOpen: (id: string) => void }) {
  return (
    <div className="flex overflow-hidden rounded-2xl border border-line">
      <TimeAxis px={1.2} />
      {pros.map((p) => (
        <Column
          key={p.id}
          day={day}
          pros={[p]}
          appts={appts.filter((a) => a.professional_id === p.id)}
          blocks={blocks.filter((b) => b.professional_id === p.id)}
          px={1.2}
          onOpen={onOpen}
          label={
            <span className="flex items-center gap-1 font-semibold">
              <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden /> {p.name.split(" ")[0]}
            </span>
          }
        />
      ))}
    </div>
  );
}

function WeekView({ from, pros, appts, blocks, onOpen, onDay }: { from: DateTime; pros: Professional[]; appts: Appointment[]; blocks: Block[]; onOpen: (id: string) => void; onDay: (d: DateTime) => void }) {
  return (
    <div className="flex overflow-hidden rounded-2xl border border-line">
      <TimeAxis px={0.9} />
      {Array.from({ length: 7 }, (_, i) => {
        const d = from.plus({ days: i });
        return (
          <Column
            key={i}
            day={d}
            pros={pros}
            appts={appts}
            blocks={blocks}
            px={0.9}
            onOpen={onOpen}
            onHead={() => onDay(d)}
            label={
              <>
                <span className="num text-sm font-bold">{d.day}</span>
                <span className="text-muted">{DAYS[d.weekday % 7]}</span>
              </>
            }
          />
        );
      })}
    </div>
  );
}

function MonthView({ from, anchor, appts, onDay }: { from: DateTime; anchor: DateTime; appts: Appointment[]; onDay: (d: DateTime) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <div className="grid grid-cols-7 bg-surface text-center text-xs font-semibold text-muted">
        {DAYS.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: 42 }, (_, i) => {
          const d = from.plus({ days: i });
          const list = appts.filter((a) => local(a.starts_at).hasSame(d, "day"));
          const today = d.hasSame(DateTime.now().setZone(TZ), "day");
          return (
            <button key={i} type="button" onClick={() => onDay(d)} className={clsx("flex min-h-20 flex-col items-stretch gap-0.5 border-e border-t border-line p-1 text-start text-[11px] hover:bg-surface", d.month !== anchor.month && "text-muted/60")}>
              <span className={clsx("num grid size-6 place-items-center rounded-full text-xs font-bold", today && "bg-brand text-white")}>{d.day}</span>
              {list.slice(0, 2).map((a) => (
                <span key={a.id} className="truncate rounded bg-brand-soft px-1 text-brand">
                  {fmtTime(a.starts_at)} {a.customer_name.split(" ")[0]}
                </span>
              ))}
              {list.length > 2 && <span className="text-muted">+{list.length - 2}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───────── Appointment details ───────── */

function AppointmentSheet({ id, onClose, cat, pros }: { id: string | null; onClose: () => void; cat: Catalogue; pros: Professional[] }) {
  const a = useLoad(() => (id ? backend.appointment(id) : Promise.resolve(null)), [id]);
  const [confirm, setConfirm] = useState<null | "cancel" | "no_show">(null);
  const [move, setMove] = useState(false);
  const x = a.data;
  const after = async (fn: () => Promise<unknown>, ok: string) => {
    if (await run(fn, ok)) {
      backend.pushToGoogle(x!.id);
      await a.reload();
    }
  };
  const pro = pros.find((p) => p.id === x?.professional_id) ?? cat.professionals.find((p) => p.id === x?.professional_id);
  const active = x && (x.status === "pending" || x.status === "confirmed");
  const started = x && Date.parse(x.starts_at) <= Date.now();
  return (
    <Sheet open={!!id} onClose={onClose} title="פרטי תור">
      {!x ? (
        a.loading ? <p className="text-sm text-muted">טוען…</p> : <p className="text-sm text-muted">התור לא נמצא או שאין לך גישה אליו.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-1 h-10 w-1.5 rounded-full" style={{ background: pro?.color }} aria-hidden />
            <div className="min-w-0 flex-1">
              <Link to={`/biz/customers/${x.customer_id}`} className="text-xl font-black underline-offset-4 hover:underline">
                {x.customer_name}
              </Link>
              <p className="text-sm text-muted">
                {x.service_name} · {pro?.name}
              </p>
            </div>
            <StatusPill status={x.status} />
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <Info k="מועד" v={`${fmtDay(x.starts_at)} · ${fmtTime(x.starts_at)}–${fmtTime(x.ends_at)}`} wide />
            <Info k="מחיר" v={ils(x.price)} />
            <Info k="מקור" v={x.source === "online" ? "הזמנה אונליין" : "נקבע ידנית"} />
            {x.customer_phone && (
              <Info
                k="טלפון"
                v={
                  <a href={`tel:${x.customer_phone}`} dir="ltr" className="inline-flex items-center gap-1 underline">
                    <Phone className="size-3.5" aria-hidden /> {displayPhone(x.customer_phone)}
                  </a>
                }
              />
            )}
            {x.note && <Info k="הערה" v={x.note} wide />}
            {x.cancel_reason && <Info k="סיבת ביטול" v={x.cancel_reason} wide />}
          </dl>
          <div className="grid grid-cols-2 gap-2">
            {x.status === "pending" && (
              <Button variant="brand" onClick={() => void after(() => backend.setStatus(x.id, "confirmed"), "התור אושר")}>
                אישור
              </Button>
            )}
            {x.status === "confirmed" && started && (
              <>
                <Button variant="brand" onClick={() => void after(() => backend.setStatus(x.id, "completed"), "סומן כהושלם")}>
                  הושלם
                </Button>
                <Button variant="secondary" onClick={() => setConfirm("no_show")}>
                  לא הגיע/ה
                </Button>
              </>
            )}
            {active && (
              <>
                <Button variant="secondary" onClick={() => setMove(true)}>
                  שינוי מועד
                </Button>
                <Button variant="danger" onClick={() => setConfirm("cancel")}>
                  ביטול תור
                </Button>
              </>
            )}
          </div>
          {x.google_event_id && <p className="text-xs text-muted">מסונכרן ל־Google Calendar</p>}
        </div>
      )}
      <ConfirmDialog
        open={confirm === "cancel"}
        onClose={() => setConfirm(null)}
        title="לבטל את התור?"
        body="המועד יתפנה, ומי שממתין/ה לשעה כזו ברשימת ההמתנה יסומן/תסומן לקבלת הצעה."
        confirmLabel="ביטול התור"
        danger
        reason="optional"
        onConfirm={(r) => void after(() => backend.cancel(x!.id, r), "התור בוטל")}
      />
      <ConfirmDialog open={confirm === "no_show"} onClose={() => setConfirm(null)} title="לסמן ״לא הגיע/ה״?" confirmLabel="סימון" danger onConfirm={() => void after(() => backend.setStatus(x!.id, "no_show"), "סומן")} />
      {x && <RescheduleSheet open={move} onClose={() => setMove(false)} a={x} cat={cat} pros={pros} onDone={() => (backend.pushToGoogle(x.id), void a.reload())} />}
    </Sheet>
  );
}

function Info({ k, v, wide }: { k: string; v: React.ReactNode; wide?: boolean }) {
  return (
    <div className={clsx("rounded-xl bg-surface p-3", wide && "col-span-2")}>
      <dt className="text-xs text-muted">{k}</dt>
      <dd className="num mt-0.5 font-semibold">{v}</dd>
    </div>
  );
}

/* ───────── Slot picking (shared by new appointment and reschedule) ───────── */

function SlotPicker({ businessId, serviceId, professionalId, value, onChange, excludeId, defaultDay }: { businessId: string; serviceId: string; professionalId: string | null; value: { start: string; pro: string } | null; onChange: (v: { start: string; pro: string } | null) => void; excludeId?: string; defaultDay: string }) {
  const [day, setDay] = useState(defaultDay);
  const [manual, setManual] = useState("");
  const slots = useLoad(() => (serviceId ? backend.slots(businessId, serviceId, day, professionalId, excludeId) : Promise.resolve([])), [businessId, serviceId, day, professionalId, excludeId]);
  const unique = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of slots.data ?? []) if (!seen.has(s.starts_at)) seen.set(s.starts_at, s.professional_id);
    return [...seen.entries()];
  }, [slots.data]);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="תאריך" htmlFor="sp-day">
          <Input id="sp-day" type="date" value={day} onChange={(e) => (setDay(e.target.value), onChange(null))} />
        </Field>
        <Field label="שעה אחרת" htmlFor="sp-manual" hint="מחוץ לשעות הפעילות">
          <Input
            id="sp-manual"
            type="time"
            step={300}
            value={manual}
            onChange={(e) => {
              setManual(e.target.value);
              if (e.target.value && professionalId) onChange({ start: DateTime.fromISO(`${day}T${e.target.value}`, { zone: TZ }).toUTC().toISO()!, pro: professionalId });
            }}
            disabled={!professionalId}
          />
        </Field>
      </div>
      {slots.loading ? (
        <p className="text-sm text-muted">טוען שעות פנויות…</p>
      ) : unique.length ? (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="שעות פנויות">
          {unique.map(([s, p]) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={value?.start === s}
              onClick={() => (setManual(""), onChange({ start: s, pro: professionalId ?? p }))}
              className={clsx("num h-10 rounded-xl border text-sm font-semibold", value?.start === s ? "border-brand bg-brand text-white" : "border-line hover:bg-surface")}
            >
              {fmtTime(s)}
            </button>
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-surface p-3 text-sm text-muted">אין שעות פנויות ביום הזה. אפשר לבחור תאריך אחר או ״שעה אחרת״.</p>
      )}
    </div>
  );
}

function RescheduleSheet({ open, onClose, a, cat, pros, onDone }: { open: boolean; onClose: () => void; a: Appointment; cat: Catalogue; pros: Professional[]; onDone: () => void }) {
  const [pro, setPro] = useState(a.professional_id);
  const [v, setV] = useState<{ start: string; pro: string } | null>(null);
  const eligible = pros.filter((p) => !a.service_id || p.service_ids.includes(a.service_id));
  return (
    <Sheet open={open} onClose={onClose} title="שינוי מועד" wide>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          כרגע: <span className="num font-semibold text-ink">{fmtDay(a.starts_at)} · {fmtTime(a.starts_at)}</span>
        </p>
        <Field label="איש צוות" htmlFor="rs-pro">
          <Select id="rs-pro" value={pro} onChange={(e) => (setPro(e.target.value), setV(null))}>
            {eligible.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        {a.service_id && <SlotPicker businessId={cat.business.id} serviceId={a.service_id} professionalId={pro} value={v} onChange={setV} excludeId={a.id} defaultDay={local(a.starts_at).toISODate()!} />}
        <Button
          variant="brand"
          size="lg"
          disabled={!v}
          onClick={async () => {
            if (v && (await run(() => backend.reschedule(a.id, v.start, v.pro), "המועד עודכן"))) {
              onDone();
              onClose();
            }
          }}
        >
          אישור המועד החדש
        </Button>
      </div>
    </Sheet>
  );
}

/* ───────── New appointment ───────── */

function NewAppointmentSheet({ open, onClose, cat, pros, defaultDay }: { open: boolean; onClose: () => void; cat: Catalogue; pros: Professional[]; defaultDay: string }) {
  const businessId = cat.business.id;
  const services = cat.services.filter((s) => s.active);
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [pro, setPro] = useState<string>(pros.length === 1 ? pros[0].id : "");
  const [v, setV] = useState<{ start: string; pro: string } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setCustomer(null);
      setV(null);
      setNote("");
    }
  }, [open]);
  const eligible = pros.filter((p) => p.service_ids.includes(serviceId));
  const save = async () => {
    if (!customer || !v) return;
    setBusy(true);
    let id = "";
    const ok = await run(async () => {
      id = await backend.createAppointment({ businessId, serviceId, professionalId: v.pro, customerId: customer.id, startsAt: v.start, note });
    }, "התור נקבע");
    setBusy(false);
    if (ok) {
      backend.pushToGoogle(id);
      onClose();
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="תור חדש" wide>
      <div className="flex flex-col gap-4">
        <CustomerPicker businessId={businessId} value={customer} onChange={setCustomer} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="שירות" htmlFor="na-svc">
            <Select id="na-svc" value={serviceId} onChange={(e) => (setServiceId(e.target.value), setV(null))}>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.duration_min} דק׳ · {ils(s.price)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="איש צוות" htmlFor="na-pro">
            <Select id="na-pro" value={pro} onChange={(e) => (setPro(e.target.value), setV(null))}>
              {pros.length > 1 && <option value="">הראשון/ה שפנוי/ה</option>}
              {eligible.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {serviceId && <SlotPicker businessId={businessId} serviceId={serviceId} professionalId={pro || null} value={v} onChange={setV} defaultDay={defaultDay} />}
        <Field label="הערה (לא חובה)" htmlFor="na-note">
          <Textarea id="na-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
        <Button variant="brand" size="lg" loading={busy} disabled={!customer || !v} onClick={() => void save()}>
          {customer && v ? `קביעת תור ל${customer.full_name} · ${fmtTime(v.start)}` : "בחרו לקוח/ה ושעה"}
        </Button>
      </div>
    </Sheet>
  );
}

export function CustomerPicker({ businessId, value, onChange }: { businessId: string; value: CustomerRow | null; onChange: (c: CustomerRow | null) => void }) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: "", phone: "" });
  const list = useLoad(() => backend.customers(businessId, q), [businessId, q]);
  if (value)
    return (
      <div className="flex items-center justify-between rounded-2xl bg-brand-soft p-3">
        <span>
          <span className="block font-bold">{value.full_name}</span>
          <span className="block text-sm text-muted" dir="ltr">
            {displayPhone(value.phone)}
          </span>
        </span>
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
          החלפה
        </Button>
      </div>
    );
  if (adding)
    return (
      <form
        className="flex flex-col gap-3 rounded-2xl border border-line p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const phone = f.phone ? toE164(f.phone) : "";
          if (phone === null) return void run(async () => Promise.reject(new Error("טלפון לא תקין")));
          let c: CustomerRow | null = null;
          if (await run(async () => (c = { ...(await backend.saveCustomer(businessId, { full_name: f.name, phone })), visits: 0, last_visit: null, next_visit: null }), "לקוח/ה חדש/ה נוסף/ה")) onChange(c);
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="שם מלא" htmlFor="cp-name">
            <Input id="cp-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          </Field>
          <Field label="טלפון" htmlFor="cp-phone">
            <Input id="cp-phone" dir="ltr" className="text-start" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" variant="brand" size="sm" disabled={f.name.trim().length < 2}>
            הוספה
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
            חזרה לחיפוש
          </Button>
        </div>
      </form>
    );
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="cp-q" className="text-sm font-semibold">
        לקוח/ה
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <Input id="cp-q" className="ps-12" placeholder="חיפוש לפי שם או טלפון" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="max-h-48 overflow-y-auto rounded-2xl border border-line">
        {(list.data ?? []).slice(0, 30).map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onChange(c)} className="flex w-full items-center justify-between px-3 py-2.5 text-start text-sm hover:bg-surface">
              <span className="font-semibold">{c.full_name}</span>
              <span className="text-muted" dir="ltr">
                {displayPhone(c.phone)}
              </span>
            </button>
          </li>
        ))}
        {list.data && !list.data.length && <li className="p-3 text-sm text-muted">לא נמצאו לקוחות.</li>}
      </ul>
      <Button variant="brand-soft" size="sm" onClick={() => (setAdding(true), setF({ name: /\d/.test(q) ? "" : q, phone: /\d/.test(q) ? q : "" }))}>
        <Plus className="size-4" aria-hidden /> לקוח/ה חדש/ה
      </Button>
    </div>
  );
}

/* ───────── Blocked time ───────── */

function BlockSheet({ open, onClose, pros, day }: { open: boolean; onClose: () => void; pros: Professional[]; day: string }) {
  const m = useMembership();
  const [pro, setPro] = useState(pros[0]?.id ?? "");
  const [d, setD] = useState(day);
  const [from, setFrom] = useState("13:00");
  const [to, setTo] = useState("14:00");
  const [reason, setReason] = useState("");
  const list = useLoad(
    () => (m && open ? backend.blocks(m.business.id, DateTime.fromISO(d, { zone: TZ }).toUTC().toISO()!, DateTime.fromISO(d, { zone: TZ }).plus({ days: 1 }).toUTC().toISO()!) : Promise.resolve([])),
    [m?.business.id, d, open],
  );
  useEffect(() => {
    if (open) setD(day);
  }, [open, day]);
  return (
    <Sheet open={open} onClose={onClose} title="חסימת זמן">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const s = DateTime.fromISO(`${d}T${from}`, { zone: TZ }).toUTC().toISO()!;
          const en = DateTime.fromISO(`${d}T${to}`, { zone: TZ }).toUTC().toISO()!;
          if (await run(() => backend.addBlock({ businessId: m!.business.id, professionalId: pro, startsAt: s, endsAt: en, reason: reason || "חסום" }), "הזמן נחסם")) {
            setReason("");
            void list.reload();
          }
        }}
      >
        <Field label="איש צוות" htmlFor="bk-pro">
          <Select id="bk-pro" value={pro} onChange={(e) => setPro(e.target.value)}>
            {pros.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label="תאריך" htmlFor="bk-d">
            <Input id="bk-d" type="date" value={d} onChange={(e) => setD(e.target.value)} />
          </Field>
          <Field label="מ־" htmlFor="bk-f">
            <Input id="bk-f" type="time" step={900} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="עד" htmlFor="bk-t">
            <Input id="bk-t" type="time" step={900} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <Field label="סיבה" htmlFor="bk-r">
          <Input id="bk-r" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="חופשה, סידורים…" />
        </Field>
        <Button type="submit" variant="brand">
          חסימה
        </Button>
      </form>
      {(list.data ?? []).length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {list.data!.map((b) => (
            <li key={b.id} className="flex items-center gap-2 rounded-xl bg-surface p-2 text-sm">
              <span className="num">
                {fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}
              </span>
              <span className="flex-1 truncate">
                {pros.find((p) => p.id === b.professional_id)?.name} · {b.reason}
              </span>
              {b.source === "manual" && (
                <button type="button" aria-label="הסרת החסימה" className="grid size-8 place-items-center rounded-full hover:bg-bg" onClick={() => void run(() => backend.removeBlock(b.id), "החסימה הוסרה").then(() => list.reload())}>
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
