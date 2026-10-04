import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { BarChart3, Bell, CalendarDays, ChevronDown, Clock3, Compass, LayoutList, LogOut, Menu, MessageCircle, Settings, Sparkles, Users } from "lucide-react";
import clsx from "clsx";
import { DateTime } from "luxon";
import { backend, isPreview, type ChangeEvent } from "./backend";
import { useMembership, useSession, useSessionBoot } from "./session";
import { useAppearance } from "../ui/hooks";
import { Sheet, Toaster } from "../ui/overlays";
import { useUnreadCount } from "./screens/Messages";
import { toast } from "../store/app";

export const TZ = "Asia/Jerusalem";
export const local = (iso: string) => DateTime.fromISO(iso).setZone(TZ).setLocale("he");
export const fmtTime = (iso: string) => local(iso).toFormat("HH:mm");
export const fmtDay = (iso: string) => local(iso).toFormat("cccc d בLLLL");
export const fmtShort = (iso: string) => local(iso).toFormat("ccc d/M · HH:mm");
export const ago = (iso: string) => {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "עכשיו";
  return local(iso).toRelative({ locale: "he" }) ?? "";
};
export const ils = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);

export const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "ממתין לאישור", cls: "bg-warn-soft text-warn" },
  confirmed: { label: "מאושר", cls: "bg-brand-soft text-brand" },
  completed: { label: "הושלם", cls: "bg-ok-soft text-ok" },
  cancelled: { label: "בוטל", cls: "bg-surface text-muted line-through" },
  no_show: { label: "לא הגיע/ה", cls: "bg-bad-soft text-bad" },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.confirmed;
  return <span className={clsx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", s.cls)}>{s.label}</span>;
}

/** Loads data and reloads it on demand or when the given live tables change. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[], live?: { businessId: string | null; tables: ChangeEvent["table"][] }) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Which parameters the current data belongs to: stale results are never shown as current
  const key = JSON.stringify(deps);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const keyRef = useRef(key);
  keyRef.current = key;
  const reload = useCallback(async () => {
    const k = keyRef.current;
    setLoading(true);
    try {
      const v = await fnRef.current();
      if (k !== keyRef.current) return; // parameters changed meanwhile
      setData(v);
      setLoadedKey(k);
      setError(null);
    } catch (e) {
      if (k === keyRef.current) setError((e as Error).message);
    } finally {
      if (k === keyRef.current) setLoading(false);
    }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void reload(), deps);
  const tables = live?.tables.join(",");
  useEffect(() => {
    if (!live?.businessId) return;
    const want = new Set(tables?.split(","));
    return backend.subscribe(live.businessId, (e) => want.has(e.table) && void reload());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.businessId, tables, reload]);
  const fresh = loadedKey === key;
  return { data: fresh ? data : null, stale: fresh ? null : data, error, loading: loading || !fresh, reload, setData };
}

/** Runs an action, shows its error as a toast, returns success. */
export async function run(fn: () => Promise<unknown>, ok?: string) {
  try {
    await fn();
    if (ok) toast("ok", ok);
    return true;
  } catch (e) {
    toast("error", (e as Error).message || "משהו השתבש");
    return false;
  }
}

export function PreviewBanner() {
  if (!isPreview) return null;
  return (
    <div className="bg-brand-soft px-4 py-2 text-center text-xs font-medium text-brand">
      תצוגה מקדימה — הנתונים נשמרים רק בדפדפן הזה. לחיבור אמיתי ל־Supabase ראו את מדריך ההקמה.
    </div>
  );
}

type NavItem = { to: string; label: string; icon: typeof Sparkles; end?: boolean; owner?: boolean; mobile?: boolean; badge?: boolean };
const NAV: NavItem[] = [
  { to: "/biz", label: "פעילות", icon: Sparkles, end: true, mobile: true },
  { to: "/biz/calendar", label: "יומן", icon: CalendarDays, mobile: true },
  { to: "/biz/messages", label: "הודעות", icon: MessageCircle, mobile: true, badge: true },
  { to: "/biz/customers", label: "לקוחות", icon: Users, owner: true, mobile: true },
  { to: "/biz/waitlist", label: "רשימת המתנה", icon: Clock3 },
  { to: "/biz/reports", label: "דוחות והכנסות", icon: BarChart3, owner: true },
  { to: "/biz/tour", label: "כל היכולות", icon: Compass },
  { to: "/biz/settings", label: "הגדרות", icon: Settings },
];

