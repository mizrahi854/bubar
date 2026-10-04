import { NavLink, Outlet, useLocation, useNavigate, Link } from "react-router";
import type { ReactNode } from "react";
import { Bell, Bookmark, CalendarDays, ChevronRight, Compass, Home, LayoutGrid, MessageCircle, Plus, ShieldCheck, UserRound } from "lucide-react";
import clsx from "clsx";
import { useApp, useMe, useMode } from "../store/app";
import type { DB, User } from "../domain/types";
import { Toaster } from "./overlays";
import { useAppearance } from "./hooks";
import { WelcomeSheet } from "../screens/demo";
import { AuthPromptSheet } from "../screens/social-sheets";

type NavItem = { to: string; label: string; icon: typeof Home; create?: boolean; end?: boolean };

export function navFor(mode: ReturnType<typeof useMode>): NavItem[] {
  if (mode === "business")
    return [
      { to: "/", label: "בית", icon: Home, end: true },
      { to: "/discover", label: "גילוי", icon: Compass },
      { to: "/create", label: "יצירה", icon: Plus, create: true },
      { to: "/manage", label: "ניהול", icon: LayoutGrid },
      { to: "/profile", label: "פרופיל", icon: UserRound },
    ];
  if (mode === "staff")
    return [
      { to: "/", label: "בית", icon: Home, end: true },
      { to: "/discover", label: "גילוי", icon: Compass },
      { to: "/manage", label: "היומן שלי", icon: CalendarDays },
      { to: "/profile", label: "פרופיל", icon: UserRound },
    ];
  if (mode === "admin")
    return [
      { to: "/", label: "בית", icon: Home, end: true },
      { to: "/discover", label: "גילוי", icon: Compass },
      { to: "/admin", label: "ניהול מערכת", icon: ShieldCheck },
      { to: "/profile", label: "פרופיל", icon: UserRound },
    ];
  return [
    { to: "/", label: "בית", icon: Home, end: true },
    { to: "/discover", label: "גילוי", icon: Compass },
    { to: "/saved", label: "שמורים", icon: Bookmark },
    { to: "/appointments", label: "תורים", icon: CalendarDays },
    { to: "/profile", label: "פרופיל", icon: UserRound },
  ];
}

export function unreadMessages(db: DB, me: User | null) {
  if (!me) return 0;
  return db.conversations.filter((c) => {
    const mine = c.customerId === me.id || (me.role === "business" && c.businessId === me.businessId);
    if (!mine) return false;
    const last = c.messages.at(-1);
    return !!last && last.senderId !== me.id && (!c.lastReadAt[me.id] || c.lastReadAt[me.id] < last.createdAt);
  }).length;
}

export function unreadNotifications(db: DB, me: User | null, enabled: Record<string, boolean>) {
  if (!me) return 0;
  return db.notifications.filter((n) => n.userId === me.id && !n.read && enabled[n.category] !== false).length;
}

export function AppShell() {
  useAppearance();
  const mode = useMode();
  const loc = useLocation();
  const isFeed = loc.pathname === "/" || loc.pathname.startsWith("/reel/");
  const bare = loc.pathname === "/signin";
  const items = navFor(mode);
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-ink-inverse">
        דילוג לתוכן
      </a>
      <SideNav items={items} />
      <main id="main" className={clsx("min-h-dvh lg:ps-72", !isFeed && !bare && "pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-0")}>
        <Outlet />
      </main>
      {!bare && <BottomNav items={items} dark={isFeed} />}
      <Toaster />
      <WelcomeSheet />
      <AuthPromptSheet />
    </>
  );
}

