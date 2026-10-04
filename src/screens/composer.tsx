import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Camera, CircleDot, Clapperboard, Film, ImageIcon, Images, Library, Scissors, Trash2, Upload, X } from "lucide-react";
import clsx from "clsx";
import type { MediaItem, PostKind } from "../domain/types";
import { image, video } from "../data/seed";
import { mediaStore } from "../data/repository";
import { createStory, deletePost, savePostDraftOrPublish, validatePost, type PostInput } from "../store/actions";
import { toast, useApp, useMe } from "../store/app";
import { useMediaUrl } from "../ui/hooks";
import { Button, DemoLabel, EmptyState, Field, Input, LinkButton, Segmented, Select, Textarea } from "../ui/kit";
import { ConfirmDialog, Sheet } from "../ui/overlays";
import { Page, TopBar } from "../ui/shell";
import { CameraCapture } from "./camera";
import { MediaEditor } from "./editor";

type Kind = PostKind | "story";

const LIB_VIDEOS = [
  "hair-honey",
  "hair-copper",
  "hair-ash",
  "blowout-honey",
  "blowout-espresso",
  "braid-honey",
  "braid-ash",
  "fade-dark",
  "fade-light",
  "nails-chrome",
  "nails-french",
  "nails-burgundy",
  "nails-nude",
  "makeup-rose",
  "makeup-bronze",
  "lashes-soft",
  "lashes-deep",
  "lips-red",
  "lips-nude",
  "skincare-light",
  "skincare-dark",
];
const LIB_IMAGES = ["square-hair", "square-color", "square-blowout", "square-braid", "square-barber", "square-nails", "square-gel", "square-makeup", "square-lashes", "square-brows", "square-lips", "square-skincare", "cover-hair", "cover-nails", "cover-makeup", "cover-barber"];
const UPLOAD_SOURCE = "הועלה על ידי העסק (נשמר רק בדפדפן הזה)";
const MAX_VIDEO_SEC = 90;

