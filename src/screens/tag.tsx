import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { Hash } from "lucide-react";
import { visibleTo } from "../domain/feed";
import { compact } from "../domain/format";
import { useApp, useMe } from "../store/app";
import { Avatar, Chip, EmptyState, LinkButton, Segmented } from "../ui/kit";
import { Page, TopBar } from "../ui/shell";
import { PostTile } from "./discover";

const norm = (t: string) => t.replace(/^#/, "").replace(/[׳']/g, "").toLowerCase();

/** #tag page: top and recent work, businesses using the tag, related tags. */
export function TagScreen() {
  const { tag = "" } = useParams();
  const db = useApp((s) => s.db);
  const me = useMe();
  const [sort, setSort] = useState<"top" | "recent">("top");
  const key = norm(decodeURIComponent(tag));
  const posts = useMemo(() => db.posts.filter((p) => visibleTo(db, p, me) && (p.tags.some((t) => norm(t) === key) || p.caption.includes(`#${decodeURIComponent(tag)}`))), [db, me, key, tag]);
  const sorted = [...posts].sort((a, b) => (sort === "top" ? b.likedBy.length + b.savedCount * 3 - (a.likedBy.length + a.savedCount * 3) : (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt)));
  const businesses = [...new Set(posts.map((p) => p.businessId))].map((id) => db.businesses.find((b) => b.id === id)!).filter(Boolean);
  const related = useMemo(() => {
    const n = new Map<string, number>();
    for (const p of posts) for (const t of p.tags) if (norm(t) !== key) n.set(t, (n.get(t) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t);
  }, [posts, key]);
  const views = posts.reduce((s, p) => s + p.views, 0);
  return (
    <>
      <TopBar title={`#${decodeURIComponent(tag)}`} back />
      <Page>
        <div className="flex items-center gap-4">
          <span className="grid size-20 shrink-0 place-items-center rounded-full bg-surface">
            <Hash className="size-9" aria-hidden />
          </span>
          <div>
            <h2 className="text-2xl font-black">#{decodeURIComponent(tag)}</h2>
            <p className="num text-sm text-muted">
              {posts.length} פוסטים · {compact(views)} צפיות · {businesses.length} עסקים
            </p>
          </div>
        </div>
        {related.length > 0 && (
          <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
            {related.map((t) => (
              <Link key={t} to={`/tag/${encodeURIComponent(t)}`}>
                <Chip>#{t}</Chip>
              </Link>
            ))}
          </div>
        )}
        {businesses.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-2 text-sm font-bold text-muted">עסקים שעובדים בסגנון הזה</h2>
            <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
              {businesses.map((b) => (
                <li key={b.id}>
                  <Link to={`/b/${b.id}`} className="flex w-20 flex-col items-center gap-1 text-center">
                    <Avatar src={b.avatar} name={b.name} size={56} />
                    <span className="w-full truncate text-xs">{b.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className="mt-5 max-w-xs">
          <Segmented
            label="מיון"
            value={sort}
            onChange={setSort}
            options={[
              { value: "top", label: "מובילים" },
              { value: "recent", label: "חדשים" },
            ]}
          />
        </div>
        {sorted.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="עוד אין עבודות עם התגית הזו" action={<LinkButton to="/discover">לגילוי</LinkButton>} />
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-3 gap-1 md:grid-cols-4 md:gap-2">
            {sorted.map((p) => (
              <li key={p.id}>
                <PostTile post={p} />
              </li>
            ))}
          </ul>
        )}
      </Page>
    </>
  );
}
