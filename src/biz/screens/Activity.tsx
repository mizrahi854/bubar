import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { CalendarPlus, Radio, Wand2 } from "lucide-react";
import clsx from "clsx";
import { DateTime } from "luxon";
import { backend, isPreview, type Activity } from "../backend";
import { useMembership } from "../session";
import { Body, ErrorBox, Loading, Logo, PageHead, TZ, ago, ils, run, useLoad } from "../ui";
import { Button, EmptyState, LinkButton } from "../../ui/kit";

const LINK: Record<string, (a: Activity) => string | null> = {
  customer_registered: (a) => (a.customer_id ? `/biz/customers/${a.customer_id}` : null),
  appointment_booked: (a) => (a.appointment_id ? `/biz/calendar?appt=${a.appointment_id}` : null),
  appointment_cancelled: (a) => (a.appointment_id ? `/biz/calendar?appt=${a.appointment_id}` : null),
  appointment_rescheduled: (a) => (a.appointment_id ? `/biz/calendar?appt=${a.appointment_id}` : null),
  appointment_approved: (a) => (a.appointment_id ? `/biz/calendar?appt=${a.appointment_id}` : null),
  waitlist_joined: () => "/biz/waitlist",
  waitlist_slot_opened: () => "/biz/waitlist",
  integration: () => "/biz/settings",
};

export function ActivityScreen() {
  const m = useMembership();
  const businessId = m?.business.id ?? null;
  const [items, setItems] = useState<Activity[]>([]);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [live, setLive] = useState(false);
  const feed = useLoad(() => backend.activity(businessId!, 60), [businessId]);
  useEffect(() => {
    if (feed.data) setItems(feed.data);
  }, [feed.data]);
  // Live: new events slide in at the top without reloading the page
  useEffect(() => {
    if (!businessId) return;
    setLive(true);
    const off = backend.subscribe(businessId, (e) => {
      if (e.table !== "activity") return;
      setItems((x) => (x.some((y) => y.id === e.row.id) ? x : [e.row, ...x].slice(0, 100)));
      setFresh((s) => new Set(s).add(e.row.id));
    });
    return () => {
      off();
      setLive(false);
    };
  }, [businessId]);

  const today = useMemo(() => {
    const d = DateTime.now().setZone(TZ).startOf("day");
    return { from: d.toUTC().toISO()!, to: d.plus({ days: 1 }).toUTC().toISO()! };
  }, []);
  const stats = useLoad(
    async () => {
      const [appts, wl] = await Promise.all([backend.appointments(businessId!, today.from, today.to), backend.waitlist(businessId!)]);
      const active = appts.filter((a) => a.status !== "cancelled");
      return {
        today: active.length,
        pending: appts.filter((a) => a.status === "pending").length,
        revenue: active.filter((a) => a.status !== "no_show").reduce((s, a) => s + a.price, 0),
        waiting: wl.filter((w) => w.status === "waiting" || w.status === "notified").length,
      };
    },
    [businessId],
    { businessId, tables: ["appointments", "waitlist"] },
  );

  if (!m) return null;
  return (
    <>
      <PageHead
        title={`שלום${m.role === "owner" ? "" : ","} ${m.business.name}`}
        sub={
          <span className="inline-flex items-center gap-1.5">
            <Radio className={clsx("size-3.5", live ? "text-ok" : "text-muted")} aria-hidden /> {live ? "עדכונים חיים פעילים" : "מתחבר…"}
          </span>
        }
        actions={
          <>
            {isPreview && backend.simulate && (
              <Button variant="brand-soft" size="sm" onClick={() => void run(async () => backend.simulate!())}>
                <Wand2 className="size-4" aria-hidden /> הדמיית פעולת לקוח
              </Button>
            )}
            <LinkButton to="/biz/calendar?new=1" variant="brand" size="sm">
              <CalendarPlus className="size-4" aria-hidden /> תור חדש
            </LinkButton>
          </>
        }
      />
      <Body>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            ["תורים היום", stats.data?.today],
            ["ממתינים לאישור", stats.data?.pending],
            ["הכנסה צפויה היום", stats.data ? ils(stats.data.revenue) : undefined],
            ["ברשימת ההמתנה", stats.data?.waiting],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-2xl bg-brand-soft/60 p-4">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="num mt-1 text-2xl font-black text-brand">{v ?? "—"}</dd>
            </div>
          ))}
        </dl>

        <h2 className="mb-3 mt-7 text-lg font-bold">פעילות אחרונה</h2>
        {feed.error && <ErrorBox text={feed.error} retry={feed.reload} />}
        {feed.loading && !items.length && <Loading />}
        {!feed.loading && !items.length && !feed.error && (
          <EmptyState title="עוד אין פעילות" text="כאן יופיעו בזמן אמת רישום לקוחות, הזמנות, ביטולים ורשימת המתנה." action={<LinkButton to="/biz/settings" variant="brand">לשיתוף עמוד ההזמנות</LinkButton>} />
        )}
        <ol className="flex max-w-2xl flex-col gap-3" aria-live="polite">
          {items.map((a) => {
            const to = LINK[a.kind]?.(a);
            const card = (
              <div className={clsx("rounded-[24px] border border-brand/10 bg-gradient-to-l from-brand-soft/70 to-bg p-4 shadow-[0_6px_24px_-14px_var(--brand)] transition", fresh.has(a.id) && "animate-rise ring-2 ring-brand/30")}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted">
                    <Logo className="size-6 rounded-lg text-[11px]" /> BEAUTIGO
                  </span>
                  <span className="text-xs text-muted">{ago(a.created_at)}</span>
                </div>
                <div className="mt-2 text-lg font-black">{a.title}</div>
                <p className="text-[15px] leading-snug text-ink/80">{a.body}</p>
              </div>
            );
            return <li key={a.id}>{to ? <Link to={to}>{card}</Link> : card}</li>;
          })}
        </ol>
      </Body>
    </>
  );
}