export function ComposerScreen() {
  const db = useApp((s) => s.db);
  const me = useMe();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const editId = sp.get("edit");
  const b = db.businesses.find((x) => x.id === me?.businessId);
  const existing = editId ? db.posts.find((p) => p.id === editId && p.businessId === b?.id) : undefined;

  const [kind, setKind] = useState<Kind>(existing?.kind ?? (sp.get("kind") === "story" ? "story" : "reel"));
  const [camera, setCamera] = useState(false);
  const [src, setSrc] = useState({
    reel: existing?.media[0]?.sourceReelUrl ?? "",
    profile: existing?.media[0]?.sourceProfileUrl ?? "",
    creator: existing?.media[0]?.creator ?? "",
  });
  const [media, setMedia] = useState<MediaItem[]>(existing?.media ?? []);
  const [cover, setCover] = useState<string | undefined>(existing?.cover);
  const [caption, setCaption] = useState(existing?.caption ?? "");
  const [subtitle, setSubtitle] = useState(existing?.subtitle ?? "");
  const [tags, setTags] = useState(existing?.tags.join(" ") ?? "");
  const [cityId, setCityId] = useState(existing?.cityId ?? b?.cityId ?? "");
  const [serviceId, setServiceId] = useState(existing?.serviceId ?? "");
  const [proId, setProId] = useState(existing?.professionalId ?? "");
  const [lib, setLib] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!b) return null;
  if (editId && !existing)
    return (
      <>
        <TopBar title="עריכת פוסט" back />
        <Page>
          <EmptyState title="הפוסט לא נמצא" action={<LinkButton to="/manage/content">לניהול התוכן</LinkButton>} />
        </Page>
      </>
    );

  const services = db.services.filter((s) => s.businessId === b.id && s.active);
  const pros = db.professionals.filter((p) => p.businessId === b.id && p.active && (!serviceId || p.serviceIds.includes(serviceId)));
  const cities = [b.cityId, ...b.serviceAreaCityIds].filter((x, i, a) => a.indexOf(x) === i).map((id) => db.cities.find((c) => c.id === id)!);
  const tagList = tags
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, 10);
  // Credit / provenance travels with every media item (never guessed — only what the business enters)
  const withSource = (m: MediaItem): MediaItem => ({
    ...m,
    sourceReelUrl: src.reel.trim() || undefined,
    sourceProfileUrl: src.profile.trim() || undefined,
    creator: src.creator.trim() || undefined,
  });
  const srcError = [src.reel, src.profile].some((u) => u.trim() && !/^https:\/\/(www\.)?(instagram\.com|facebook\.com|fb\.watch|tiktok\.com|vm\.tiktok\.com)\//i.test(u.trim())) ? "קישור מקור: אינסטגרם, פייסבוק או טיקטוק (https://…)" : null;
  const isStory = kind === "story";
  const input: PostInput = {
    kind: isStory ? "reel" : kind,
    media: media.map(withSource),
    cover,
    caption,
    subtitle,
    tags: tagList,
    cityId,
    serviceId: serviceId || undefined,
    professionalId: proId || undefined,
  };
  const errors = isStory ? (media.length ? [] : ["בחרו תמונה או סרטון לסטורי"]) : validatePost(input, true);

  const changeKind = (k: Kind) => {
    setKind(k);
    // keep only compatible media
    setMedia((m) => (k === "story" ? m.slice(0, 1) : k === "reel" ? m.filter((x) => x.type === "video").slice(0, 1) : k === "image" ? m.filter((x) => x.type === "image").slice(0, 1) : m.filter((x) => x.type === "image").slice(0, 10)));
    setCover(undefined);
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const added: MediaItem[] = [];
    for (const f of [...files]) {
      if (kind === "reel" || (kind === "story" && f.type.startsWith("video/"))) {
        if (!f.type.startsWith("video/")) {
          toast("error", "רילס חייב להיות קובץ וידאו");
          continue;
        }
        if (f.size > 60 * 1024 * 1024) {
          toast("error", "הסרטון גדול מדי (עד 60MB בדמו)");
          continue;
        }
        const dur = await videoDuration(f);
        if (dur > MAX_VIDEO_SEC) {
          toast("error", `הסרטון ארוך מ־${MAX_VIDEO_SEC} שניות`);
          continue;
        }
        added.push({
          type: "video",
          src: await mediaStore.put(f),
          source: UPLOAD_SOURCE,
          trimStart: 0,
          trimEnd: Math.round(dur * 10) / 10 || undefined,
        });
      } else {
        if (!f.type.startsWith("image/")) {
          toast("error", "בחרו קובץ תמונה");
          continue;
        }
        if (f.size > 12 * 1024 * 1024) {
          toast("error", "התמונה גדולה מדי (עד 12MB)");
          continue;
        }
        added.push({
          type: "image",
          src: await mediaStore.put(f),
          source: UPLOAD_SOURCE,
        });
      }
    }
    setBusy(false);
    if (!added.length) return;
    setMedia((m) => (kind === "carousel" ? [...m, ...added].slice(0, 10) : added.slice(0, 1)));
    setCover(undefined);
  };
  const onCaptured = (m: MediaItem) => {
    setMedia((cur) => (kind === "carousel" ? [...cur, m].slice(0, 10) : [m]));
    setCover(undefined);
  };

  const save = (publish: boolean) => {
    setTried(true);
    if (srcError) return toast("error", srcError);
    if (publish && errors.length) return toast("error", errors[0]);
    if (isStory) {
      const st = createStory({
        media: withSource(media[0]),
        serviceId: serviceId || undefined,
      });
      if (!st) return;
      toast("ok", "הסטורי עלה ל־24 שעות");
      navigate(`/story/${b.id}`, { replace: true });
      return;
    }
    const p = savePostDraftOrPublish(input, publish, existing?.id);
    if (!p) return;
    toast("ok", publish ? (existing?.status === "published" ? "השינויים נשמרו" : "פורסם!") : "נשמר כטיוטה");
    navigate(publish ? `/post/${p.id}` : "/manage/content", { replace: true });
  };

  return (
    <>
      <TopBar title={existing ? "עריכת פוסט" : "יצירת תוכן"} sub={b.name} back />
      <Page className="max-w-4xl pb-52 lg:pb-32">
        <div className="grid gap-6 md:grid-cols-[320px_1fr]">
          <div className="flex min-w-0 flex-col gap-3">
            <Segmented
              label="סוג פוסט"
              value={kind}
              onChange={changeKind}
              options={[
                {
                  value: "reel",
                  label: "רילס",
                  icon: <Film className="size-4" aria-hidden />,
                },
                {
                  value: "image",
                  label: "תמונה",
                  icon: <ImageIcon className="size-4" aria-hidden />,
                },
                {
                  value: "carousel",
                  label: "קרוסלה",
                  icon: <Images className="size-4" aria-hidden />,
                },
                ...(existing
                  ? []
                  : [
                      {
                        value: "story" as const,
                        label: "סטורי",
                        icon: <CircleDot className="size-4" aria-hidden />,
                      },
                    ]),
              ]}
            />
            <Preview kind={isStory ? (media[0]?.type === "image" ? "image" : "reel") : kind} media={media} cover={cover} onRemove={(i) => setMedia((m) => m.filter((_, j) => j !== i))} />
            <div className="grid grid-cols-3 gap-2">
              <Button onClick={() => setCamera(true)} className="px-2">
                <Camera className="size-4" aria-hidden /> צילום
              </Button>
              <label className={clsx("cursor-pointer", "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-surface px-2 text-[15px] font-semibold text-ink hover:bg-surface-2", busy && "pointer-events-none opacity-50")}>
                <Upload className="size-4" aria-hidden /> {media.length && kind !== "carousel" ? "החלפה" : "גלריה"}
                <input type="file" className="sr-only" accept={kind === "reel" ? "video/*" : kind === "story" ? "video/*,image/*" : "image/*"} multiple={kind === "carousel"} onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
              </label>
              <Button variant="secondary" onClick={() => setLib(true)} className="px-2" aria-label="ספריית דמו">
                <Library className="size-4" aria-hidden /> דמו
              </Button>
            </div>
            <p className="text-xs text-muted">{kind === "reel" ? `וידאו אנכי עד ${MAX_VIDEO_SEC} שניות.` : kind === "story" ? `תמונה או וידאו אחד (עד ${MAX_VIDEO_SEC} שניות), נעלם אחרי 24 שעות.` : kind === "carousel" ? "2–10 תמונות." : "תמונה אחת."} קבצים שמועלים נשמרים רק בדפדפן הזה.</p>
            {kind === "reel" && media[0] && <VideoTools item={media[0]} onChange={(m) => setMedia([m])} cover={cover} onCover={setCover} />}
            {kind !== "carousel" && media[0] && <MediaEditor item={media[0]} onChange={(m) => setMedia([m])} />}
            {kind === "carousel" && media.length > 1 && (
              <Field label="תמונת שער" htmlFor="cm-cover">
                <Select id="cm-cover" value={cover ?? media[0].src} onChange={(e) => setCover(e.target.value)}>
                  {media.map((m, i) => (
                    <option key={m.src + i} value={m.src}>
                      תמונה {i + 1}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {isStory && <p className="rounded-2xl bg-surface p-3 text-sm">סטורי נעלם אחרי 24 שעות. אפשר לקשר שירות כדי שיופיע כפתור ״קביעת תור״, ולראות מי צפה.</p>}
            {!isStory && (
              <>
                <Field label="כיתוב" htmlFor="cm-cap" error={tried && !caption.trim() ? "נא לכתוב כיתוב לפני פרסום" : null} hint={`${caption.length}/600`}>
                  <Textarea id="cm-cap" value={caption} maxLength={600} onChange={(e) => setCaption(e.target.value)} placeholder="ספרו על העבודה: הטכניקה, הגוון, כמה זמן זה לקח" />
                </Field>
                {kind === "reel" && (
                  <Field label="כתובית על הסרטון (לא חובה)" htmlFor="cm-sub" hint="מוצגת למי שהפעיל/ה כתוביות">
                    <Input id="cm-sub" value={subtitle} maxLength={80} onChange={(e) => setSubtitle(e.target.value)} />
                  </Field>
                )}
                <Field label="תגיות" htmlFor="cm-tags" hint="מופרדות ברווח, עד 10. למשל: בלונד גלים חתונה">
                  <Input id="cm-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
                </Field>
                {tagList.length > 0 && (
                  <div className="-mt-2 flex flex-wrap gap-1.5">
                    {tagList.map((t) => (
                      <span key={t} className="rounded-full bg-surface px-2.5 py-0.5 text-xs">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
                <Field label="עיר / אזור" htmlFor="cm-city" hint="קובע איפה הפוסט יופיע בסינון לפי עיר">
                  <Select id="cm-city" value={cityId} onChange={(e) => setCityId(e.target.value)}>
                    {cities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="שירות מקושר" htmlFor="cm-svc" hint="״קביעת תור״ מהפוסט יבחר אותו מראש">
                <Select
                  id="cm-svc"
                  value={serviceId}
                  onChange={(e) => {
                    setServiceId(e.target.value);
                    const p = db.professionals.find((x) => x.id === proId);
                    if (p && e.target.value && !p.serviceIds.includes(e.target.value)) setProId("");
                  }}
                >
                  <option value="">ללא</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="איש/אשת מקצוע" htmlFor="cm-pro">
                <Select id="cm-pro" value={proId} onChange={(e) => setProId(e.target.value)}>
                  <option value="">ללא</option>
                  {pros.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <details className="rounded-2xl border border-line p-3" open={!!(src.reel || src.profile || src.creator)}>
              <summary className="cursor-pointer text-sm font-semibold">קרדיט ומקור (ייבוא מאינסטגרם / טיקטוק)</summary>
              <div className="mt-3 flex flex-col gap-3">
                <p className="text-xs leading-relaxed text-muted">העלו את הקובץ עצמו (עם רשות של בעלי התוכן) והוסיפו כאן את הקישור המקורי. הקישור נשמר כמקור ומוצג כקרדיט — המערכת לא מורידה תוכן מקישורים.</p>
                <Field label="קישור לפוסט / רילס המקורי" htmlFor="cm-src-reel" error={srcError}>
                  <Input id="cm-src-reel" dir="ltr" className="text-start" placeholder="https://www.instagram.com/reel/…" value={src.reel} onChange={(e) => setSrc({ ...src, reel: e.target.value })} />
                </Field>
                <Field label="קישור לפרופיל של היוצר/ת" htmlFor="cm-src-profile">
                  <Input id="cm-src-profile" dir="ltr" className="text-start" placeholder="https://www.instagram.com/…" value={src.profile} onChange={(e) => setSrc({ ...src, profile: e.target.value })} />
                </Field>
                <Field label="שם היוצר/ת לקרדיט" htmlFor="cm-src-creator" hint="רק אם ידוע בוודאות">
                  <Input id="cm-src-creator" value={src.creator} onChange={(e) => setSrc({ ...src, creator: e.target.value })} />
                </Field>
              </div>
            </details>
            {existing?.status === "hidden" && <p className="rounded-2xl bg-bad-soft p-3 text-sm text-bad">הפוסט הוסתר על ידי צוות Beautigo: {existing.hiddenReason}. אפשר לערוך, אך הוא לא יוצג עד לבדיקה חוזרת.</p>}
            {tried && errors.length > 0 && (
              <ul role="alert" className="rounded-2xl bg-bad-soft p-3 text-sm text-bad">
                {errors.map((e) => (
                  <li key={e}>• {e}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Page>

      <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 px-3 lg:bottom-4 lg:ps-72">
        <div className="glass mx-auto flex max-w-4xl items-center gap-2 rounded-[24px] p-3">
          {existing && (
            <Button variant="danger" aria-label="מחיקת הפוסט" className="w-12 px-0" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-5" />
            </Button>
          )}
          <span className="flex-1" />
          {existing?.status !== "published" && !isStory && (
            <Button variant="secondary" disabled={!media.length || busy} onClick={() => save(false)}>
              שמירת טיוטה
            </Button>
          )}
          <Button disabled={busy} onClick={() => save(true)}>
            {isStory ? "העלאה לסטורי" : existing?.status === "published" ? "שמירת שינויים" : "פרסום"}
          </Button>
        </div>
      </div>

      <CameraCapture open={camera} onClose={() => setCamera(false)} onCapture={onCaptured} allowVideo={kind === "reel" || kind === "story"} />
      <LibrarySheet
        open={lib}
        onClose={() => setLib(false)}
        kind={isStory ? "reel" : kind}
        onPick={(m) => {
          setMedia((cur) => (kind === "carousel" ? [...cur, m].slice(0, 10) : [m]));
          setCover(undefined);
          if (kind !== "carousel") setLib(false);
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="למחוק את הפוסט?"
        body="הפוסט יוסר מהפרופיל, מהפיד ומהאוספים של לקוחות. תורים שנקבעו ממנו לא יושפעו."
        confirmLabel="מחיקה"
        danger
        onConfirm={() => {
          if (existing && deletePost(existing.id)) {
            toast("ok", "הפוסט נמחק");
            navigate("/manage/content", { replace: true });
          }
        }}
      />
    </>
  );
}

function videoDuration(f: Blob) {
  return new Promise<number>((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    const url = URL.createObjectURL(f);
    v.onloadedmetadata = () => {
      resolve(Number.isFinite(v.duration) ? v.duration : 0);
      URL.revokeObjectURL(url);
    };
    v.onerror = () => resolve(0);
    v.src = url;
  });
}

function Preview({ kind, media, cover, onRemove }: { kind: PostKind; media: MediaItem[]; cover?: string; onRemove: (i: number) => void }) {
  if (!media.length)
    return (
      <div className="grid aspect-[4/5] max-h-[45vh] w-full place-items-center rounded-[24px] border-2 border-dashed md:aspect-[9/16] md:max-h-none border-line bg-surface text-center text-sm text-muted">
        <div className="flex flex-col items-center gap-2 p-6">
          <Clapperboard className="size-8" aria-hidden />
          בחרו {kind === "reel" ? "סרטון" : kind === "carousel" ? "תמונות" : "תמונה"} להעלאה או מספריית הדמו
        </div>
      </div>
    );
  if (kind === "carousel")
    return (
      <ul className="grid grid-cols-3 gap-2">
        {media.map((m, i) => (
          <li key={m.src + i} className="relative">
            <Thumb src={m.src} className={clsx("aspect-[3/4]", (cover ?? media[0].src) === m.src && "ring-2 ring-ink ring-offset-2 ring-offset-bg")} />
            <span className="num absolute start-1 top-1 rounded-full bg-black/55 px-1.5 text-[11px] text-white">{i + 1}</span>
            <button type="button" onClick={() => onRemove(i)} className="absolute end-1 top-1 grid size-6 place-items-center rounded-full bg-white/90 text-[#111]" aria-label={`הסרת תמונה ${i + 1}`}>
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    );
  return media[0].type === "video" ? null : <Thumb src={media[0].src} className="aspect-[4/5] rounded-[24px]" />;
}

function Thumb({ src, className }: { src: string; className?: string }) {
  const url = useMediaUrl(src);
  return <div className={clsx("overflow-hidden rounded-xl bg-surface", className)}>{url && <img src={url} alt="" className="media size-full object-cover" />}</div>;
}

/** Preview + cover frame + simulated trim (stored as a playback window; the file is not re-encoded). */
function VideoTools({ item, onChange, cover, onCover }: { item: MediaItem; onChange: (m: MediaItem) => void; cover?: string; onCover: (src: string | undefined) => void }) {
  const url = useMediaUrl(item.src);
  const ref = useRef<HTMLVideoElement>(null);
  const [dur, setDur] = useState(0);
  const [t, setT] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const start = item.trimStart ?? 0;
  const end = item.trimEnd ?? dur;
  const coverUrl = useMediaUrl(cover);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onTime = () => {
      if (v.currentTime >= end && end > start) v.currentTime = start;
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [start, end]);
  const seek = (s: number) => {
    setT(s);
    if (ref.current) {
      ref.current.pause();
      ref.current.currentTime = s;
    }
  };
  const capture = async () => {
    const v = ref.current;
    if (!v || !v.videoWidth) return;
    setCapturing(true);
    try {
      const c = document.createElement("canvas");
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext("2d")!.drawImage(v, 0, 0);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
      if (!blob) throw new Error();
      onCover(await mediaStore.put(blob));
      toast("ok", "תמונת השער עודכנה");
    } catch {
      toast("error", "לא ניתן ללכוד פריים מהסרטון הזה");
    }
    setCapturing(false);
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="relative mx-auto aspect-[9/16] max-h-[60vh] overflow-hidden rounded-[24px] bg-[#111]">
        {url && (
          <video ref={ref} key={url} className="media size-full object-cover" playsInline muted loop controls poster={item.poster} onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}>
            {item.srcWebm && <source src={item.srcWebm} type="video/webm" />}
            <source src={url} />
          </video>
        )}
        {coverUrl && <img src={coverUrl} alt="תמונת השער" className="absolute bottom-3 end-3 h-24 w-14 rounded-lg border-2 border-white object-cover shadow-lg" />}
      </div>
      {dur > 0 && (
        <>
          <fieldset className="rounded-2xl border border-line p-3">
            <legend className="px-1 text-sm font-semibold">תמונת שער</legend>
            <input type="range" min={0} max={dur} step={0.1} value={t} onChange={(e) => seek(Number(e.target.value))} aria-label="בחירת פריים לשער" className="w-full accent-[var(--ink)]" />
            <div className="mt-2 flex gap-2">
              <Button size="sm" loading={capturing} onClick={capture}>
                שימוש בפריים <span className="num">{t.toFixed(1)}s</span>
              </Button>
              {cover && (
                <Button size="sm" variant="ghost" onClick={() => onCover(undefined)}>
                  ברירת מחדל
                </Button>
              )}
            </div>
          </fieldset>
          <fieldset className="rounded-2xl border border-line p-3">
            <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold">
              <Scissors className="size-4" aria-hidden /> חיתוך <DemoLabel>מדומה</DemoLabel>
            </legend>
            <p className="mb-2 text-xs text-muted">נשמר כחלון ניגון בלבד — הקובץ המקורי לא נערך. בגרסה אמיתית החיתוך יתבצע בשרת.</p>
            <label className="flex items-center gap-2 text-sm">
              <span className="w-10">התחלה</span>
              <input
                type="range"
                min={0}
                max={dur}
                step={0.1}
                value={start}
                onChange={(e) =>
                  onChange({
                    ...item,
                    trimStart: Math.min(Number(e.target.value), end - 1),
                  })
                }
                className="flex-1 accent-[var(--ink)]"
              />
              <span className="num w-10 text-end">{start.toFixed(1)}</span>
            </label>
            <label className="mt-1 flex items-center gap-2 text-sm">
              <span className="w-10">סיום</span>
              <input
                type="range"
                min={0}
                max={dur}
                step={0.1}
                value={end}
                onChange={(e) =>
                  onChange({
                    ...item,
                    trimEnd: Math.max(Number(e.target.value), start + 1),
                  })
                }
                className="flex-1 accent-[var(--ink)]"
              />
              <span className="num w-10 text-end">{end.toFixed(1)}</span>
            </label>
            <p className="num mt-1 text-xs text-muted">אורך מנוגן: {(end - start).toFixed(1)} שניות</p>
          </fieldset>
        </>
      )}
    </div>
  );
}

function LibrarySheet({ open, onClose, kind, onPick }: { open: boolean; onClose: () => void; kind: PostKind; onPick: (m: MediaItem) => void }) {
  const items = kind === "reel" ? LIB_VIDEOS.map(video) : LIB_IMAGES.map(image);
  return (
    <Sheet open={open} onClose={onClose} title="ספריית דמו" wide>
      <p className="mb-3 text-sm text-muted">איורים מקוריים שנוצרו בקוד עבור הדמו — לא צילומים של אנשים או עבודות אמיתיות.</p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {items.map((m) => (
          <li key={m.src}>
            <button type="button" onClick={() => onPick(m)} className="block w-full overflow-hidden rounded-xl bg-surface transition hover:opacity-80" aria-label={`בחירת ${m.src.split("/").pop()}`}>
              <img src={m.poster ?? m.src} alt="" loading="lazy" className="aspect-[3/4] w-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      {kind === "carousel" && (
        <Button className="mt-4 w-full" onClick={onClose}>
          סיום
        </Button>
      )}
    </Sheet>
  );
}
