import { useState } from "react";
import { useNavigate } from "react-router";
import { backend } from "../backend";
import { useSession } from "../session";
import { Body, PageHead, run } from "../ui";
import { Button, Field, Input } from "../../ui/kit";

const DEFAULT_HOURS = [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start_min: 9 * 60, end_min: 19 * 60 }));

/** Creates a business with a first service and the owner as its first professional. */
export function OnboardingScreen() {
  const navigate = useNavigate();
  const { user, setBusiness } = useSession();
  const [f, setF] = useState({ name: "", slug: "", phone: "", address: "", service: "תספורת", duration: 45, price: 150, pro: user?.name ?? "" });
  const [busy, setBusy] = useState(false);
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const submit = async () => {
    setBusy(true);
    let id = "";
    const ok = await run(async () => {
      const b = await backend.createBusiness({ name: f.name.trim(), slug: f.slug, phone: f.phone, address: f.address });
      id = b.id;
      await backend.saveService(b.id, { name: f.service, duration_min: f.duration, buffer_min: 10, price: f.price, approval: "auto", active: true });
      const cat = await backend.catalogue(b.id);
      await backend.saveProfessional(b.id, { name: f.pro || "אני", title: "בעלים", color: "#5b3df5", active: true, service_ids: cat.services.map((s) => s.id), hours: DEFAULT_HOURS, breaks: [] });
    }, "העסק נוצר");
    if (ok) {
      await useSession.getState().refresh();
      setBusiness(id);
      navigate("/biz/settings", { replace: true });
    }
    setBusy(false);
  };
  return (
    <>
      <PageHead title="פתיחת עסק" sub="שלוש דקות ואפשר להתחיל לקבל תורים. כל פרט אפשר לשנות אחר כך בהגדרות." />
      <Body className="max-w-xl">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Field label="שם העסק" htmlFor="ob-name">
            <Input id="ob-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          </Field>
          <Field label="כתובת עמוד ההזמנות" htmlFor="ob-slug" hint={`הלקוחות יזמינו בכתובת …/#/p/${f.slug || "your-studio"}`}>
            <Input id="ob-slug" dir="ltr" className="text-start" value={f.slug} placeholder="studio-nova" onChange={(e) => setF({ ...f, slug: slugify(e.target.value) })} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="טלפון העסק" htmlFor="ob-phone">
              <Input id="ob-phone" dir="ltr" className="text-start" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            </Field>
            <Field label="כתובת" htmlFor="ob-addr">
              <Input id="ob-addr" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
            </Field>
          </div>
          <fieldset className="rounded-2xl border border-line p-4">
            <legend className="px-1 text-sm font-semibold">שירות ראשון</legend>
            <div className="grid grid-cols-3 gap-3">
              <Field label="שם" htmlFor="ob-svc">
                <Input id="ob-svc" value={f.service} onChange={(e) => setF({ ...f, service: e.target.value })} />
              </Field>
              <Field label="משך (דק׳)" htmlFor="ob-dur">
                <Input id="ob-dur" type="number" min={5} step={5} value={f.duration} onChange={(e) => setF({ ...f, duration: Number(e.target.value) })} />
              </Field>
              <Field label="מחיר (₪)" htmlFor="ob-price">
                <Input id="ob-price" type="number" min={0} value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} />
              </Field>
            </div>
          </fieldset>
          <Field label="השם שלך ביומן" htmlFor="ob-pro" hint="תופיע/י כאיש/ת המקצוע הראשון/ה. שעות ברירת מחדל: א׳–ה׳ 09:00–19:00">
            <Input id="ob-pro" value={f.pro} onChange={(e) => setF({ ...f, pro: e.target.value })} />
          </Field>
          <Button type="submit" variant="brand" size="lg" loading={busy} disabled={f.name.trim().length < 2 || f.slug.length < 3}>
            יצירת העסק
          </Button>
        </form>
      </Body>
    </>
  );
}
