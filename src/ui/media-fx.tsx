import { Fragment, type ReactNode } from "react";
import { Link } from "react-router";
import clsx from "clsx";
import type { TextOverlay } from "../domain/types";

/** Looks for the camera and the editor. Same CSS filter is baked into recordings and applied at playback for uploads. */
export const FILTERS: { id: string; label: string; css: string }[] = [
  { id: "none", label: "מקורי", css: "none" },
  { id: "glow", label: "זוהר", css: "brightness(1.08) contrast(1.05) saturate(1.15)" },
  { id: "soft", label: "רך", css: "brightness(1.06) contrast(0.92) saturate(0.9)" },
  { id: "salon", label: "סלון", css: "contrast(1.12) saturate(1.2) brightness(1.02)" },
  { id: "mono", label: "שחור־לבן", css: "grayscale(1) contrast(1.1)" },
  { id: "film", label: "פילם", css: "sepia(0.18) contrast(1.05) saturate(0.95)" },
  { id: "cool", label: "קריר", css: "hue-rotate(-8deg) saturate(1.05) brightness(1.03)" },
];
export const filterCss = (id?: string) => FILTERS.find((f) => f.id === id)?.css ?? "none";

/** Text stickers over a photo or video. Positions are % of the frame. */
export function Overlays({ items, className }: { items?: TextOverlay[]; className?: string }) {
  if (!items?.length) return null;
  return (
    <div className={clsx("pointer-events-none absolute inset-0 z-10", className)} aria-hidden>
      {items.map((o) => (
        <span
          key={o.id}
          className={clsx(
            "absolute max-w-[80%] -translate-x-1/2 -translate-y-1/2 whitespace-pre-wrap text-center text-lg font-black leading-tight",
            o.style === "box" && "rounded-lg bg-black/60 px-2.5 py-1",
            o.style === "outline" && "[-webkit-text-stroke:1px_#000] [paint-order:stroke_fill]",
          )}
          style={{ left: `${o.x}%`, top: `${o.y}%`, color: o.color, textShadow: o.style === "plain" ? "0 1px 6px rgb(0 0 0 / 0.6)" : undefined }}
        >
          {o.text}
        </span>
      ))}
    </div>
  );
}

/** Turns #tags and @handles in text into links (tags → tag page, handles → business profile when it exists). */
export function RichText({ text, resolveHandle, className }: { text: string; resolveHandle?: (h: string) => string | null; className?: string }) {
  const parts: ReactNode[] = [];
  const re = /([#@][\p{L}\p{N}._׳'״-]+)/gu;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    const tok = m[0];
    if (tok.startsWith("#")) {
      const tag = tok.slice(1);
      parts.push(
        <Link key={i} to={`/tag/${encodeURIComponent(tag)}`} className="font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>
          {tok}
        </Link>,
      );
    } else {
      const href = resolveHandle?.(tok.slice(1).toLowerCase());
      parts.push(
        href ? (
          <Link key={i} to={href} className="font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>
            {tok}
          </Link>
        ) : (
          <span key={i} className="font-semibold">
            {tok}
          </span>
        ),
      );
    }
    last = i + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className={className}>{parts.map((p, k) => <Fragment key={k}>{p}</Fragment>)}</span>;
}
