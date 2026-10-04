import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { CalendarPlus, Phone, Search, UserPlus } from "lucide-react";
import { backend } from "../backend";
import { useMembership } from "../session";
import { displayPhone, toE164 } from "../slots";
import { Body, ErrorBox, Loading, PageHead, StatusPill, fmtShort, ils, run, useLoad } from "../ui";
import { Avatar, Button, EmptyState, Field, Input, LinkButton, Textarea } from "../../ui/kit";
import { Sheet } from "../../ui/overlays";

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
                  <div className="truncate font-semibold">{c.full_name}</div>
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

function CustomerForm({ open, onClose, onSaved, initial }: { open: boolean; onClose: () => void; onSaved: (id: string) => void; initial?: { id: string; full_name: string; phone: string; email: string | null; notes: string } }) {
  const m = useMembership();
  const [f, setF] = useState({ full_name: "", phone: "", email: "", notes: "" });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setF(initial ? { full_name: initial.full_name, phone: displayPhone(initial.phone), email: initial.email ?? "", notes: initial.notes } : { full_name: "", phone: "", email: "", notes: "" });
      setErr(null);
    }
  }, [open, initial]);
  return (
    <Sheet open={open} onClose={onClose} title={initial ? "עריכת פרטים" : "לקוח/ה חדש/ה"}>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const phone = f.phone.trim() ? toE164(f.phone) : "";
          if (phone === null) return setErr("מספר טלפון לא תקין");
          let id = "";
          if (await run(async () => (id = (await backend.saveCustomer(m!.business.id, { id: initial?.id, full_name: f.full_name, phone, email: f.email || null, notes: f.notes })).id), "נשמר")) {
            onClose();
            onSaved(id);
          }
        }}
      >
        <Field label="שם מלא" htmlFor="cf-name">
          <Input id="cf-name" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} required />
        </Field>
        <Field label="טלפון" htmlFor="cf-phone" error={err}>
          <Input id="cf-phone" dir="ltr" className="text-start" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label="אימייל" htmlFor="cf-email">
          <Input id="cf-email" type="email" dir="ltr" className="text-start" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="הערות פנימיות" htmlFor="cf-notes" hint="רגישויות, העדפות, גוון קבוע…">
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
  const d = useLoad(() => backend.customer(id!), [id], { businessId: m?.business.id ?? null, tables: ["appointments"] });
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
            <LinkButton to="/biz/calendar?new=1" variant="brand" size="sm">
              <CalendarPlus className="size-4" aria-hidden /> תור חדש
            </LinkButton>
          </>
        }
      />
      <Body>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            ["ביקורים", done.length],
            ["סה״כ", ils(done.reduce((s, a) => s + a.price, 0))],
            ["אי־הגעות", appointments.filter((a) => a.status === "no_show").length],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-brand-soft/60 p-3">
              <dd className="num text-xl font-black text-brand">{v}</dd>
              <dt className="text-xs text-muted">{k}</dt>
            </div>
          ))}
        </dl>
        {c.notes && <p className="mt-4 rounded-2xl bg-surface p-4 text-sm">{c.notes}</p>}
        <p className="mt-2 text-xs text-muted">{c.user_id ? "מחובר/ת לחשבון — יכול/ה להזמין ולבטל אונליין" : "נוסף/ה ידנית"}</p>
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
