import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router";
import { Check, Clock, MapPin, MessageCircle, Phone } from "lucide-react";
import clsx from "clsx";
import { DateTime } from "luxon";
import { backend, type PartOfDay } from "../backend";
import { useSession, useSessionBoot } from "../session";
import { toE164 } from "../slots";
import { PreviewBanner, StatusPill, TZ, fmtDay, fmtShort, fmtTime, ils, run, useLoad } from "../ui";
import { LoginCard } from "./Login";
import { Button, EmptyState, Field, Input, Textarea } from "../../ui/kit";
import { ConfirmDialog, Sheet } from "../../ui/overlays";
import { ChatThread } from "./Messages";
import { useAppearance } from "../../ui/hooks";
import { Toaster } from "../../ui/overlays";

const DAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

/** Customer-facing booking page: /#/p/:slug */
export function PublicBookingScreen() {
  useAppearance();
  useSessionBoot();
  const { slug } = useParams();
  const { user } = useSession();
  const cat = useLoad(() => backend.publicCatalogue(slug!), [slug]);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [pro, setPro] = useState<string | null>(null);
  const [day, setDay] = useState(() => DateTime.now().setZone(TZ).toISODate()!);
  const [start, setStart] = useState<string | null>(null);
  const [mode, setMode] = useState<"book" | "wait">("book");
  const [form, setForm] = useState({ name: "", phone: "", note: "" });
  const [done, setDone] = useState<null | "booked" | "pending" | "waitlist">(null);
  const [busy, setBusy] = useState(false);
  const [chat, setChat] = useState<{ open: boolean; appointmentId: string | null }>({ open: false, appointmentId: null });
  const [wait, setWait] = useState({ from: day, to: DateTime.now().setZone(TZ).plus({ days: 7 }).toISODate()!, part: "any" as PartOfDay });

  useEffect(() => {
    if (user) setForm((f) => ({ ...f, name: f.name || user.name, phone: f.phone || (user.phone ? user.phone.replace(/^\+972/, "0") : "") }));
  }, [user]);

  const c = cat.data;
  const service = c?.services.find((s) => s.id === serviceId);
  const pros = (c?.professionals ?? []).filter((p) => p.active && serviceId && p.service_ids.includes(serviceId));
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => DateTime.now().setZone(TZ).startOf("day").plus({ days: i })), []);
  const slots = useLoad(() => (c && serviceId ? backend.slots(c.business.id, serviceId, day, pro) : Promise.resolve([])), [c?.business.id, serviceId, day, pro]);
  const times = [...new Set((slots.data ?? []).map((s) => s.starts_at))];
  const mine = useLoad(() => (c && user ? backend.myAppointments(c.business.id) : Promise.resolve([])), [c?.business.id, user?.id, done]);

  if (cat.loading && !c) return <div className="grid min-h-dvh place-items-center text-muted">טוען…</div>;
  if (!c)
    return (
      <div className="mx-auto max-w-md p-6">
        <EmptyState title="העמוד לא נמצא" text="בדקו את הקישור שקיבלתם מהעסק." />
      </div>
    );

  const submit = async () => {
    const phone = form.phone ? toE164(form.phone) : "";
    if (phone === null) return run(async () => Promise.reject(new Error("מספר טלפון לא תקין")));
    if (form.name.trim().length < 2) return run(async () => Promise.reject(new Error("נא להזין שם מלא")));
    setBusy(true);
    if (mode === "wait") {
      if (await run(() => backend.joinWaitlist({ businessId: c.business.id, serviceId: serviceId!, professionalId: pro, dateFrom: wait.from, dateTo: wait.to, part: wait.part, fullName: form.name, phone, note: form.note }))) setDone("waitlist");
    } else {
      let id = "";
      if (await run(async () => (id = await backend.bookOnline({ businessId: c.business.id, serviceId: serviceId!, professionalId: pro, startsAt: start!, fullName: form.name, phone, note: form.note })))) {
        backend.pushToGoogle(id);
        setDone(service?.approval === "manual" ? "pending" : "booked");
      } else {
        setStart(null);
        void slots.reload();
      }
    }
    setBusy(false);
  };

  return (
    <div className="min-h-dvh bg-bg">
      <PreviewBanner />
      <header className="bg-[#111] px-5 pb-6 pt-8 text-white">
        <div className="mx-auto max-w-xl">
          <h1 className="text-3xl font-black">{c.business.name}</h1>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/75">
            {c.business.address && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-4" aria-hidden /> {c.business.address}
              </span>
            )}
            {c.business.phone && (
              <span className="inline-flex items-center gap-1" dir="ltr">
                <Phone className="size-4" aria-hidden /> {c.business.phone}
              </span>
            )}
          </p>
          <button type="button" onClick={() => setChat({ open: true, appointmentId: null })} className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-[#111]">
            <MessageCircle className="size-4" aria-hidden /> שליחת הודעה לעסק
          </button>
        </div>
      </header>
      <main className="mx-auto flex max-w-xl flex-col gap-6 px-5 py-6">
        {done ? (
          <div className="flex flex-col items-center gap-3 rounded-[28px] bg-surface p-8 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-ink text-ink-inverse">
              <Check className="size-8" aria-hidden />
            </span>
            <h2 className="text-2xl font-black">{done === "booked" ? "התור נקבע!" : done === "pending" ? "הבקשה נשלחה" : "נכנסת לרשימת ההמתנה"}</h2>
            <p className="text-muted">
              {done === "waitlist" ? "ברגע שיתפנה מקום שמתאים לך, העסק יקבל התראה ויחזור אליך." : `${service?.name} · ${fmtDay(start!)} · ${fmtTime(start!)}`}
              {done === "pending" && <><br />העסק יאשר את הבקשה בהקדם.</>}
            </p>
            <Button variant="secondary" onClick={() => (setDone(null), setStart(null), setMode("book"))}>
              קביעת תור נוסף
            </Button>
          </div>
        ) : (
          <>
            <section>
              <h2 className="mb-3 text-lg font-bold">1. בחירת שירות</h2>
              <ul className="flex flex-col gap-2">
                {c.services
                  .filter((s) => s.active)
                  .map((s) => (
                    <li key={s.id}>
                      <button type="button" aria-pressed={serviceId === s.id} onClick={() => (setServiceId(s.id), setPro(null), setStart(null))} className={clsx("flex w-full items-center gap-3 rounded-2xl border p-4 text-start", serviceId === s.id ? "border-ink ring-1 ring-ink" : "border-line hover:bg-surface")}>
                        <span className="flex-1">
                          <span className="block font-bold">{s.name}</span>
                          <span className="flex items-center gap-1 text-sm text-muted">
                            <Clock className="size-3.5" aria-hidden /> {s.duration_min} דק׳{s.approval === "manual" ? " · באישור העסק" : ""}
                          </span>
                        </span>
                        <span className="num font-bold">{ils(s.price)}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </section>

            {service && pros.length > 1 && (
              <section>
                <h2 className="mb-3 text-lg font-bold">2. אצל מי?</h2>
                <div className="flex flex-wrap gap-2">
                  <PillBtn on={pro === null} onClick={() => (setPro(null), setStart(null))}>
                    לא משנה לי
                  </PillBtn>
                  {pros.map((p) => (
                    <PillBtn key={p.id} on={pro === p.id} onClick={() => (setPro(p.id), setStart(null))}>
                      {p.name}
                    </PillBtn>
                  ))}
                </div>
              </section>
            )}

            {service && (
              <section>
                <h2 className="mb-3 text-lg font-bold">{pros.length > 1 ? "3" : "2"}. מתי?</h2>
                <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-2" role="radiogroup" aria-label="תאריך">
                  {days.map((d) => (
                    <button key={d.toISODate()} type="button" role="radio" aria-checked={day === d.toISODate()} onClick={() => (setDay(d.toISODate()!), setStart(null))} className={clsx("flex h-16 w-14 shrink-0 flex-col items-center justify-center rounded-2xl border text-sm", day === d.toISODate() ? "border-ink bg-ink text-ink-inverse" : "border-line")}>
                      <span className="text-xs">{DAY_SHORT[d.weekday % 7]}</span>
                      <span className="num text-lg font-bold">{d.day}</span>
                    </button>
                  ))}
                </div>
                {slots.loading ? (
                  <p className="mt-2 text-sm text-muted">בודקים שעות פנויות…</p>
                ) : times.length ? (
                  <div className="mt-2 grid grid-cols-4 gap-2" role="radiogroup" aria-label="שעה">
                    {times.map((t) => (
                      <button key={t} type="button" role="radio" aria-checked={start === t} onClick={() => (setStart(t), setMode("book"))} className={clsx("num h-11 rounded-xl border text-sm font-semibold", start === t ? "border-ink bg-ink text-ink-inverse" : "border-line hover:bg-surface")}>
                        {fmtTime(t)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 rounded-2xl bg-surface p-4 text-sm text-muted">אין שעות פנויות ביום הזה.</p>
                )}
                <button type="button" onClick={() => (setMode("wait"), setStart(null), setWait((w) => ({ ...w, from: day })))} className="mt-3 text-sm font-semibold underline underline-offset-4">
                  לא מצאת זמן שמתאים? הצטרפות לרשימת ההמתנה
                </button>
              </section>
            )}

            {service && (start || mode === "wait") && (
              <section className="rounded-[24px] border border-line p-5">
                {mode === "wait" && (
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <Field label="מתאריך" htmlFor="pb-from">
                      <Input id="pb-from" type="date" value={wait.from} onChange={(e) => setWait({ ...wait, from: e.target.value })} />
                    </Field>
                    <Field label="עד תאריך" htmlFor="pb-to">
                      <Input id="pb-to" type="date" min={wait.from} value={wait.to} onChange={(e) => setWait({ ...wait, to: e.target.value })} />
                    </Field>
                    <div className="col-span-2 flex flex-wrap gap-2">
                      {(["any", "morning", "noon", "evening"] as const).map((p) => (
                        <PillBtn key={p} on={wait.part === p} onClick={() => setWait({ ...wait, part: p })}>
                          {{ any: "כל היום", morning: "בוקר", noon: "צהריים", evening: "ערב" }[p]}
                        </PillBtn>
                      ))}
                    </div>
                  </div>
                )}
                {!user ? (
                  <LoginCard title={mode === "wait" ? "כניסה כדי להצטרף לרשימה" : "כניסה כדי לשריין את התור"} subtitle="קוד חד־פעמי בטלפון או חשבון Google. הבחירות שלך נשמרות." />
                ) : (
                  <form
                    className="flex flex-col gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submit();
                    }}
                  >
                    {mode === "book" && start && (
                      <p className="rounded-2xl bg-surface p-3 text-sm">
                        <b>{service.name}</b> · {fmtDay(start)} · <span className="num">{fmtTime(start)}</span> · {ils(service.price)}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="שם מלא" htmlFor="pb-name">
                        <Input id="pb-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                      </Field>
                      <Field label="טלפון" htmlFor="pb-phone">
                        <Input id="pb-phone" dir="ltr" className="text-start" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                      </Field>
                    </div>
                    <Field label="הערה לעסק (לא חובה)" htmlFor="pb-note">
                      <Textarea id="pb-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={300} />
                    </Field>
                    <Button type="submit" size="lg" loading={busy}>
                      {mode === "wait" ? "הצטרפות לרשימת ההמתנה" : service.approval === "manual" ? "שליחת בקשה" : "אישור התור"}
                    </Button>
                    <p className="text-xs text-muted">ביטול אפשרי עד {c.business.cancel_hours} שעות לפני התור.</p>
                  </form>
                )}
              </section>
            )}
          </>
        )}
        {user && <MyAppointments list={mine.data ?? []} reload={mine.reload} cancelHours={c.business.cancel_hours} onMessage={(appointmentId) => setChat({ open: true, appointmentId })} />}
      </main>
      <CustomerChat open={chat.open} appointmentId={chat.appointmentId} onClose={() => setChat({ open: false, appointmentId: null })} businessId={c.business.id} businessName={c.business.name} name={form.name} phone={form.phone} />
      <Toaster />
    </div>
  );
}

function PillBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={clsx("h-10 rounded-full border px-4 text-sm font-medium", on ? "border-ink bg-ink text-ink-inverse" : "border-line hover:bg-surface")}>
      {children}
    </button>
  );
}

function MyAppointments({ list, reload, cancelHours, onMessage }: { list: import("../backend").Appointment[]; reload: () => void; cancelHours: number; onMessage: (appointmentId: string) => void }) {
  const [cancel, setCancel] = useState<string | null>(null);
  const upcoming = list.filter((a) => (a.status === "confirmed" || a.status === "pending") && Date.parse(a.starts_at) > Date.now());
  if (!list.length) return null;
  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">התורים שלי</h2>
      <ul className="flex flex-col gap-2">
        {(upcoming.length ? upcoming : list.slice(0, 3)).map((a) => {
          const canCancel = upcoming.includes(a) && Date.parse(a.starts_at) - Date.now() >= cancelHours * 3600_000;
          return (
            <li key={a.id} className="flex items-center gap-3 rounded-2xl border border-line p-3 text-sm">
              <span className="flex-1">
                <span className="block font-semibold">{a.service_name}</span>
                <span className="num text-muted">{fmtShort(a.starts_at)}</span>
              </span>
              <StatusPill status={a.status} />
              <button type="button" onClick={() => onMessage(a.id)} className="grid size-9 place-items-center rounded-full hover:bg-surface" aria-label="הודעה לעסק על התור">
                <MessageCircle className="size-4" aria-hidden />
              </button>
              {canCancel && (
                <Button size="sm" variant="ghost" onClick={() => setCancel(a.id)}>
                  ביטול
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={!!cancel}
        onClose={() => setCancel(null)}
        title="לבטל את התור?"
        confirmLabel="ביטול התור"
        danger
        reason="optional"
        onConfirm={(r) =>
          void run(() => backend.cancel(cancel!, r), "התור בוטל").then((ok) => {
            if (ok) {
              backend.pushToGoogle(cancel!);
              reload();
            }
          })
        }
      />
    </section>
  );
}

/** Customer ↔ business chat in a sheet. Signs the customer in first when needed. */
function CustomerChat({ open, onClose, businessId, businessName, appointmentId, name, phone }: { open: boolean; onClose: () => void; businessId: string; businessName: string; appointmentId: string | null; name: string; phone: string }) {
  const { user } = useSession();
  const [id, setId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !user) return;
    let alive = true;
    setError(null);
    backend
      .myConversation(businessId, { fullName: name || user.name, phone: phone ? (toE164(phone) ?? "") : "", appointmentId })
      .then((x) => alive && setId(x))
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id, businessId, appointmentId]);
  return (
    <Sheet open={open} onClose={onClose} title={`הודעה ל${businessName}`}>
      {!user ? (
        <LoginCard title="כניסה כדי לשלוח הודעה" subtitle="קוד חד־פעמי בטלפון או Google. כך העסק יוכל לענות לך." />
      ) : error ? (
        <p role="alert" className="rounded-2xl bg-bad-soft p-3 text-sm text-bad">
          {error}
        </p>
      ) : id ? (
        <div className="flex h-[60dvh] flex-col">
          {appointmentId && <p className="mb-1 rounded-xl bg-surface p-2 text-xs text-muted">ההודעה תצורף לתור שבחרת.</p>}
          <ChatThread conversationId={id} side="customer" businessId={businessId} />
        </div>
      ) : (
        <p className="text-sm text-muted">פותחים שיחה…</p>
      )}
    </Sheet>
  );
}
