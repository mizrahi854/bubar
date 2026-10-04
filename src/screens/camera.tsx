import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCcw, Timer, X } from "lucide-react";
import clsx from "clsx";
import type { MediaItem } from "../domain/types";
import { mediaStore } from "../data/repository";
import { FILTERS } from "../ui/media-fx";

const W = 720;
const H = 1280;
const MAX_SEC = 60;

function pickMime() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]) if (MediaRecorder.isTypeSupported(m)) return m;
  return "";
}

/**
 * Full-screen camera: records reels/stories (filter baked into the file through a canvas) or takes photos.
 * Needs camera permission; in embedded previews that block the camera it explains and offers upload instead.
 */
export function CameraCapture({ open, onClose, onCapture, allowVideo = true }: { open: boolean; onClose: () => void; onCapture: (m: MediaItem) => void; allowVideo?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const filterRef = useRef("none");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [filter, setFilter] = useState("none");
  const [mode, setMode] = useState<"video" | "photo">(allowVideo ? "video" : "photo");
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [delay, setDelay] = useState<0 | 3 | 10>(0);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  filterRef.current = FILTERS.find((f) => f.id === filter)?.css ?? "none";

  // Start/stop the camera stream
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setError(null);
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setError("המצלמה לא זמינה בדפדפן הזה. אפשר להעלות סרטון מהגלריה.");
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1920 } }, audio: mode === "video" });
        if (!alive) return s.getTracks().forEach((t) => t.stop());
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (e) {
        const name = (e as DOMException).name;
        setError(name === "NotAllowedError" || name === "SecurityError" ? "אין הרשאה למצלמה. אשרו גישה בהגדרות הדפדפן, או העלו מהגלריה. בתצוגה המוטמעת של Claude המצלמה חסומה — היא עובדת באתר שנפרס." : "לא הצלחנו להפעיל את המצלמה. אפשר להעלות מהגלריה.");
      }
    })();
    return () => {
      alive = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, facing, mode]);

  // Draw camera frames to the canvas with the chosen look (what you see is what gets recorded)
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const draw = () => {
      const v = videoRef.current;
      const c = canvasRef.current;
      if (v && c && v.videoWidth) {
        const ctx = c.getContext("2d")!;
        const scale = Math.max(W / v.videoWidth, H / v.videoHeight);
        const dw = v.videoWidth * scale;
        const dh = v.videoHeight * scale;
        ctx.save();
        ctx.filter = filterRef.current;
        if (facing === "user") {
          ctx.translate(W, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [open, facing]);

  useEffect(() => {
    if (!recording) return;
    const t0 = Date.now();
    const id = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      setElapsed(s);
      if (s >= MAX_SEC) stopRec();
    }, 100);
    return () => clearInterval(id);
  }, [recording]); // eslint-disable-line react-hooks/exhaustive-deps

  const snapshot = () => new Promise<Blob | null>((res) => canvasRef.current!.toBlob(res, "image/jpeg", 0.88));

  const startRec = async () => {
    const mime = pickMime();
    if (mime === null) return setError("הדפדפן לא תומך בהקלטת וידאו. אפשר לצלם תמונה או להעלות סרטון.");
    const out = canvasRef.current!.captureStream(30);
    for (const a of streamRef.current?.getAudioTracks() ?? []) out.addTrack(a);
    const rec = new MediaRecorder(out, mime ? { mimeType: mime, videoBitsPerSecond: 3_000_000 } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = async () => {
      setBusy(true);
      const blob = new Blob(chunks.current, { type: rec.mimeType || "video/webm" });
      const poster = await snapshot();
      const [src, posterSrc] = await Promise.all([mediaStore.put(blob), poster ? mediaStore.put(poster) : Promise.resolve(undefined)]);
      setBusy(false);
      onCapture({ type: "video", src, poster: posterSrc, source: "צולם באפליקציה", trimStart: 0 });
      onClose();
    };
    recRef.current = rec;
    rec.start(250);
    setElapsed(0);
    setRecording(true);
  };
  const stopRec = () => {
    recRef.current?.state === "recording" && recRef.current.stop();
    setRecording(false);
  };
  const shoot = async () => {
    const run = async () => {
      if (mode === "photo") {
        const b = await snapshot();
        if (!b) return;
        setBusy(true);
        const src = await mediaStore.put(b);
        setBusy(false);
        onCapture({ type: "image", src, source: "צולם באפליקציה" });
        onClose();
      } else if (recording) stopRec();
      else await startRec();
    };
    if (!recording && delay) {
      for (let i = delay; i > 0; i--) {
        setCount(i);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCount(0);
    }
    await run();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-black text-white" role="dialog" aria-label="מצלמה">
      <div className="safe-top" />
      <div className="flex items-center justify-between p-3">
        <button type="button" onClick={() => (stopRec(), onClose())} className="grid size-11 place-items-center rounded-full bg-white/15" aria-label="סגירת המצלמה">
          <X className="size-6" />
        </button>
        {recording && (
          <span className="num rounded-full bg-[#e5484d] px-3 py-1 text-sm font-bold" aria-live="polite">
            ● {Math.floor(elapsed)}s / {MAX_SEC}s
          </span>
        )}
        <button type="button" onClick={() => setDelay((d) => (d === 0 ? 3 : d === 3 ? 10 : 0))} disabled={recording} className="flex h-11 items-center gap-1 rounded-full bg-white/15 px-3 text-sm font-semibold" aria-label={`טיימר: ${delay ? `${delay} שניות` : "כבוי"}`}>
          <Timer className="size-5" aria-hidden /> {delay ? `${delay}s` : "כבוי"}
        </button>
      </div>
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[420px] flex-1 overflow-hidden rounded-[24px] bg-[#111]">
        <video ref={videoRef} className="hidden" playsInline muted />
        <canvas ref={canvasRef} width={W} height={H} className="size-full object-cover" />
        {error && <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm leading-relaxed">{error}</div>}
        {count > 0 && <div className="absolute inset-0 grid place-items-center text-8xl font-black">{count}</div>}
        {busy && <div className="absolute inset-0 grid place-items-center bg-black/50 text-sm">שומרים…</div>}
      </div>
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 py-3" role="radiogroup" aria-label="פילטר">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" role="radio" aria-checked={filter === f.id} onClick={() => setFilter(f.id)} className={clsx("h-9 shrink-0 rounded-full px-3.5 text-sm font-semibold", filter === f.id ? "bg-white text-[#111]" : "bg-white/15")}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-around px-6 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {allowVideo ? (
          <div className="flex rounded-full bg-white/15 p-1 text-sm font-semibold" role="radiogroup" aria-label="מצב צילום">
            {(["video", "photo"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={recording} onClick={() => setMode(m)} className={clsx("h-9 rounded-full px-3", mode === m && "bg-white text-[#111]")}>
                {m === "video" ? "וידאו" : "תמונה"}
              </button>
            ))}
          </div>
        ) : (
          <span className="w-[108px]" />
        )}
        <button
          type="button"
          onClick={() => void shoot()}
          disabled={!!error || busy || count > 0}
          aria-label={mode === "photo" ? "צילום" : recording ? "עצירת ההקלטה" : "התחלת הקלטה"}
          className={clsx("grid size-20 place-items-center rounded-full border-4 border-white transition disabled:opacity-40", recording && "border-[#e5484d]")}
        >
          <span className={clsx("block transition-all", mode === "photo" ? "size-14 rounded-full bg-white" : recording ? "size-8 rounded-lg bg-[#e5484d]" : "size-14 rounded-full bg-[#e5484d]")} />
        </button>
        <button type="button" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} disabled={recording} className="grid size-12 place-items-center rounded-full bg-white/15" aria-label="החלפת מצלמה">
          <RefreshCcw className="size-6" />
        </button>
      </div>
      <span className="sr-only">
        <Camera aria-hidden />
      </span>
    </div>
  );
}
