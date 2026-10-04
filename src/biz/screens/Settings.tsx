import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { AlertTriangle, CalendarCheck2, Copy, ExternalLink, Plus, RefreshCw, Trash2, Unplug } from "lucide-react";
import { backend, isPreview, type Catalogue, type Professional, type ProfessionalInput, type Range, type Service, type ServiceInput } from "../backend";
import { useMembership, useSession } from "../session";
import { displayPhone, toE164 } from "../slots";
import { Body, PageHead, fmtShort, ils, run, useLoad } from "../ui";
import { Badge, Button, Field, Input, Segmented, Select, Toggle } from "../../ui/kit";
import { ConfirmDialog, Sheet } from "../../ui/overlays";
import { toast } from "../../store/app";

const DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const COLORS = ["#5b3df5", "#8b5cf6", "#a78bfa", "#2563eb", "#0891b2", "#16a34a", "#d97706", "#e11d48"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

export function BizSettingsScreen() {
  const m = useMembership();
  const [sp, setSp] = useSearchParams();
  const businessId = m?.business.id ?? null;
  const cat = useLoad(() => backend.catalogue(businessId!), [businessId]);
  useEffect(() => {
    const g = sp.get("google");
    if (!g) return;
    const msg: Record<string, [string, "ok" | "error"]> = {
      connected: ["Google Calendar חובר. בחרו יומן לסנכרון.", "ok"],
      denied: ["החיבור בוטל ב־Google", "error"],
      no_refresh_token: ["Google לא החזיר הרשאה קבועה. הסירו את הגישה בחשבון Google ונסו שוב.", "error"],
      forbidden: ["רק בעל/ת העסק יכול/ה לחבר יומן", "error"],
    };
    const [text, kind] = msg[g] ?? ["החיבור ל־Google נכשל. נסו שוב.", "error"];
    toast(kind, text);
    setSp((p) => (p.delete("google"), p), { replace: true });
  }, [sp, setSp]);
  if (!m) return null;
  if (m.role !== "owner")
    return (
      <>
        <PageHead title="הגדרות" />
        <Body className="max-w-xl">
          <p className="rounded-2xl bg-surface p-4 text-sm">
            את/ה מחובר/ת כחבר/ת צוות ב{m.business.name}. שירותים, מחירים, שעות וחיבור היומן מנוהלים על ידי בעלי העסק.
          </p>
          <Button variant="ghost" className="mt-4 text-bad" onClick={() => void backend.signOut()}>
            יציאה
          </Button>
        </Body>
      </>
    );
  return (
    <>
      <PageHead title="הגדרות" sub={m.business.name} />
      <Body className="flex max-w-3xl flex-col gap-6 pb-10">
        <BookingLink slug={m.business.slug} />
        <GoogleCard businessId={m.business.id} pros={cat.data?.professionals ?? []} />
        {cat.data && (
          <>
            <ServicesCard cat={cat.data} reload={cat.reload} />
            <TeamCard cat={cat.data} reload={cat.reload} />
            <BusinessCard cat={cat.data} />
          </>
        )}
        {isPreview && backend.reset && (
          <Button variant="ghost" onClick={() => (backend.reset!(), location.reload())}>
            איפוס נתוני התצוגה המקדימה
          </Button>
        )}
      </Body>
    </>
  );
}

function Card({ title, children, actions, sub }: { title: string; children: React.ReactNode; actions?: React.ReactNode; sub?: string }) {
  return (
    <section className="rounded-[24px] border border-line p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          {sub && <p className="text-sm text-muted">{sub}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function BookingLink({ slug }: { slug: string }) {
  const url = `${location.origin}${location.pathname}#/p/${slug}`;
  return (
    <Card title="עמוד ההזמנות שלך" sub="שלחו ללקוחות או שימו בביו של אינסטגרם. ההרשמה וההזמנה מופיעות אצלך בפיד בזמן אמת.">
      <div className="flex flex-wrap items-center gap-2">
        <code dir="ltr" className="min-w-0 flex-1 truncate rounded-xl bg-surface px-3 py-2.5 text-sm">
          {url}
        </code>
        <Button
          size="sm"
          variant="brand-soft"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              toast("ok", "הקישור הועתק");
            } catch {
              toast("info", "העתיקו את הקישור ידנית");
            }
          }}
        >
          <Copy className="size-4" aria-hidden /> העתקה
        </Button>
        <a href={`#/p/${slug}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3.5 text-sm font-semibold">
          <ExternalLink className="size-4" aria-hidden /> פתיחה
        </a>
      </div>
    </Card>
  );
}

/* ───────── Google Calendar ───────── */

function GoogleCard({ businessId, pros }: { businessId: string; pros: Professional[] }) {
  const st = useLoad(() => backend.googleStatus(businessId), [businessId]);
  const [cals, setCals] = useState<{ id: string; name: string; primary: boolean }[] | null>(null);
  const [cal, setCal] = useState("");
  const [pro, setPro] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const s = st.data;
  useEffect(() => {
    if (s) {
      setCal(s.calendar_id);
      setPro(s.professional_id ?? "");
    }
  }, [s]);
  const act = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key);
    await run(fn, ok);
    setBusy(null);
    await st.reload();
  };
  return (
    <Card
      title="Google Calendar"
      sub={isPreview ? "בתצוגה המקדימה החיבור מדומה. אחרי ההקמה ב־Vercel החיבור אמיתי." : "תורים נכנסים ליומן Google שלך, וזמנים תפוסים ביומן נחסמים כאן."}
      actions={<CalendarCheck2 className="size-6 text-brand" aria-hidden />}
    >
      {!s ? (
        <Button variant="brand" loading={busy === "connect"} onClick={() => void act("connect", () => backend.googleConnect(businessId))}>
          חיבור ל־Google Calendar
        </Button>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={s.status === "connected" ? "ok" : "bad"}>{s.status === "connected" ? "מחובר" : "דורש חיבור מחדש"}</Badge>
            {s.google_email && <span dir="ltr">{s.google_email}</span>}
            <span className="text-muted">· סנכרון אחרון: {s.last_sync_at ? fmtShort(s.last_sync_at) : "עוד לא"}</span>
          </div>
          {s.last_error && (
            <p role="alert" className="flex gap-2 rounded-xl bg-bad-soft p-3 text-sm text-bad">
              <AlertTriangle className="size-5 shrink-0" aria-hidden /> {s.last_error}
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="יומן לסנכרון" htmlFor="gc-cal">
              {cals ? (
                <Select id="gc-cal" value={cal} onChange={(e) => setCal(e.target.value)}>
                  {cals.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.primary ? " (ראשי)" : ""}
                    </option>
                  ))}
                </Select>
              ) : (
                <Button size="sm" variant="secondary" loading={busy === "cals"} onClick={() => void act("cals", async () => setCals(await backend.googleCalendars(businessId)))}>
                  {s.calendar_name ?? s.calendar_id} · החלפה
                </Button>
              )}
            </Field>
            <Field label="זמנים תפוסים ב־Google חוסמים את:" htmlFor="gc-pro">
              <Select id="gc-pro" value={pro} onChange={(e) => setPro(e.target.value)}>
                <option value="">לא לייבא</option>
                {pros.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            {(cal !== s.calendar_id || pro !== (s.professional_id ?? "")) && (
              <Button variant="brand" loading={busy === "save"} onClick={() => void act("save", () => backend.googleSelect(businessId, cal, cals?.find((c) => c.id === cal)?.name ?? cal, pro || null), "ההגדרה נשמרה וסונכרנה")}>
                שמירה
              </Button>
            )}
            {s.status === "error" ? (
              <Button variant="brand" loading={busy === "connect"} onClick={() => void act("connect", () => backend.googleConnect(businessId))}>
                חיבור מחדש
              </Button>
            ) : (
              <Button
                variant="secondary"
                loading={busy === "sync"}
                onClick={() =>
                  void act("sync", async () => {
                    const r = await backend.googleSync(businessId);
                    toast("ok", `סונכרנו ${r.pushed} תורים${r.imported ? `, יובאו ${r.imported} זמנים תפוסים` : ""}`);
                  })
                }
              >
                <RefreshCw className="size-4" aria-hidden /> סנכרון עכשיו
              </Button>
            )}
            <Button variant="ghost" onClick={() => setConfirm(true)}>
              <Unplug className="size-4" aria-hidden /> ניתוק
            </Button>
          </div>
          <p className="text-xs text-muted">סנכרון אוטומטי: מיד אחרי כל תור חדש, שינוי או ביטול, ובנוסף סנכרון מלא פעם ביום.</p>
        </div>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title="לנתק את Google Calendar?" body="התורים במערכת לא יושפעו. ההרשאה ל־Google תבוטל." confirmLabel="ניתוק" danger onConfirm={() => void act("disc", () => backend.googleDisconnect(businessId), "נותק")} />
    </Card>
  );
}

/* ───────── Services ───────── */

function ServicesCard({ cat, reload }: { cat: Catalogue; reload: () => void }) {
  const [edit, setEdit] = useState<Service | "new" | null>(null);
  return (
    <Card
      title="שירותים"
      actions={
        <Button size="sm" variant="brand-soft" onClick={() => setEdit("new")}>
          <Plus className="size-4" aria-hidden /> שירות
        </Button>
      }
    >
      <ul className="divide-y divide-line">
        {cat.services.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setEdit(s)} className="flex w-full items-center gap-3 py-3 text-start">
              <span className="flex-1">
                <span className="block font-semibold">
                  {s.name} {!s.active && <Badge tone="outline">לא פעיל</Badge>}
                </span>
                <span className="block text-sm text-muted">
                  {s.duration_min} דק׳{s.buffer_min ? ` + ${s.buffer_min} מרווח` : ""} · {s.approval === "manual" ? "באישור ידני" : "אישור מיידי"}
                </span>
              </span>
              <span className="num font-bold">{ils(s.price)}</span>
            </button>
          </li>
        ))}
      </ul>
      <ServiceSheet value={edit} onClose={() => setEdit(null)} businessId={cat.business.id} onSaved={reload} />
    </Card>
  );
}

function ServiceSheet({ value, onClose, businessId, onSaved }: { value: Service | "new" | null; onClose: () => void; businessId: string; onSaved: () => void }) {
  const blank: ServiceInput = { name: "", duration_min: 45, buffer_min: 10, price: 150, approval: "auto", active: true };
  const [f, setF] = useState<ServiceInput>(blank);
  useEffect(() => {
    if (value) setF(value === "new" ? blank : { id: value.id, name: value.name, duration_min: value.duration_min, buffer_min: value.buffer_min, price: value.price, approval: value.approval, active: value.active });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Sheet open={!!value} onClose={onClose} title={value === "new" ? "שירות חדש" : "עריכת שירות"}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => backend.saveService(businessId, f), "השירות נשמר")) {
            onSaved();
            onClose();
          }
        }}
      >
        <Field label="שם" htmlFor="sv-name">
          <Input id="sv-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="משך (דק׳)" htmlFor="sv-dur">
            <Input id="sv-dur" type="number" min={5} step={5} value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: Number(e.target.value) })} />
          </Field>
          <Field label="מרווח (דק׳)" htmlFor="sv-buf">
            <Input id="sv-buf" type="number" min={0} step={5} value={f.buffer_min} onChange={(e) => setF({ ...f, buffer_min: Number(e.target.value) })} />
          </Field>
          <Field label="מחיר (₪)" htmlFor="sv-price">
            <Input id="sv-price" type="number" min={0} value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} />
          </Field>
        </div>
        <div>
          <div className="mb-2 text-sm font-semibold">הזמנה אונליין</div>
          <Segmented
            label="אישור"
            value={f.approval}
            onChange={(approval) => setF({ ...f, approval })}
            options={[
              { value: "auto", label: "אישור מיידי" },
              { value: "manual", label: "דורש אישור שלי" },
            ]}
          />
        </div>
        <Toggle id="sv-active" label="פעיל" description="שירות לא פעיל לא מוצג בעמוד ההזמנות" checked={f.active} onChange={(active) => setF({ ...f, active })} />
        <p className="text-xs text-muted">תורים שכבר נקבעו שומרים את המחיר והמשך שבהם הוזמנו.</p>
        <Button type="submit" variant="brand" size="lg" disabled={f.name.trim().length < 2 || f.duration_min < 5}>
          שמירה
        </Button>
      </form>
    </Sheet>
  );
}

/* ───────── Team ───────── */

function TeamCard({ cat, reload }: { cat: Catalogue; reload: () => void }) {
  const [edit, setEdit] = useState<Professional | "new" | null>(null);
  const invites = useLoad(() => backend.invites(cat.business.id), [cat.business.id]);
  const [phone, setPhone] = useState("");
  const [proForInvite, setProForInvite] = useState("");
  return (
    <Card
      title="צוות ושעות"
      actions={
        <Button size="sm" variant="brand-soft" onClick={() => setEdit("new")}>
          <Plus className="size-4" aria-hidden /> איש צוות
        </Button>
      }
    >
      <ul className="divide-y divide-line">
        {cat.professionals.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setEdit(p)} className="flex w-full items-center gap-3 py-3 text-start">
              <span className="size-4 rounded-full" style={{ background: p.color }} aria-hidden />
              <span className="flex-1">
                <span className="block font-semibold">
                  {p.name} {!p.active && <Badge tone="outline">לא פעיל</Badge>}
                </span>
                <span className="block text-sm text-muted">
                  {p.title || "—"} · {new Set(p.hours.map((h) => h.weekday)).size} ימים · {p.service_ids.length} שירותים
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-4 flex flex-col gap-2 rounded-2xl bg-surface p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const p = toE164(phone);
          if (!p) return toast("error", "מספר טלפון לא תקין");
          if (await run(() => backend.invite(cat.business.id, p, proForInvite || null), "ההזמנה נשמרה. כשהעובד/ת ייכנס/תיכנס עם הטלפון הזה — הגישה תיפתח.")) {
            setPhone("");
            void invites.reload();
          }
        }}
      >
        <div className="text-sm font-semibold">גישת צוות למערכת</div>
        <p className="text-xs text-muted">עובד/ת נכנס/ת עם מספר הטלפון ורואה רק את היומן שלו/ה.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input dir="ltr" className="text-start" inputMode="tel" placeholder="050-1234567" aria-label="טלפון העובד/ת" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Select aria-label="העמודה ביומן" value={proForInvite} onChange={(e) => setProForInvite(e.target.value)}>
            <option value="">בחרו עמודה ביומן</option>
            {cat.professionals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="brand" disabled={!phone || !proForInvite}>
            הזמנה
          </Button>
        </div>
        {(invites.data ?? []).map((i) => (
          <div key={i.id} className="flex items-center gap-2 text-sm">
            <span dir="ltr">{displayPhone(i.phone)}</span>
            <span className="flex-1 text-muted">· {cat.professionals.find((p) => p.id === i.professional_id)?.name} · ממתין לכניסה</span>
            <button type="button" aria-label="ביטול ההזמנה" className="grid size-8 place-items-center rounded-full hover:bg-bg" onClick={() => void run(() => backend.removeInvite(i.id)).then(() => invites.reload())}>
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </form>
      <ProSheet value={edit} onClose={() => setEdit(null)} cat={cat} onSaved={reload} />
    </Card>
  );
}

function ProSheet({ value, onClose, cat, onSaved }: { value: Professional | "new" | null; onClose: () => void; cat: Catalogue; onSaved: () => void }) {
  const blank: ProfessionalInput = { name: "", title: "", color: COLORS[cat.professionals.length % COLORS.length], active: true, service_ids: cat.services.map((s) => s.id), hours: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start_min: 540, end_min: 1140 })), breaks: [] };
  const [f, setF] = useState<ProfessionalInput>(blank);
  useEffect(() => {
    if (value) setF(value === "new" ? blank : { id: value.id, name: value.name, title: value.title, color: value.color, active: value.active, service_ids: value.service_ids, hours: value.hours, breaks: value.breaks });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const setRange = (key: "hours" | "breaks", wd: number, r: Range | null) => setF({ ...f, [key]: [...f[key].filter((x) => x.weekday !== wd), ...(r ? [r] : [])] });
  return (
    <Sheet open={!!value} onClose={onClose} title={value === "new" ? "איש צוות חדש" : `עריכת ${f.name}`} wide>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          for (const r of [...f.hours, ...f.breaks]) if (r.end_min <= r.start_min) return toast("error", "שעת סיום חייבת להיות אחרי שעת התחלה");
          if (await run(() => backend.saveProfessional(cat.business.id, f), "נשמר")) {
            onSaved();
            onClose();
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="שם" htmlFor="pr-name">
            <Input id="pr-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          </Field>
          <Field label="תפקיד" htmlFor="pr-title">
            <Input id="pr-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">צבע ביומן</legend>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={`צבע ${c}`} aria-pressed={f.color === c} className="size-8 rounded-full ring-offset-2 ring-offset-bg aria-pressed:ring-2 aria-pressed:ring-ink" style={{ background: c }} />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">שירותים</legend>
          <div className="flex flex-wrap gap-2">
            {cat.services.map((s) => {
              const on = f.service_ids.includes(s.id);
              return (
                <label key={s.id} className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-line px-3 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
                  <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={on} onChange={() => setF({ ...f, service_ids: on ? f.service_ids.filter((x) => x !== s.id) : [...f.service_ids, s.id] })} />
                  {s.name}
                </label>
              );
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">שעות והפסקה</legend>
          <div className="divide-y divide-line rounded-2xl border border-line px-3">
            {DAYS.map((name, wd) => {
              const h = f.hours.find((x) => x.weekday === wd);
              const b = f.breaks.find((x) => x.weekday === wd);
              return (
                <div key={wd} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                  <label className="flex w-20 items-center gap-2 font-medium">
                    <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={!!h} onChange={(e) => (setRange("hours", wd, e.target.checked ? { weekday: wd, start_min: 540, end_min: 1140 } : null), !e.target.checked && setRange("breaks", wd, null))} />
                    {name}
                  </label>
                  {h ? (
                    <>
                      <T label={`${name} התחלה`} v={h.start_min} on={(v) => setRange("hours", wd, { ...h, start_min: v })} />–<T label={`${name} סיום`} v={h.end_min} on={(v) => setRange("hours", wd, { ...h, end_min: v })} />
                      {b ? (
                        <span className="flex items-center gap-1 text-muted">
                          הפסקה <T label={`הפסקה ${name}`} v={b.start_min} on={(v) => setRange("breaks", wd, { ...b, start_min: v })} />–<T label={`סוף הפסקה ${name}`} v={b.end_min} on={(v) => setRange("breaks", wd, { ...b, end_min: v })} />
                          <button type="button" aria-label="הסרת הפסקה" onClick={() => setRange("breaks", wd, null)} className="grid size-7 place-items-center rounded-full hover:bg-surface">
                            <Trash2 className="size-3.5" />
                          </button>
                        </span>
                      ) : (
                        <button type="button" className="text-xs font-semibold text-brand" onClick={() => setRange("breaks", wd, { weekday: wd, start_min: 780, end_min: 840 })}>
                          + הפסקה
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="text-muted">לא עובד/ת</span>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
        <Toggle id="pr-active" label="פעיל/ה" checked={f.active} onChange={(active) => setF({ ...f, active })} />
        <Button type="submit" variant="brand" size="lg" disabled={f.name.trim().length < 2}>
          שמירה
        </Button>
      </form>
    </Sheet>
  );
}

function T({ v, on, label }: { v: number; on: (v: number) => void; label: string }) {
  return <input type="time" step={900} aria-label={label} value={hhmm(v)} onChange={(e) => e.target.value && on(toMin(e.target.value))} className="num h-9 rounded-xl border border-line bg-bg px-2" />;
}

/* ───────── Business details ───────── */

function BusinessCard({ cat }: { cat: Catalogue }) {
  const b = cat.business;
  const [f, setF] = useState({ name: b.name, phone: b.phone, address: b.address, cancel_hours: b.cancel_hours, slot_step_min: b.slot_step_min, lead_min: b.lead_min });
  return (
    <Card title="פרטי העסק ומדיניות">
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => backend.updateBusiness(b.id, f), "נשמר")) await useSession.getState().refresh();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="שם העסק" htmlFor="bz-name">
            <Input id="bz-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="טלפון" htmlFor="bz-phone">
            <Input id="bz-phone" dir="ltr" className="text-start" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
        </div>
        <Field label="כתובת" htmlFor="bz-addr">
          <Input id="bz-addr" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="ביטול עד (שעות)" htmlFor="bz-cancel">
            <Input id="bz-cancel" type="number" min={0} value={f.cancel_hours} onChange={(e) => setF({ ...f, cancel_hours: Number(e.target.value) })} />
          </Field>
          <Field label="קפיצות ביומן" htmlFor="bz-step">
            <Select id="bz-step" value={f.slot_step_min} onChange={(e) => setF({ ...f, slot_step_min: Number(e.target.value) })}>
              {[5, 10, 15, 20, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {n} דק׳
                </option>
              ))}
            </Select>
          </Field>
          <Field label="הזמנה לפחות (דק׳ מראש)" htmlFor="bz-lead">
            <Input id="bz-lead" type="number" min={0} step={15} value={f.lead_min} onChange={(e) => setF({ ...f, lead_min: Number(e.target.value) })} />
          </Field>
        </div>
        <Button type="submit" variant="brand" className="self-start">
          שמירה
        </Button>
      </form>
    </Card>
  );
}
