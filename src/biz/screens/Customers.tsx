import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Cake, CalendarPlus, ImagePlus, MessageCircle, Phone, Search, Trash2, UserPlus } from "lucide-react";
import clsx from "clsx";
import { DateTime } from "luxon";
import { backend, type Customer, type CustomerPhoto } from "../backend";
import { useMembership } from "../session";
import { displayPhone, toE164 } from "../slots";
import { Body, ErrorBox, Loading, PageHead, StatusPill, TZ, fmtShort, ils, run, useLoad } from "../ui";
import { useOpenChat } from "./Messages";
import { Avatar, Button, EmptyState, Field, Input, LinkButton, Select, Textarea } from "../../ui/kit";
import { ConfirmDialog, Sheet } from "../../ui/overlays";

export function CustomersScreen() {
  const m = useMembership();
  const businessId = m?.business.id ?? null;
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [add, setAdd] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => setTerm(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const list = useLoad(() => backend.customers(businessId!, term), [businessId, term], { businessId, tables: ["customers", "appointments"] });
  return (
    <>
      <PageHead
        title="לקוחות"
        sub={list.data ? `${list.data.length} לקוחות` : undefined}
        actions={
          <Button variant="brand" size="sm" onClick={() => setAdd(true)}>
            <UserPlus className="size-4" aria-hidden /> לקוח/ה חדש/ה
          </Button>
        }
      />
      <Body>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <Input type="search" className="ps-12" placeholder="חיפוש לפי שם או טלפון" aria-label="חיפוש לקוחות" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {list.error && <ErrorBox text={list.error} retry={list.reload} />}
        {list.loading && !list.data && <Loading />}
        {list.data && !list.data.length && <EmptyState title={term ? "לא נמצאו לקוחות" : "עוד אין לקוחות"} text="לקוחות נוספים אוטומטית כשהם מזמינים אונליין, או ידנית כאן." />}
        <ul className="grid gap-2 md:grid-cols-2">
          {list.data?.map((c) => (
            <li key={c.id}>
              <Link to={`/biz/customers/${c.id}`} className="flex items-center gap-3 rounded-2xl border border-line p-3 hover:bg-surface">
                <Avatar name={c.full_name} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate font-semibold">
                    {c.full_name}
                    {birthdayInfo(c.birthday)?.soon && <Cake className="size-4 text-brand" aria-label="יום הולדת בקרוב" />}
                    {c.tags.slice(0, 2).map((t) => (
                      <span key={t} className="rounded-full bg-brand-soft px-1.5 text-[10px] font-semibold text-brand">
                        {t}
                      </span>
                    ))}
                  </div>
                  <div className="truncate text-sm text-muted" dir="ltr">
                    {displayPhone(c.phone)}
                  </div>
                </div>
                <div className="text-end text-xs text-muted">
                  <div className="num">{c.visits} ביקורים</div>
                  {c.next_visit ? <div className="font-semibold text-brand">הבא: {fmtShort(c.next_visit)}</div> : c.last_visit && <div>אחרון: {fmtShort(c.last_visit)}</div>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Body>
      <CustomerForm open={add} onClose={() => setAdd(false)} onSaved={(id) => navigate(`/biz/customers/${id}`)} />
    </>
  );
}

function CustomerForm({ open, onClose, onSaved, initial }: { open: boolean; onClose: () => void; onSaved: (id: string) => void; initial?: Customer }) {
  const m = useMembership();
  const empty = { full_name: "", phone: "", email: "", notes: "", preferences: "", birthday: "", tags: [] as string[] };
  const [f, setF] = useState(empty);
  const [tag, setTag] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setF(initial ? { full_name: initial.full_name, phone: displayPhone(initial.phone), email: initial.email ?? "", notes: initial.notes, preferences: initial.preferences, birthday: initial.birthday ?? "", tags: initial.tags } : empty);
      setErr(null);
      setTag("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);
  const addTag = (t: string) => {
    const v = t.trim().slice(0, 24);
    if (v && !f.tags.includes(v)) setF({ ...f, tags: [...f.tags, v].slice(0, 12) });
    setTag("");
  };
  return (
    <Sheet open={open} onClose={onClose} title={initial ? "עריכת כרטיס לקוח" : "לקוח/ה חדש/ה"} wide>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const phone = f.phone.trim() ? toE164(f.phone) : "";
          if (phone === null) return setErr("מספר טלפון לא תקין");
          let id = "";
          const input = { id: initial?.id, full_name: f.full_name, phone, email: f.email || null, notes: f.notes, preferences: f.preferences, birthday: f.birthday || null, tags: tag.trim() ? [...f.tags, tag.trim()] : f.tags };
          if (await run(async () => (id = (await backend.saveCustomer(m!.business.id, input)).id), "נשמר")) {
            onClose();
            onSaved(id);
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="שם מלא" htmlFor="cf-name">
            <Input id="cf-name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required />
          </Field>
          <Field label="טלפון" htmlFor="cf-phone" error={err}>
            <Input id="cf-phone" dir="ltr" className="text-start" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </Field>
          <Field label="אימייל" htmlFor="cf-email">
            <Input id="cf-email" type="email" dir="ltr" className="text-start" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label="תאריך לידה" htmlFor="cf-bday" hint="מסמן תזכורת לפני יום ההולדת">
            <Input id="cf-bday" type="date" value={f.birthday} onChange={(e) => setF({ ...f, birthday: e.target.value })} />
          </Field>
        </div>
        <div>
          <label htmlFor="cf-tag" className="text-sm font-semibold">
            תגיות
          </label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {f.tags.map((t) => (
              <button key={t} type="button" onClick={() => setF({ ...f, tags: f.tags.filter((x) => x !== t) })} className="rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand" aria-label={`הסרת התגית ${t}`}>
                {t} ✕
              </button>
            ))}
            {["VIP", "צבע קבוע", "רגישות", "כלה"].filter((t) => !f.tags.includes(t)).map((t) => (
              <button key={t} type="button" onClick={() => addTag(t)} className="rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-muted hover:bg-surface">
                + {t}
              </button>
            ))}
          </div>
          <Input
            id="cf-tag"
            className="mt-2"
            placeholder="תגית חדשה ואנטר"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag(tag);
              }
            }}
          />
        </div>
        <Field label="העדפות ופורמולות" htmlFor="cf-pref" hint="גוון, טכניקה, רגישויות, משקה מועדף…">
          <Textarea id="cf-pref" value={f.preferences} onChange={(e) => setF({ ...f, preferences: e.target.value })} maxLength={1000} />
        </Field>
        <Field label="הערות פנימיות" htmlFor="cf-notes">
          <Textarea id="cf-notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} />
        </Field>
        <Button type="submit" variant="brand" size="lg" disabled={f.full_name.trim().length < 2}>
          שמירה
        </Button>
      </form>
    </Sheet>
  );
}

export function CustomerDetailScreen() {
  const { id } = useParams();
  const m = useMembership();
  const [edit, setEdit] = useState(false);
  const openChat = useOpenChat();
  const d = useLoad(() => backend.customer(id!), [id], { businessId: m?.business.id ?? null, tables: ["appointments", "customers"] });
  if (d.loading && !d.data) return <Body className="py-6"><Loading /></Body>;
  if (!d.data)
    return (
      <Body className="py-6">
        <EmptyState title="הלקוח/ה לא נמצא/ה" action={<LinkButton to="/biz/customers" variant="brand">ללקוחות</LinkButton>} />
      </Body>
    );
  const { customer: c, appointments } = d.data;
  const done = appointments.filter((a) => a.status === "completed");
  const now = new Date().toISOString();
  const bday = birthdayInfo(c.birthday);
  const favorite = topService(done.map((a) => a.service_name));
  return (
    <>
      <PageHead
        title={c.full_name}
        sub={
          c.phone ? (
            <a href={`tel:${c.phone}`} dir="ltr" className="inline-flex items-center gap-1 underline">
              <Phone className="size-3.5" aria-hidden /> {displayPhone(c.phone)}
            </a>
          ) : (
            "ללא טלפון"
          )
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEdit(true)}>
              עריכה
            </Button>
            <Button variant="brand-soft" size="sm" onClick={() => void openChat(c.id)}>
              <MessageCircle className="size-4" aria-hidden /> הודעה
            </Button>
            <LinkButton to="/biz/calendar?new=1" variant="brand" size="sm">
              <CalendarPlus className="size-4" aria-hidden /> תור חדש
            </LinkButton>
          </>
        }
      />
      <Body>
        {(c.tags.length > 0 || bday) && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {bday && (
              <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", bday.soon ? "bg-brand text-white" : "bg-surface")}>
                <Cake className="size-3.5" aria-hidden /> {bday.label}
              </span>
            )}
            {c.tags.map((t) => (
              <span key={t} className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-semibold text-brand">
                {t}
              </span>
            ))}
          </div>
        )}
        <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          {[
            ["ביקורים", done.length],
            ["סה״כ", ils(done.reduce((s, a) => s + a.price, 0))],
            ["ממוצע לביקור", done.length ? ils(done.reduce((s, a) => s + a.price, 0) / done.length) : "—"],
            ["אי־הגעות", appointments.filter((a) => a.status === "no_show").length],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-brand-soft/60 p-3">
              <dd className="num text-xl font-black text-brand">{v}</dd>
              <dt className="text-xs text-muted">{k}</dt>
            </div>
          ))}
        </dl>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <section className="rounded-2xl border border-line p-4">
            <h2 className="mb-1 text-sm font-bold">העדפות ופורמולות</h2>
            <p className="whitespace-pre-line text-sm">{c.preferences || <span className="text-muted">עוד לא נרשמו. למשל: גוון קבוע, רגישויות, משקה מועדף.</span>}</p>
            {favorite && <p className="mt-2 text-xs text-muted">השירות הקבוע: {favorite}</p>}
          </section>
          <section className="rounded-2xl border border-line p-4">
            <h2 className="mb-1 text-sm font-bold">הערות פנימיות</h2>
            <p className="whitespace-pre-line text-sm">{c.notes || <span className="text-muted">אין הערות.</span>}</p>
            <p className="mt-2 text-xs text-muted">{c.user_id ? "מחובר/ת לחשבון — יכול/ה להזמין, לבטל ולשלוח הודעות" : "נוסף/ה ידנית"}</p>
          </section>
        </div>
        <Photos businessId={c.business_id} customerId={c.id} />
        <h2 className="mb-2 mt-6 font-bold">היסטוריית תורים</h2>
        {!appointments.length && <p className="text-sm text-muted">אין עדיין תורים.</p>}
        <ul className="flex flex-col gap-2">
          {appointments.map((a) => (
            <li key={a.id}>
              <Link to={`/biz/calendar?appt=${a.id}`} className="flex items-center gap-3 rounded-2xl border border-line p-3 hover:bg-surface">
                <span className="num w-28 text-sm">{fmtShort(a.starts_at)}</span>
                <span className="flex-1 truncate">
                  {a.service_name}
                  {a.starts_at > now && a.status === "confirmed" && <span className="ms-2 text-xs font-semibold text-brand">קרוב</span>}
                </span>
                <StatusPill status={a.status} />
              </Link>
            </li>
          ))}
        </ul>
      </Body>
      <CustomerForm open={edit} onClose={() => setEdit(false)} onSaved={() => void d.reload()} initial={c} />
    </>
  );
}

function topService(names: string[]) {
  const n = new Map<string, number>();
  for (const x of names) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Birthday label; "soon" when it falls within the next 14 days. */
export function birthdayInfo(birthday: string | null) {
  if (!birthday) return null;
  const b = DateTime.fromISO(birthday);
  if (!b.isValid) return null;
  const today = DateTime.now().setZone(TZ).startOf("day");
  let next = b.set({ year: today.year });
  if (next < today) next = next.plus({ years: 1 });
  const days = Math.round(next.diff(today, "days").days);
  const label = days === 0 ? "יום הולדת היום! 🎂" : days <= 14 ? `יום הולדת בעוד ${days} ימים` : `יום הולדת ${b.toFormat("d/M")}`;
  return { days, soon: days <= 14, label };
}

function Photos({ businessId, customerId }: { businessId: string; customerId: string }) {
  const list = useLoad(() => backend.customerPhotos(customerId), [customerId]);
  const [kind, setKind] = useState<CustomerPhoto["kind"]>("before");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<CustomerPhoto | null>(null);
  const [del, setDel] = useState<CustomerPhoto | null>(null);
  const LABEL = { before: "לפני", after: "אחרי", other: "תמונה" };
  return (
    <section className="mt-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold">תמונות לפני ואחרי</h2>
        <div className="flex items-center gap-2">
          <Select aria-label="סוג התמונה" className="h-9 w-auto text-sm" value={kind} onChange={(e) => setKind(e.target.value as CustomerPhoto["kind"])}>
            <option value="before">לפני</option>
            <option value="after">אחרי</option>
            <option value="other">אחר</option>
          </Select>
          <label className={clsx("inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-brand px-3.5 text-sm font-semibold text-white", busy && "pointer-events-none opacity-50")}>
            <ImagePlus className="size-4" aria-hidden /> הוספה
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setBusy(true);
                if (await run(() => backend.addCustomerPhoto(businessId, customerId, f, kind, ""), "התמונה נשמרה")) await list.reload();
                setBusy(false);
              }}
            />
          </label>
        </div>
      </div>
      {list.data && !list.data.length && <p className="rounded-2xl bg-surface p-4 text-sm text-muted">צלמו לפני ואחרי הטיפול — זה עוזר לחזור על אותה תוצאה בפעם הבאה. התמונות פרטיות לעסק.</p>}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {list.data?.map((p) => (
          <li key={p.id} className="relative">
            <button type="button" onClick={() => setView(p)} className="block aspect-square w-full overflow-hidden rounded-xl bg-surface" aria-label={`${LABEL[p.kind]} · ${fmtShort(p.created_at)}`}>
              {p.url && <img src={p.url} alt="" className="size-full object-cover" loading="lazy" />}
            </button>
            <span className="pointer-events-none absolute start-1 top-1 rounded-full bg-black/60 px-2 text-[11px] font-semibold text-white">{LABEL[p.kind]}</span>
          </li>
        ))}
      </ul>
      <Sheet open={!!view} onClose={() => setView(null)} title={view ? `${LABEL[view.kind]} · ${fmtShort(view.created_at)}` : ""} wide>
        {view && (
          <div className="flex flex-col gap-3">
            <img src={view.url} alt={LABEL[view.kind]} className="max-h-[65dvh] w-full rounded-2xl object-contain" />
            <Button variant="danger" size="sm" className="self-start" onClick={() => setDel(view)}>
              <Trash2 className="size-4" aria-hidden /> מחיקה
            </Button>
          </div>
        )}
      </Sheet>
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        title="למחוק את התמונה?"
        confirmLabel="מחיקה"
        danger
        onConfirm={() =>
          void run(() => backend.removeCustomerPhoto(del!), "נמחקה").then((ok) => {
            if (ok) {
              setView(null);
              void list.reload();
            }
          })
        }
      />
    </section>
  );
}
