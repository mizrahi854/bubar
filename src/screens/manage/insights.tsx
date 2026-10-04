import { useMemo } from "react";
import { Link } from "react-router";
import type { DB, ID, TrafficSource } from "../../domain/types";
import { compact } from "../../domain/format";
import { StatCard } from "./common";

const SOURCE_LABEL: Record<TrafficSource, string> = { feed: "בשבילך", following: "במעקב", nearby: "קרוב אליי", discover: "גילוי וחיפוש", profile: "פרופיל העסק", story: "סטוריז", share: "שיתופים", tag: "תגיות" };
const RETENTION = [1, 3, 5] as const;

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

/** Bar list: one series, brand ink, numbers always visible (works as its own table). */
function Bars({ rows, unit = "" }: { rows: { label: string; value: number; note?: string }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3 text-sm">
          <span className="w-28 shrink-0">{r.label}</span>
          <span className="h-6 flex-1 overflow-hidden rounded-lg bg-surface" aria-hidden>
            <span className="block h-full rounded-lg bg-ink" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </span>
          <span className="num w-20 text-end font-semibold">
            {compact(r.value)}
            {unit}
            {r.note && <span className="ms-1 text-xs font-normal text-muted">{r.note}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Creator insights: watch time, retention, traffic sources, followers and stories — from locally counted events. */
export function CreatorInsights({ db, businessId, since }: { db: DB; businessId: ID; since: number }) {
  const d = useMemo(() => {
    const ev = db.analytics.filter((e) => e.businessId === businessId && Date.parse(e.at) >= since);
    const watches = ev.filter((e) => e.type === "watch");
    const totalSec = watches.reduce((s, e) => s + (e.seconds ?? 0), 0);
    const completed = watches.filter((e) => e.completed).length;
    const follows = ev.filter((e) => e.type === "follow").length;
    const shares = ev.filter((e) => e.type === "share").length;
    const retention = RETENTION.map((sec) => ({ label: `אחרי ${sec} שנ׳`, value: pct(watches.filter((e) => (e.seconds ?? 0) >= sec).length, watches.length) }));
    retention.push({ label: "עד הסוף", value: pct(completed, watches.length) });
    const bySource = new Map<TrafficSource, number>();
    for (const e of watches) if (e.source) bySource.set(e.source, (bySource.get(e.source) ?? 0) + 1);
    const sources = [...bySource].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: SOURCE_LABEL[k], value: v, note: `${pct(v, watches.length)}%` }));
    const reels = db.posts
      .filter((p) => p.businessId === businessId && p.kind === "reel" && p.status === "published")
      .map((p) => {
        const w = watches.filter((e) => e.postId === p.id);
        const sec = w.reduce((s, e) => s + (e.seconds ?? 0), 0);
        return { p, plays: w.length, avg: w.length ? sec / w.length : 0, done: pct(w.filter((e) => e.completed).length, w.length), shares: ev.filter((e) => e.type === "share" && e.postId === p.id).length, starts: ev.filter((e) => e.type === "booking_start" && e.postId === p.id).length };
      })
      .sort((a, b) => b.plays - a.plays);
    const stories = db.stories
      .filter((s) => s.businessId === businessId && Date.parse(s.createdAt) >= since)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((s) => ({ s, views: s.viewers.length, likes: s.likedBy.length, live: Date.parse(s.expiresAt) > Date.now() }));
    return { plays: watches.length, totalSec, avg: watches.length ? totalSec / watches.length : 0, completion: pct(completed, watches.length), follows, shares, retention, sources, reels, stories };
  }, [db, businessId, since]);

  return (
    <section className="mt-8" aria-labelledby="ins-h">
      <h2 id="ins-h" className="text-lg font-bold">
        תובנות יוצרים
      </h2>
      <p className="mb-3 text-sm text-muted">זמן צפייה, שימור, מקורות תנועה, עוקבים וסטוריז — כמו בכלי היוצרים של הרשתות, ועם הקשר ישיר להזמנות.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="הפעלות רילס" value={compact(d.plays)} />
        <StatCard label="זמן צפייה ממוצע" value={`${d.avg.toFixed(1)} שנ׳`} hint={`${compact(Math.round(d.totalSec / 60))} דק׳ בסך הכול`} />
        <StatCard label="צפייה עד הסוף" value={`${d.completion}%`} />
        <StatCard label="עוקבים חדשים" value={d.follows} hint={`${d.shares} שיתופים`} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-line p-4">
          <h3 className="mb-3 font-semibold">שימור צופים</h3>
          <Bars rows={d.retention} unit="%" />
          <p className="mt-3 text-xs text-muted">אחוז ההפעלות שנמשכו לפחות כך. ירידה חדה בשנייה הראשונה = הפתיחה לא תופסת.</p>
        </div>
        <div className="rounded-2xl border border-line p-4">
          <h3 className="mb-3 font-semibold">מאיפה הגיעו הצפיות</h3>
          {d.sources.length ? <Bars rows={d.sources} /> : <p className="text-sm text-muted">אין עדיין צפיות בטווח הזה.</p>}
        </div>
      </div>
      <h3 className="mb-2 mt-6 font-semibold">ביצועי רילס</h3>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-surface text-xs text-muted">
            <tr>
              <th scope="col" className="p-3 text-start font-semibold">רילס</th>
              <th scope="col" className="p-3 font-semibold">הפעלות</th>
              <th scope="col" className="p-3 font-semibold">ממוצע צפייה</th>
              <th scope="col" className="p-3 font-semibold">עד הסוף</th>
              <th scope="col" className="p-3 font-semibold">שיתופים</th>
              <th scope="col" className="p-3 font-semibold">התחלות הזמנה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {d.reels.slice(0, 10).map((r) => (
              <tr key={r.p.id}>
                <td className="max-w-56 truncate p-3">
                  <Link to={`/post/${r.p.id}`} className="underline-offset-4 hover:underline">
                    {r.p.caption.slice(0, 40) || r.p.id}
                  </Link>
                </td>
                <td className="num p-3 text-center">{r.plays}</td>
                <td className="num p-3 text-center">{r.avg.toFixed(1)} שנ׳</td>
                <td className="num p-3 text-center">{r.done}%</td>
                <td className="num p-3 text-center">{r.shares}</td>
                <td className="num p-3 text-center font-bold">{r.starts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="mb-2 mt-6 font-semibold">סטוריז</h3>
      {d.stories.length ? (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {d.stories.map(({ s, views, likes, live }) => (
            <li key={s.id} className="flex items-center gap-3 p-3 text-sm">
              <span className="flex-1">
                {new Date(s.createdAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}
                {live ? <span className="ms-2 rounded-full bg-ink px-2 py-0.5 text-xs text-ink-inverse">פעיל</span> : <span className="ms-2 text-xs text-muted">פג תוקף</span>}
              </span>
              <span className="num">{views} צפיות</span>
              <span className="num">{likes} לייקים</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">לא הועלו סטוריז בטווח הזה.</p>
      )}
    </section>
  );
}
