import { useState } from "react";
import { Link } from "react-router";
import { BellRing, CalendarPlus, Clock3, Phone } from "lucide-react";
import clsx from "clsx";
import { DateTime } from "luxon";
import { backend, type CustomerRow, type PartOfDay, type WaitlistEntry } from "../backend";
import { useMembership } from "../session";
import { displayPhone } from "../slots";
import { Body, ErrorBox, Loading, PageHead, TZ, ago, fmtShort, run, useLoad } from "../ui";
import { Button, Chip, EmptyState, Field, Input, Select, Textarea } from "../../ui/kit";
import { Sheet } from "../../ui/overlays";
import { CustomerPicker } from "./Calendar";

const PART: Record<PartOfDay, string> = { any: "כל היום", morning: "בוקר", noon: "צהריים", evening: "ערב" };
const WSTATUS: Record<WaitlistEntry["status"], { label: string; cls: string }> = {
  waiting: { label: "ממתין/ה", cls: "bg-surface text-ink" },
  notified: { label: "התפנה מקום!", cls: "bg-brand text-white" },
  booked: { label: "נקבע תור", cls: "bg-ok-soft text-ok" },
  cancelled: { label: "הוסר/ה", cls: "bg-surface text-muted line-through" },
};

export function WaitlistScreen() {
  const m = useMembership();
  const businessId = m?.business.id ?? null;
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [add, setAdd] = useState(false);
  const list = useLoad(() => backend.waitlist(businessId!), [businessId], { businessId, tables: ["waitlist"] });
  const cat = useLoad(() => backend.catalogue(businessId!), [businessId]);
  const rows = (list.data ?? []).filter((w) => filter === "all" || w.status === "waiting" || w.status === "notified").sort((a, b) => Number(b.status === "notified") - Number(a.status === "notified"));
  const name = (id: string | null, arr?: { id: string; name: string }[]) => (id ? (arr?.find((x) => x.id === id)?.name ?? "") : "");
  return (
    <>
      <PageHead
        title="רשימת המתנה"
        sub="כשתור מתבטל, מי שממתין/ה לשירות, ליום ולשעה האלה מסומן/ת כאן אוטומטית."
        actions={
          <Button variant="brand" size="sm" onClick={() => setAdd(true)}>
            <Clock3 className="size-4" aria-hidden /> הוספה לרשימה
          </Button>
        }
      />
      <Body>
        <div className="mb-4 flex gap-2">
          <Chip active={filter === "open"} onClick={() => setFilter("open")}>
            פעילים
          </Chip>
          <Chip active={filter === "all"} onClick={() => setFilter("all")}>
            הכול
          </Chip>
        </div>
        {list.error && <ErrorBox text={list.error} retry={list.reload} />}
        {list.loading && !list.data && <Loading />}
        {list.data && !rows.length && <EmptyState icon={<Clock3 className="size-6" aria-hidden />} title="אין ממתינים" text="לקוחות נכנסים לרשימה מעמוד ההזמנות כשאין שעה שמתאימה להם, או שתוסיפו אותם כאן." />}
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((w) => (
            <li key={w.id} className={clsx("rounded-[22px] border p-4", w.status === "notified" ? "border-brand bg-brand-soft/50" : "border-line")}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold">{w.customer_name}</div>
                  {w.customer_phone && (
                    <a href={`tel:${w.customer_phone}`} dir="ltr" className="inline-flex items-center gap-1 text-sm text-muted underline">
                      <Phone className="size-3.5" aria-hidden /> {displayPhone(w.customer_phone)}
                    </a>
                  )}
                </div>
                <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-bold", WSTATUS[w.status].cls)}>{WSTATUS[w.status].label}</span>
              </div>
              <p className="mt-2 text-sm">
                {name(w.service_id, cat.data?.services) || "כל שירות"}
                {w.professional_id && ` · אצל ${name(w.professional_id, cat.data?.professionals)}`}
              </p>
              <p className="num text-sm text-muted">
                {DateTime.fromISO(w.date_from).toFormat("d/M")}
                {w.date_to !== w.date_from && `–${DateTime.fromISO(w.date_to).toFormat("d/M")}`} · {PART[w.part_of_day]}
              </p>
              {w.note && <p className="mt-1 text-sm text-muted">״{w.note}״</p>}
              {w.status === "notified" && w.offered_start && (
                <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-bg p-2 text-sm font-semibold text-brand">
                  <BellRing className="size-4" aria-hidden /> התפנה מקום: {fmtShort(w.offered_start)}
                </p>
              )}
              <p className="mt-2 text-xs text-muted">נוסף/ה {ago(w.created_at)}</p>
              {(w.status === "waiting" || w.status === "notified") && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to="/biz/calendar?new=1" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand px-3.5 text-sm font-semibold text-white">
                    <CalendarPlus className="size-4" aria-hidden /> קביעת תור
                  </Link>
                  <Button size="sm" variant="secondary" onClick={() => void run(() => backend.setWaitlistStatus(w.id, "booked"), "סומן כנקבע")}>
                    סימון ״נקבע״
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void run(() => backend.setWaitlistStatus(w.id, "cancelled"), "הוסר/ה מהרשימה")}>
                    הסרה
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-xs text-muted">ההתראה מופיעה במערכת ובפיד הפעילות. שליחת SMS אוטומטית ללקוח/ה אינה מחוברת עדיין — אפשר להתקשר ישירות מהכרטיס.</p>
      </Body>
      {cat.data && <AddSheet open={add} onClose={() => setAdd(false)} services={cat.data.services} pros={cat.data.professionals} />}
    </>
  );
}

function AddSheet({ open, onClose, services, pros }: { open: boolean; onClose: () => void; services: { id: string; name: string }[]; pros: { id: string; name: string }[] }) {
  const m = useMembership();
  const today = DateTime.now().setZone(TZ).toISODate()!;
  const [c, setC] = useState<CustomerRow | null>(null);
  const [f, setF] = useState({ service: "", pro: "", from: today, to: DateTime.now().setZone(TZ).plus({ days: 7 }).toISODate()!, part: "any" as PartOfDay, note: "" });
  return (
    <Sheet open={open} onClose={onClose} title="הוספה לרשימת ההמתנה" wide>
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!c) return;
          if (await run(() => backend.addWaitlist({ businessId: m!.business.id, customerId: c.id, serviceId: f.service || null, professionalId: f.pro || null, dateFrom: f.from, dateTo: f.to, part: f.part, note: f.note }), "נוסף/ה לרשימה")) {
            setC(null);
            onClose();
          }
        }}
      >
        <CustomerPicker businessId={m!.business.id} value={c} onChange={setC} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="שירות" htmlFor="wl-svc">
            <Select id="wl-svc" value={f.service} onChange={(e) => setF({ ...f, service: e.target.value })}>
              <option value="">כל שירות</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="איש צוות" htmlFor="wl-pro">
            <Select id="wl-pro" value={f.pro} onChange={(e) => setF({ ...f, pro: e.target.value })}>
              <option value="">לא משנה</option>
              {pros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="מתאריך" htmlFor="wl-from">
            <Input id="wl-from" type="date" min={today} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
          </Field>
          <Field label="עד תאריך" htmlFor="wl-to">
            <Input id="wl-to" type="date" min={f.from} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
          </Field>
        </div>
        <Field label="חלק ביום" htmlFor="wl-part">
          <Select id="wl-part" value={f.part} onChange={(e) => setF({ ...f, part: e.target.value as PartOfDay })}>
            {Object.entries(PART).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="הערה" htmlFor="wl-note">
          <Textarea id="wl-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} />
        </Field>
        <Button type="submit" variant="brand" size="lg" disabled={!c || f.to < f.from}>
          הוספה
        </Button>
      </form>
    </Sheet>
  );
}
