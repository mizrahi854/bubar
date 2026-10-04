import { useMemo, useState } from "react";
import { Link } from "react-router";
import { compact, price } from "../../domain/format";
import { DemoLabel, Segmented } from "../../ui/kit";
import { Page, TopBar } from "../../ui/shell";
import { StatCard, useBiz } from "./common";
import { CreatorInsights } from "./insights";

export function AnalyticsScreen() {
  const { db, business: b, appointments } = useBiz();
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const since = Date.now() - Number(range) * 86_400_000;
  const data = useMemo(() => {
    const posts = db.posts.filter((p) => p.businessId === b.id && p.status === "published");
    const events = db.analytics.filter((e) => e.businessId === b.id && Date.parse(e.at) >= since);
    const appts = appointments.filter((a) => Date.parse(a.createdAt) >= since && a.createdBy === "customer");
    const fromContent = appts.filter((a) => a.sourcePostId);
    const views = posts.reduce((s, p) => s + p.views, 0);
    const profile = events.filter((e) => e.type === "profile_visit").length;
    const starts = events.filter((e) => e.type === "booking_start").length;
    const completed = appointments.filter((a) => a.status === "completed" && Date.parse(a.start) >= since);
    const perPost = posts
      .map((p) => {
        const booked = appts.filter((a) => a.sourcePostId === p.id);
        return { p, views: p.views, saves: p.savedCount, likes: p.likedBy.length, starts: events.filter((e) => e.type === "booking_start" && e.postId === p.id).length, bookings: booked.length, revenue: booked.reduce((s, a) => s + a.snapshot.price, 0) };
      })
      .sort((x, y) => y.bookings - x.bookings || y.views - x.views);
    return { views, profile, starts, bookings: appts.length, fromContent: fromContent.length, revenue: completed.reduce((s, a) => s + a.snapshot.price, 0), noShows: appointments.filter((a) => a.status === "no_show" && Date.parse(a.start) >= since).length, perPost };
  }, [db, b.id, appointments, since]);
  const funnel = [
    ["צפיות בתוכן", data.views],
    ["כניסות לפרופיל", data.profile],
    ["התחלת הזמנה", data.starts],
    ["הזמנות", data.bookings],
  ] as const;
  const max = Math.max(1, ...funnel.map(([, n]) => n));
  return (
    <>
      <TopBar title="נתונים" back="/manage" />
      <Page className="max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Segmented
            label="טווח"
            value={range}
            onChange={setRange}
            options={[
              { value: "7", label: "7 ימים" },
              { value: "30", label: "30 ימים" },
              { value: "90", label: "90 ימים" },
            ]}
          />
          <DemoLabel>נתוני דמו — נספרים מקומית בדפדפן</DemoLabel>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="הזמנות" value={data.bookings} hint={`${data.fromContent} מתוך תוכן`} />
          <StatCard label="הכנסות (תורים שהושלמו)" value={price(data.revenue)} />
          <StatCard label="כניסות לפרופיל" value={compact(data.profile)} />
          <StatCard label="אי־הגעות" value={data.noShows} />
        </div>
        <section className="mt-6 rounded-2xl border border-line p-4">
          <h2 className="mb-3 font-bold">משפך: מתוכן לתור</h2>
          <ol className="flex flex-col gap-2">
            {funnel.map(([label, n]) => (
              <li key={label} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0">{label}</span>
                <span className="h-7 flex-1 overflow-hidden rounded-lg bg-surface">
                  <span className="block h-full rounded-lg bg-ink" style={{ width: `${Math.max(2, (n / max) * 100)}%` }} />
                </span>
                <span className="num w-14 text-end font-semibold">{compact(n)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-muted">צפיות הן סה״כ מצטבר לתוכן המפורסם; שאר השלבים לפי הטווח שנבחר.</p>
        </section>
        <section className="mt-6">
          <h2 className="mb-2 font-bold">ייחוס הזמנות לתוכן</h2>
          <p className="mb-3 text-sm text-muted">כל תור שנקבע מ״קביעת תור״ בפוסט שומר את מקור ההשראה.</p>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="bg-surface text-start text-xs text-muted">
                <tr>
                  <th scope="col" className="p-3 text-start font-semibold">פוסט</th>
                  <th scope="col" className="p-3 font-semibold">צפיות</th>
                  <th scope="col" className="p-3 font-semibold">שמירות</th>
                  <th scope="col" className="p-3 font-semibold">התחלות הזמנה</th>
                  <th scope="col" className="p-3 font-semibold">הזמנות</th>
                  <th scope="col" className="p-3 font-semibold">שווי</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.perPost.slice(0, 12).map((r) => (
                  <tr key={r.p.id}>
                    <td className="max-w-56 truncate p-3">
                      <Link to={`/post/${r.p.id}`} className="underline-offset-4 hover:underline">
                        {r.p.caption.slice(0, 40) || r.p.id}
                      </Link>
                    </td>
                    <td className="num p-3 text-center">{compact(r.views)}</td>
                    <td className="num p-3 text-center">{r.saves}</td>
                    <td className="num p-3 text-center">{r.starts}</td>
                    <td className="num p-3 text-center font-bold">{r.bookings}</td>
                    <td className="num p-3 text-center">{price(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <CreatorInsights db={db} businessId={b.id} since={since} />
      </Page>
    </>
  );
}