/** Signed-in management area with the purple accent. */
export function BizShell() {
  useAppearance();
  useSessionBoot();
  const { ready, user, memberships } = useSession();
  const loc = useLocation();
  if (!ready)
    return (
      <div className="grid min-h-dvh place-items-center">
        <span className="size-8 animate-spin rounded-full border-4 border-brand-soft border-t-brand" aria-label="טוען" />
      </div>
    );
  if (!user) return <Navigate to={`/biz/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (!memberships.length && loc.pathname !== "/biz/onboarding") return <Navigate to="/biz/onboarding" replace />;
  return <ShellInner />;
}

function ShellInner() {
  const m = useMembership();
  const loc = useLocation();
  const unread = useUnreadCount();
  const [more, setMore] = useState(false);
  const items = NAV.filter((n) => !n.owner || m?.role === "owner");
  const mobile = items.filter((n) => n.mobile);
  const rest = items.filter((n) => !n.mobile);
  const restActive = rest.some((n) => loc.pathname.startsWith(n.to));
  const Badge = ({ n }: { n: number }) => (n > 0 ? <span className="num grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-white">{n > 9 ? "9+" : n}</span> : null);
  return (
    <div className="min-h-dvh bg-bg lg:ps-64">
      <Header />
      <PreviewBanner />
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 flex-col border-e border-line bg-bg p-4 lg:flex">
        <Link to="/biz" className="mb-6 flex items-center gap-2 px-2 text-xl font-black">
          <Logo /> Beautigo <span className="text-brand">Pro</span>
        </Link>
        <nav aria-label="ניווט ניהול" className="flex flex-col gap-1">
          {items.map(({ to, label, icon: Icon, end, badge }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => clsx("flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium", isActive ? "bg-brand-soft font-bold text-brand" : "hover:bg-surface")}>
              <Icon className="size-5" aria-hidden /> <span className="flex-1">{label}</span> {badge && <Badge n={unread} />}
            </NavLink>
          ))}
        </nav>
        <Link to="/" className="mt-auto rounded-xl px-3 py-2 text-xs text-muted hover:bg-surface">
          ← לאפליקציית Beautigo
        </Link>
      </aside>
      <main id="main" className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-8">
        <Outlet />
      </main>
      <nav aria-label="ניווט ניהול" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto flex h-16 max-w-md">
          {mobile.map(({ to, label, icon: Icon, end, badge }) => (
            <li key={to} className="flex-1">
              <NavLink to={to} end={end} className={({ isActive }) => clsx("relative flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-medium", isActive ? "text-brand" : "text-muted")}>
                <Icon className="size-6" aria-hidden />
                {label}
                {badge && unread > 0 && <span className="absolute end-[calc(50%-20px)] top-2 size-2.5 rounded-full bg-brand ring-2 ring-bg" aria-label={`${unread} שיחות שלא נקראו`} />}
              </NavLink>
            </li>
          ))}
          <li className="flex-1">
            <button type="button" onClick={() => setMore(true)} className={clsx("flex h-16 w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium", restActive ? "text-brand" : "text-muted")}>
              <Menu className="size-6" aria-hidden />
              עוד
            </button>
          </li>
        </ul>
      </nav>
      <Sheet open={more} onClose={() => setMore(false)} title="עוד">
        <ul className="flex flex-col gap-1">
          {rest.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink to={to} onClick={() => setMore(false)} className={({ isActive }) => clsx("flex h-14 items-center gap-3 rounded-2xl px-4 font-medium", isActive ? "bg-brand-soft text-brand" : "hover:bg-surface")}>
                <Icon className="size-5" aria-hidden /> {label}
              </NavLink>
            </li>
          ))}
          <li>
            <Link to="/" onClick={() => setMore(false)} className="flex h-14 items-center gap-3 rounded-2xl px-4 text-sm text-muted hover:bg-surface">
              ← לאפליקציית Beautigo
            </Link>
          </li>
        </ul>
      </Sheet>
      <Toaster />
    </div>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx("grid size-8 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-2 text-sm font-black text-white", className)} aria-hidden>
      B
    </span>
  );
}

function Header() {
  const { memberships, setBusiness, user } = useSession();
  const m = useMembership();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 bg-[#0d0b1a] text-white">
      <div className="safe-top" />
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3">
        <Link to="/biz" className="relative grid size-10 place-items-center rounded-full hover:bg-white/10" aria-label="פעילות אחרונה">
          <Bell className="size-5" aria-hidden />
        </Link>
        <div className="relative flex-1 text-center">
          <button type="button" onClick={() => setOpen((x) => !x)} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[17px] font-black tracking-tight hover:bg-white/10" aria-expanded={open}>
            {m?.business.name ?? "Beautigo Pro"}
            {memberships.length > 1 && <ChevronDown className="size-4" aria-hidden />}
          </button>
          {open && (
            <div className="absolute inset-x-0 top-11 z-50 mx-auto w-64 rounded-2xl bg-bg p-2 text-start text-ink shadow-xl">
              {memberships.map((x) => (
                <button key={x.business.id} type="button" onClick={() => (setBusiness(x.business.id), setOpen(false))} className={clsx("block w-full rounded-xl px-3 py-2 text-start text-sm hover:bg-surface", x.business.id === m?.business.id && "font-bold text-brand")}>
                  {x.business.name} <span className="text-xs text-muted">· {x.role === "owner" ? "בעלים" : "צוות"}</span>
                </button>
              ))}
              <button type="button" onClick={() => (setOpen(false), navigate("/biz/onboarding"))} className="block w-full rounded-xl px-3 py-2 text-start text-sm hover:bg-surface">
                + עסק חדש
              </button>
              <hr className="my-1 border-line" />
              <p className="px-3 py-1 text-xs text-muted">{user?.name || user?.phone || user?.email}</p>
              <button type="button" onClick={() => void backend.signOut()} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-sm text-bad hover:bg-surface">
                <LogOut className="size-4" aria-hidden /> יציאה
              </button>
            </div>
          )}
        </div>
        <Link to="/biz/calendar?view=list" className="grid size-10 place-items-center rounded-full hover:bg-white/10" aria-label="רשימת תורים">
          <LayoutList className="size-5" aria-hidden />
        </Link>
      </div>
    </header>
  );
}

export function PageHead({ title, sub, actions }: { title: string; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-3 px-4 pb-3 pt-5 lg:px-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Body({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("mx-auto max-w-6xl px-4 lg:px-6", className)}>{children}</div>;
}

export function Loading() {
  return (
    <div className="flex flex-col gap-2 py-4" aria-label="טוען">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-16 rounded-2xl" />
      ))}
    </div>
  );
}

export function ErrorBox({ text, retry }: { text: string; retry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl bg-bad-soft p-4 text-sm text-bad">
      {text}
      {retry && (
        <button type="button" onClick={retry} className="ms-2 font-semibold underline">
          נסו שוב
        </button>
      )}
    </div>
  );
}
