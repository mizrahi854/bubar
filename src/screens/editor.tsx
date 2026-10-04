import { useRef, useState } from "react";
import { Trash2, Type } from "lucide-react";
import clsx from "clsx";
import type { MediaItem, TextOverlay } from "../domain/types";
import { useMediaUrl } from "../ui/hooks";
import { FILTERS, filterCss } from "../ui/media-fx";
import { Button, Input } from "../ui/kit";

const COLORS = ["#ffffff", "#111111", "#ffd60a", "#ff375f", "#30d158"];

/** Look + text stickers. Drag a sticker to move it; positions are stored in % so they fit any screen. */
export function MediaEditor({ item, onChange }: { item: MediaItem; onChange: (m: MediaItem) => void }) {
  const url = useMediaUrl(item.type === "video" ? item.src : item.src);
  const poster = useMediaUrl(item.poster);
  const stage = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const drag = useRef<{ id: string } | null>(null);
  const overlays = item.overlays ?? [];
  const set = (patch: Partial<MediaItem>) => onChange({ ...item, ...patch });
  const update = (id: string, patch: Partial<TextOverlay>) => set({ overlays: overlays.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const current = overlays.find((o) => o.id === sel);
  const baked = item.source === "צולם באפליקציה" && item.type === "video";

  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !stage.current) return;
    const r = stage.current.getBoundingClientRect();
    const x = Math.min(95, Math.max(5, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(95, Math.max(5, ((e.clientY - r.top) / r.height) * 100));
    update(drag.current.id, { x, y });
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line p-3">
      <h3 className="text-sm font-semibold">עריכה: פילטר וטקסט</h3>
      <div
        ref={stage}
        className="relative mx-auto aspect-[9/16] w-full max-w-[260px] touch-none overflow-hidden rounded-2xl bg-[#111]"
        onPointerMove={onMove}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (drag.current = null)}
      >
        {item.type === "video" ? (
          url && <video src={url} poster={poster ?? undefined} muted loop autoPlay playsInline className="size-full object-cover" style={{ filter: baked ? "none" : filterCss(item.filter) }} />
        ) : (
          url && <img src={url} alt="" className="size-full object-cover" style={{ filter: filterCss(item.filter) }} />
        )}
        {overlays.map((o) => (
          <button
            key={o.id}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              drag.current = { id: o.id };
              setSel(o.id);
            }}
            onClick={() => setSel(o.id)}
            className={clsx(
              "absolute max-w-[85%] -translate-x-1/2 -translate-y-1/2 cursor-move whitespace-pre-wrap text-center text-base font-black leading-tight",
              o.style === "box" && "rounded-lg bg-black/60 px-2 py-0.5",
              o.style === "outline" && "[-webkit-text-stroke:1px_#000] [paint-order:stroke_fill]",
              sel === o.id && "outline outline-2 outline-offset-2 outline-white/80",
            )}
            style={{ left: `${o.x}%`, top: `${o.y}%`, color: o.color, textShadow: o.style === "plain" ? "0 1px 6px rgb(0 0 0 / 0.6)" : undefined }}
            aria-label={`טקסט: ${o.text}. גררו כדי להזיז`}
          >
            {o.text}
          </button>
        ))}
      </div>
      {baked ? (
        <p className="text-xs text-muted">הפילטר שנבחר במצלמה כבר צרוב בסרטון.</p>
      ) : (
        <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3" role="radiogroup" aria-label="פילטר">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={(item.filter ?? "none") === f.id} onClick={() => set({ filter: f.id })} className={clsx("h-9 shrink-0 rounded-full border px-3 text-sm", (item.filter ?? "none") === f.id ? "border-ink bg-ink text-ink-inverse" : "border-line")}>
              {f.label}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          const o: TextOverlay = { id: `ov-${Date.now().toString(36)}`, text: text.trim().slice(0, 80), x: 50, y: 30 + (overlays.length * 12) % 50, style: "box", color: "#ffffff" };
          set({ overlays: [...overlays, o].slice(0, 6) });
          setSel(o.id);
          setText("");
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="טקסט על התמונה, למשל ״נשארו 2 מקומות״" aria-label="טקסט חדש" maxLength={80} />
        <Button type="submit" variant="secondary" aria-label="הוספת טקסט" className="w-12 shrink-0 px-0" disabled={!text.trim()}>
          <Type className="size-5" />
        </Button>
      </form>
      {current && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface p-2">
          {(["box", "plain", "outline"] as const).map((st) => (
            <button key={st} type="button" onClick={() => update(current.id, { style: st })} aria-pressed={current.style === st} className={clsx("h-8 rounded-full px-3 text-xs font-semibold", current.style === st ? "bg-ink text-ink-inverse" : "bg-bg")}>
              {st === "box" ? "רקע" : st === "plain" ? "צל" : "מתאר"}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          {COLORS.map((c) => (
            <button key={c} type="button" onClick={() => update(current.id, { color: c })} aria-label={`צבע ${c}`} aria-pressed={current.color === c} className="size-7 rounded-full border border-line aria-pressed:ring-2 aria-pressed:ring-ink" style={{ background: c }} />
          ))}
          <button type="button" onClick={() => (set({ overlays: overlays.filter((o) => o.id !== current.id) }), setSel(null))} className="ms-auto grid size-8 place-items-center rounded-full hover:bg-bg" aria-label="מחיקת הטקסט">
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </section>
  );
}