function BottomNav({ items, dark }: { items: NavItem[]; dark: boolean }) {
  return (
    <nav aria-label="ניווט ראשי" className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] lg:hidden">
      <ul className={clsx("mx-auto flex h-[68px] max-w-md items-center justify-around rounded-[26px] px-1", dark ? "glass-dark border border-white/10" : "glass")}>
        {items.map(({ to, label, icon: Icon, create, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              aria-label={label}
              className={({ isActive }) =>
                clsx(
                  "mx-auto flex h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-medium transition",
                  create ? "" : isActive ? (dark ? "text-white" : "text-ink") : dark ? "text-white/65" : "text-muted",
                )
              }
            >
              {({ isActive }) =>
                create ? (
                  <span className={clsx("grid size-11 place-items-center rounded-full", dark ? "bg-white text-[#111]" : "bg-ink text-ink-inverse")}>
                    <Icon className="size-6" aria-hidden />
                  </span>
                ) : (
                  <>
                    <Icon className={clsx("size-6", isActive && "stroke-[2.3]")} aria-hidden />
                    <span>{label}</span>
                  </>
                )
              }
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SideNav({ items }: { items: NavItem[] }) {
  const me = useMe();
  const db = useApp((s) => s.db);
  const notify = useApp((s) => s.settings.notify);
  const msgs = unreadMessages(db, me);
  const notes = unreadNotifications(db, me, notify);
  return (
    <aside className="fixed inset-y-0 start-0 z-40 hidden w-72 flex-col border-e border-line bg-bg px-4 py-6 lg:flex">
      <Link to="/" className="mb-8 px-3 text-2xl font-black tracking-tight" aria-label="Beautigo — דף הבית">
        Beautigo
      </Link>
      <nav aria-label="ניווט ראשי" className="flex flex-col gap-1">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => clsx("flex h-12 items-center gap-3 rounded-2xl px-3 text-[15px] font-medium transition", isActive ? "bg-surface font-bold" : "text-ink hover:bg-surface")}>
            <Icon className="size-[22px]" aria-hidden />
            {label}
          </NavLink>
        ))}
        {me && (
          <>
            <NavLink to="/messages" className={({ isActive }) => clsx("flex h-12 items-center gap-3 rounded-2xl px-3 text-[15px] font-medium", isActive ? "bg-surface font-bold" : "hover:bg-surface")}>
              <MessageCircle className="size-[22px]" aria-hidden /> הודעות {msgs > 0 && <Count n={msgs} />}
            </NavLink>
            <NavLink to="/notifications" className={({ isActive }) => clsx("flex h-12 items-center gap-3 rounded-2xl px-3 text-[15px] font-medium", isActive ? "bg-surface font-bold" : "hover:bg-surface")}>
              <Bell className="size-[22px]" aria-hidden /> התראות {notes > 0 && <Count n={notes} />}
            </NavLink>
          </>
        )}
      </nav>
      <div className="mt-auto flex flex-col gap-2">
        {!me && (
          <Link to="/signin" className="flex h-12 items-center justify-center rounded-full bg-ink font-semibold text-ink-inverse">
            התחברות / הרשמה
          </Link>
        )}
        <Link to="/demo" className="flex h-10 items-center justify-center rounded-full border border-dashed border-line text-xs font-semibold text-muted hover:bg-surface">
          מצב דמו · החלפת תפקיד
        </Link>
      </div>
    </aside>
  );
}

function Count({ n }: { n: number }) {
  return <span className="ms-auto grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1.5 text-[11px] font-bold text-ink-inverse">{n > 9 ? "9+" : n}</span>;
}

/** Page header with back navigation and header shortcuts (messages, notifications). */
export function TopBar({ title, back, actions, sub, large }: { title: ReactNode; back?: boolean | string; actions?: ReactNode; sub?: ReactNode; large?: boolean }) {
  const navigate = useNavigate();
  const me = useMe();
  const db = useApp((s) => s.db);
  const notify = useApp((s) => s.settings.notify);
  const msgs = unreadMessages(db, me);
  const notes = unreadNotifications(db, me, notify);
  return (
    <header className="glass sticky top-0 z-30 border-x-0 border-t-0 !shadow-none">
      <div className="safe-top" />
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-3 lg:px-6">
        {back && (
          <button
            type="button"
            onClick={() => (typeof back === "string" ? navigate(back) : window.history.length > 1 ? navigate(-1) : navigate("/"))}
            className="grid size-11 place-items-center rounded-full hover:bg-surface"
            aria-label="חזרה"
          >
            <ChevronRight className="size-6" aria-hidden />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {large ? <h1 className="truncate text-2xl font-black tracking-tight">{title}</h1> : <h1 className="truncate text-[17px] font-bold">{title}</h1>}
          {sub && <div className="truncate text-xs text-muted">{sub}</div>}
        </div>
        {actions}
        {me && (
          <div className="flex items-center lg:hidden">
            <Link to="/messages" className="relative grid size-11 place-items-center rounded-full hover:bg-surface" aria-label={`הודעות${msgs ? ` (${msgs} שלא נקראו)` : ""}`}>
              <MessageCircle className="size-6" aria-hidden />
              {msgs > 0 && <Dot />}
            </Link>
            <Link to="/notifications" className="relative grid size-11 place-items-center rounded-full hover:bg-surface" aria-label={`התראות${notes ? ` (${notes} חדשות)` : ""}`}>
              <Bell className="size-6" aria-hidden />
              {notes > 0 && <Dot />}
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

function Dot() {
  return <span className="absolute end-2.5 top-2.5 size-2.5 rounded-full bg-bad ring-2 ring-bg" aria-hidden />;
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("mx-auto w-full max-w-5xl px-4 py-4 lg:px-6 lg:py-6", className)}>{children}</div>;
}
