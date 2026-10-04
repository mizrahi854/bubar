import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeftRight, Bell, Bookmark, Briefcase, CalendarDays, ChevronLeft, FlaskConical, LogIn, LogOut, MessageCircle, Settings, ShieldCheck, Store } from "lucide-react";
import type { CategoryId } from "../domain/types";
import { CATEGORIES } from "../domain/format";
import { signInAs, updateProfile } from "../store/actions";
import { toast, useApp, useMe, useMode } from "../store/app";
import { Avatar, Badge, Button, Chip, DemoLabel, EmptyState, Field, Input, LinkButton, Select } from "../ui/kit";
import { Sheet } from "../ui/overlays";
import { Page, TopBar } from "../ui/shell";

export function ProfileScreen() {
  const db = useApp((s) => s.db);
  const me = useMe();
  const mode = useMode();
  const navigate = useNavigate();
  const [edit, setEdit] = useState(false);

  if (!me)
    return (
      <>
        <TopBar title="פרופיל" large />
        <Page className="max-w-xl">
          <EmptyState icon={<LogIn className="size-6" aria-hidden />} title="עוד לא התחברת" text="אפשר לגלוש בלי חשבון. כדי לשמור, לעקוב ולקבוע תורים — התחברו." action={<LinkButton to="/signin?next=/profile">התחברות או הרשמה</LinkButton>} />
          <Menu items={[{ to: "/settings", label: "הגדרות ונגישות", icon: Settings }, { to: "/biz", label: "Beautigo Pro · מערכת ניהול לעסק", icon: Briefcase }, { to: "/demo", label: "מצב דמו · החלפת תפקיד", icon: FlaskConical }]} />
        </Page>
      </>
    );

  const city = db.cities.find((c) => c.id === me.cityId);
  const business = me.businessId ? db.businesses.find((b) => b.id === me.businessId) : undefined;
  const pro = me.professionalId ? db.professionals.find((p) => p.id === me.professionalId) : undefined;
  const savedCount = new Set(db.collections.filter((c) => c.userId === me.id).flatMap((c) => c.postIds)).size;
  const apptCount = db.appointments.filter((a) => a.customerId === me.id).length;
  const following = me.followingBusinesses.map((id) => db.businesses.find((b) => b.id === id)).filter((b) => !!b && b.status === "active");

  return (
    <>
      <TopBar title="פרופיל" large />
      <Page className="max-w-xl">
        <div className="flex items-center gap-4">
          <Avatar src={business && mode === "business" ? business.avatar : me.avatar} name={me.name} size={72} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-black">{me.name}</h1>
              {me.isDemo && <DemoLabel>חשבון דמו</DemoLabel>}
            </div>
            <p className="text-sm text-muted">
              {me.role === "business" ? `בעלת העסק ${business?.name}` : me.role === "staff" ? `${pro?.title} ב${business?.name}` : me.role === "admin" ? "מנהלת פלטפורמה" : city?.name ?? "לקוח/ה"}
            </p>
            {me.role === "customer" && (
              <button type="button" onClick={() => setEdit(true)} className="mt-1 text-sm font-semibold underline underline-offset-4">
                עריכת פרטים
              </button>
            )}
          </div>
        </div>

        {me.role === "business" && business && (
          <div className="mt-5 rounded-2xl border border-line p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">מצב תצוגה</div>
                <p className="text-sm text-muted">{mode === "business" ? "את/ה רואה את Beautigo כעסק." : "את/ה גולש/ת כמו לקוח/ה (בלי אפשרות להזמין)."}</p>
              </div>
              <Badge tone={mode === "business" ? "dark" : "neutral"}>{mode === "business" ? "עסק" : "לקוח"}</Badge>
            </div>
            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={() => {
                const next = mode === "business" ? "customer" : "business";
                useApp.setState({ viewMode: next });
                toast("ok", next === "customer" ? "עברת לתצוגת לקוח" : "חזרת לתצוגת עסק");
                navigate("/");
              }}
            >
              <ArrowLeftRight className="size-4" aria-hidden /> מעבר ל{mode === "business" ? "תצוגת לקוח" : "תצוגת עסק"}
            </Button>
          </div>
        )}

        {me.role === "customer" && (
          <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
            {[
              [following.length, "עוקב/ת"],
              [savedCount, "שמורים"],
              [apptCount, "תורים"],
            ].map(([n, l]) => (
              <div key={l} className="rounded-2xl bg-surface p-3">
                <dd className="num text-xl font-bold">{n}</dd>
                <dt className="text-xs text-muted">{l}</dt>
              </div>
            ))}
          </dl>
        )}

        <Menu
          items={[
            ...(me.role === "business" && business ? [{ to: `/b/${business.id}`, label: "הפרופיל הציבורי של העסק", icon: Store }, { to: "/manage", label: "ניהול העסק", icon: Briefcase }] : []),
            ...(me.role === "staff" && pro ? [{ to: `/pro/${pro.id}`, label: "הפרופיל המקצועי שלי", icon: Store }, { to: "/manage/calendar", label: "היומן שלי", icon: CalendarDays }] : []),
            ...(me.role === "admin" ? [{ to: "/admin", label: "ניהול מערכת", icon: ShieldCheck }] : []),
            ...(mode === "customer" ? [{ to: "/appointments", label: "התורים שלי", icon: CalendarDays }, { to: "/saved", label: "שמורים ואוספים", icon: Bookmark }] : []),
            { to: "/messages", label: "הודעות", icon: MessageCircle },
            { to: "/notifications", label: "התראות", icon: Bell },
            { to: "/settings", label: "הגדרות, פרטיות ונגישות", icon: Settings },
            { to: "/biz", label: "Beautigo Pro · מערכת ניהול לעסק", icon: Briefcase },
            { to: "/demo", label: "מצב דמו · החלפת תפקיד", icon: FlaskConical },
          ]}
        />

        {me.role === "customer" && me.privacy.showFollowing && following.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-2 font-bold">עסקים במעקב</h2>
            <ul className="flex flex-col gap-1">
              {following.map((b) => (
                <li key={b!.id}>
                  <Link to={`/b/${b!.id}`} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-surface">
                    <Avatar src={b!.avatar} name={b!.name} size={40} />
                    <span className="font-semibold">{b!.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Button
          variant="ghost"
          className="mt-6 w-full text-bad"
          onClick={() => {
            signInAs(null);
            navigate("/");
            toast("ok", "התנתקת");
          }}
        >
          <LogOut className="size-4" aria-hidden /> יציאה
        </Button>
      </Page>
      {me.role === "customer" && <EditProfileSheet open={edit} onClose={() => setEdit(false)} />}
    </>
  );
}

function Menu({ items }: { items: { to: string; label: string; icon: typeof Settings }[] }) {
  return (
    <nav className="mt-6 overflow-hidden rounded-2xl border border-line">
      <ul className="divide-y divide-line">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to + label}>
            <Link to={to} className="flex h-14 items-center gap-3 px-4 hover:bg-surface">
              <Icon className="size-5" aria-hidden />
              <span className="flex-1 font-medium">{label}</span>
              <ChevronLeft className="size-5 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function EditProfileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useApp((s) => s.db);
  const me = useMe()!;
  const [name, setName] = useState(me.name);
  const [cityId, setCityId] = useState(me.cityId ?? "");
  const [interests, setInterests] = useState<CategoryId[]>(me.interests);
  useEffect(() => {
    if (open) {
      setName(me.name);
      setCityId(me.cityId ?? "");
      setInterests(me.interests);
    }
  }, [open, me]);
  return (
    <Sheet open={open} onClose={onClose} title="עריכת פרטים">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (updateProfile({ name, cityId: cityId || undefined, interests }) !== undefined) {
            toast("ok", "הפרטים נשמרו");
            onClose();
          }
        }}
      >
        <Field label="שם" htmlFor="ep-name">
          <Input id="ep-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="עיר" htmlFor="ep-city">
          <Select id="ep-city" value={cityId} onChange={(e) => setCityId(e.target.value)}>
            <option value="">לא צוין</option>
            {db.cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">תחומי עניין (משפיעים על ״בשבילך״)</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Chip key={c.id} active={interests.includes(c.id)} onClick={() => setInterests((x) => (x.includes(c.id) ? x.filter((y) => y !== c.id) : [...x, c.id]))}>
                {c.label}
              </Chip>
            ))}
          </div>
        </fieldset>
        <Button type="submit" size="lg">
          שמירה
        </Button>
      </form>
    </Sheet>
  );
}
