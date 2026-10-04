import { useMemo, useState } from "react";
import clsx from "clsx";
import { DateTime } from "luxon";
import { backend, type Appointment } from "../backend";
import { useMembership } from "../session";
import { Body, ErrorBox, Loading, PageHead, TZ, ils, local, useLoad } from "../ui";
import { Segmented } from "../../ui/kit";

type Range = "7" | "30" | "90" | "365";
const DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const HOURS = Array.from({ length: 14 }, (_, i) => 8 + i); // 08–21

/** Revenue and activity reports, computed from appointments in the selected period. */
export function ReportsScreen() {
  const m = useMembership();
  const businessId = m?.business.id ?? null;
  const [range, setRange] = useState<Range>("30");
  const now = DateTime.now().setZone(TZ);
  const from = now.startOf("day").minus({ days: Number(range) - 1 });
  const to = now.endOf("day");
  const data = useLoad(
    async () => {
      const [appts, cat, upcoming] = await Promise.all([
        backend.appointments(businessId!, from.toUTC().toISO()!, to.toUTC().toISO()!),
        backend.catalogue(businessId!),
        backend.appointments(businessId!, now.toUTC().toISO()!, now.plus({ days: 30 }).toUTC().toISO()!),
      ]);
      // Earlier history decides whether a customer in this period is new or returning
      const before = await backend.appointments(businessId!, from.minus({ years: 2 }).toUTC().toISO()!, from.toUTC().toISO()!);
      return { appts, cat, upcoming, before };
    },
    [businessId, range],
    { businessId, tables: ["appointments"] },
  );

  const r = useMemo(() => {
    if (!data.data) return null;
    const { appts, cat, upcoming, before } = data.data;
    const past = appts.filter((a) => Date.parse(a.starts_at) <= Date.now());
    const done = past.filter((a) => a.status === "completed");
    const decided = past.filter((a) => a.status !== "pending" && a.status !== "confirmed");
    const revenue = done.reduce((s, a) => s + a.price, 0);
    const expected = upcoming.filter((a) => a.status === "confirmed" || a.status === "pending").reduce((s, a) => s + a.price, 0);
    const seenBefore = new Set(before.filter((a) => a.status === "completed").map((a) => a.customer_id));
    const customers = [...new Set(done.map((a) => a.customer_id))];
    const returning = customers.filter((c) => seenBefore.has(c) || done.filter((a) => a.customer_id === c).length > 1).length;
    // Revenue buckets: day (≤31 days), week (90), month (365)
    const unit = range === "365" ? "month" : range === "90" ? "week" : "day";
    const buckets: { key: string; label: string; long: string; value: number; count: number }[] = [];
    for (let d = from.startOf(unit === "week" ? "week" : unit); d <= to; d = d.plus({ [`${unit}s`]: 1 })) {
      const key = d.toISODate()!;
      buckets.push({
        key,
        label: unit === "month" ? d.setLocale("he").toFormat("LLL") : unit === "week" ? d.toFormat("d/M") : d.toFormat("d"),
        long: unit === "month" ? d.setLocale("he").toFormat("LLLL yyyy") : unit === "week" ? `שבוע ${d.toFormat("d/M")}` : d.setLocale("he").toFormat("cccc d/M"),
        value: 0,
        count: 0,
      });
    }
    const keyOf = (a: Appointment) => local(a.starts_at).startOf(unit === "week" ? "week" : unit).toISODate()!;
    for (const a of done) {
      const b = buckets.find((x) => x.key === keyOf(a));
      if (b) {
        b.value += a.price;
        b.count++;
      }
    }
    const by = (key: (a: Appointment) => string, name: (k: string) => string) => {
      const map = new Map<string, { name: string; value: number; count: number }>();
      for (const a of done) {
        const k = key(a);
        const row = map.get(k) ?? { name: name(k), value: 0, count: 0 };
        row.value += a.price;
        row.count++;
        map.set(k, row);
      }
      return [...map.values()].sort((x, y) => y.value - x.value);
    };
    const heat = DAYS.map(() => HOURS.map(() => 0));
    for (const a of past.filter((a) => a.status !== "cancelled")) {
      const l = local(a.starts_at);
      const hi = HOURS.indexOf(l.hour);
      if (hi >= 0) heat[l.weekday % 7][hi]++;
    }
    return {
      revenue,
      expected,
      count: done.length,
      avg: done.length ? revenue / done.length : 0,
      noShow: decided.length ? past.filter((a) => a.status === "no_show").length / decided.length : 0,
      cancel: appts.length ? appts.filter((a) => a.status === "cancelled").length / appts.length : 0,
      customers: customers.length,
      newCustomers: customers.length - returning,
      returning: customers.length ? returning / customers.length : 0,
      online: appts.length ? appts.filter((a) => a.source === "online").length / appts.length : 0,
      buckets,
      unit,
      byPro: by((a) => a.professional_id, (k) => cat.professionals.find((p) => p.id === k)?.name ?? "—"),
      byService: by((a) => a.service_name, (k) => k),
      heat,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.data]);

  if (!m) return null;
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return (
    <>
      <PageHead
        title="דוחות והכנסות"
        sub="לפי תורים שהושלמו בתקופה. מחירים לפי מה שנשמר בכל תור."
        actions={
          <Segmented
            label="תקופה"
            value={range}
            onChange={setRange}
            options={[
              { value: "7", label: "שבוע" },
              { value: "30", label: "חודש" },
              { value: "90", label: "3 חודשים" },
              { value: "365", label: "שנה" },
            ]}
          />
        }
      />
      <Body className="flex flex-col gap-6 pb-10">
        {data.error && <ErrorBox text={data.error} retry={data.reload} />}
        {!r && !data.error && <Loading />}
        {r && (
          <>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi k="הכנסות" v={ils(r.revenue)} hint={`${r.count} תורים שהושלמו`} big />
              <Kpi k="צפוי ב־30 הימים הבאים" v={ils(r.expected)} hint="תורים מאושרים וממתינים" />
              <Kpi k="ממוצע לתור" v={ils(r.avg)} />
              <Kpi k="לקוחות חוזרים" v={pct(r.returning)} hint={`${r.customers} לקוחות בתקופה`} />
              <Kpi k="לקוחות חדשים" v={String(r.newCustomers)} hint="ביקור ראשון בתקופה" />
              <Kpi k="אי־הגעה" v={pct(r.noShow)} hint="מתוך תורים שעברו" />
              <Kpi k="ביטולים" v={pct(r.cancel)} />
              <Kpi k="הוזמנו אונליין" v={pct(r.online)} hint="השאר נקבעו ידנית" />
            </dl>

            <RevenueBars buckets={r.buckets} />

            <div className="grid gap-6 md:grid-cols-2">
              <Breakdown title="לפי איש צוות" rows={r.byPro} />
              <Breakdown title="לפי שירות" rows={r.byService} />
            </div>

            <Heatmap heat={r.heat} />
          </>
        )}
      </Body>
    </>
  );
}

function Kpi({ k, v, hint, big }: { k: string; v: string; hint?: string; big?: boolean }) {
  return (
    <div className={clsx("rounded-2xl p-4", big ? "bg-brand text-white" : "bg-brand-soft/60")}>
      <dt className={clsx("text-xs", big ? "text-white/80" : "text-muted")}>{k}</dt>
      <dd className={clsx("num mt-1 text-2xl font-black", !big && "text-ink")}>{v}</dd>
      {hint && <dd className={clsx("mt-0.5 text-xs", big ? "text-white/80" : "text-muted")}>{hint}</dd>}
    </div>
  );
}

/** Single-series column chart with per-bar hover/focus tooltip and a table view. */
function RevenueBars({ buckets }: { buckets: { key: string; label: string; long: string; value: number; count: number }[] }) {
  const [tip, setTip] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...buckets.map((b) => b.value));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const every = Math.ceil(buckets.length / 12); // label density
  return (
    <section className="rounded-[24px] border border-line p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">הכנסות לאורך זמן</h2>
        <button type="button" onClick={() => setTable((x) => !x)} className="text-sm font-semibold text-brand underline-offset-4 hover:underline">
          {table ? "תצוגת גרף" : "תצוגת טבלה"}
        </button>
      </div>
      {table ? (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th scope="col" className="py-1 text-start font-semibold">תקופה</th>
                <th scope="col" className="py-1 text-start font-semibold">תורים</th>
                <th scope="col" className="py-1 text-start font-semibold">הכנסות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {buckets.map((b) => (
                <tr key={b.key}>
                  <td className="py-1.5">{b.long}</td>
                  <td className="num py-1.5">{b.count}</td>
                  <td className="num py-1.5 font-semibold">{ils(b.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="relative h-48 w-12 shrink-0 text-[11px] text-muted" aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="num absolute end-0 -translate-y-1/2" style={{ bottom: `${(t / top) * 100}%`, transform: "translateY(50%)" }}>
                {compactIls(t)}
              </span>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="relative h-48">
              {ticks.map((t) => (
                <div key={t} className="absolute inset-x-0 border-t border-line/70" style={{ bottom: `${(t / top) * 100}%` }} aria-hidden />
              ))}
              <div className="absolute inset-0 flex items-end gap-[2px]" role="list" aria-label="הכנסות לפי תקופה">
                {buckets.map((b, i) => (
                  <button
                    key={b.key}
                    type="button"
                    role="listitem"
                    className="group relative flex h-full flex-1 items-end focus:outline-none"
                    aria-label={`${b.long}: ${ils(b.value)}, ${b.count} תורים`}
                    onPointerEnter={() => setTip(i)}
                    onPointerLeave={() => setTip(null)}
                    onFocus={() => setTip(i)}
                    onBlur={() => setTip(null)}
                  >
                    <span className={clsx("block w-full rounded-t-[4px] bg-brand transition", tip === i && "brightness-125")} style={{ height: `${(b.value / top) * 100}%`, minHeight: b.value ? 2 : 0 }} />
                  </button>
                ))}
              </div>
              {tip !== null && (
                <div className="pointer-events-none absolute -top-2 z-10 -translate-y-full rounded-xl bg-[#0d0b1a] px-3 py-2 text-xs text-white shadow-lg" style={{ insetInlineStart: `clamp(0px, calc(${((tip + 0.5) / buckets.length) * 100}% - 60px), calc(100% - 120px))` }}>
                  <div className="num text-sm font-black">{ils(buckets[tip].value)}</div>
                  <div className="text-white/75">
                    {buckets[tip].long} · {buckets[tip].count} תורים
                  </div>
                </div>
              )}
            </div>
            <div className="mt-1 flex gap-[2px] text-[10px] text-muted" aria-hidden>
              {buckets.map((b, i) => (
                <span key={b.key} className="num flex-1 text-center">
                  {i % every === 0 ? b.label : ""}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { name: string; value: number; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="rounded-[24px] border border-line p-4">
      <h2 className="mb-3 font-bold">{title}</h2>
      {!rows.length && <p className="text-sm text-muted">אין תורים שהושלמו בתקופה.</p>}
      <ul className="flex flex-col gap-3">
        {rows.slice(0, 8).map((r) => (
          <li key={r.name}>
            <div className="mb-1 flex justify-between gap-2 text-sm">
              <span className="truncate font-medium">{r.name}</span>
              <span className="num shrink-0 font-semibold">
                {ils(r.value)} <span className="font-normal text-muted">· {r.count}</span>
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-surface" aria-hidden>
              <div className="h-full rounded-full bg-brand" style={{ width: `${(r.value / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Weekday × hour, sequential single hue (brand, light → dark). */
function Heatmap({ heat }: { heat: number[][] }) {
  const max = Math.max(1, ...heat.flat());
  const [tip, setTip] = useState<string | null>(null);
  return (
    <section className="rounded-[24px] border border-line p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">שעות עמוסות</h2>
        <span className="flex items-center gap-1.5 text-xs text-muted" aria-hidden>
          פחות
          {[0.08, 0.3, 0.55, 0.8, 1].map((o) => (
            <span key={o} className="size-3 rounded-[3px]" style={{ background: `color-mix(in oklab, var(--brand) ${o * 100}%, var(--surface))` }} />
          ))}
          יותר
        </span>
      </div>
      <p className="mb-2 h-4 text-xs text-muted" aria-live="polite">
        {tip ?? "מעבר או מיקוד על תא מציג את מספר התורים"}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[460px] border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th />
              {HOURS.map((h) => (
                <th key={h} className="num text-[10px] font-normal text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heat.map((row, d) => (
              <tr key={d}>
                <th className="pe-1 text-start text-xs font-normal text-muted">{DAYS[d]}</th>
                {row.map((v, h) => {
                  const label = `יום ${DAYS[d]} ${HOURS[h]}:00 · ${v} תורים`;
                  return (
                    <td key={h} className="p-0">
                      <button
                        type="button"
                        aria-label={label}
                        onPointerEnter={() => setTip(label)}
                        onFocus={() => setTip(label)}
                        className="block h-6 w-full rounded-[4px] outline-offset-1 hover:outline hover:outline-2 hover:outline-ink focus-visible:outline focus-visible:outline-2"
                        style={{ background: v ? `color-mix(in oklab, var(--brand) ${Math.max(8, (v / max) * 100)}%, var(--surface))` : "var(--surface)" }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function niceStep(max: number) {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) return m * pow;
  return 10 * pow;
}

function compactIls(n: number) {
  return n >= 1000 ? `₪${(n / 1000).toLocaleString("he-IL", { maximumFractionDigits: 1 })}K` : `₪${n}`;
}
