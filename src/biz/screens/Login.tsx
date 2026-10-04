import { useEffect, useState } from "react";
import { Navigate, useSearchParams } from "react-router";
import { MessageSquareText } from "lucide-react";
import { backend, isPreview } from "../backend";
import { PREVIEW_CODE } from "../backend/preview";
import { useSession, useSessionBoot } from "../session";
import { displayPhone, toE164 } from "../slots";
import { Logo, PreviewBanner } from "../ui";
import { Button, Field, Input } from "../../ui/kit";
import { useAppearance } from "../../ui/hooks";
import { Toaster } from "../../ui/overlays";

/** Sign-in with an SMS code or Google. Used by business owners, staff and customers. */
export function LoginCard({ onDone, title = "כניסה", subtitle }: { onDone?: () => void; title?: string; subtitle?: string }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const e164 = toE164(phone);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async () => {
    if (!e164) return setError("מספר טלפון לא תקין (למשל 050-1234567)");
    setBusy(true);
    setError(null);
    try {
      await backend.sendPhoneCode(e164);
      setStep("code");
      setWait(30);
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };
  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await backend.verifyPhoneCode(e164!, code.trim());
      await useSession.getState().refresh();
      onDone?.();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };
  const google = async () => {
    setBusy(true);
    try {
      await backend.signInWithGoogle();
      await useSession.getState().refresh();
      onDone?.();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-black">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {step === "phone" ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Field label="מספר טלפון" htmlFor="li-phone" hint="נשלח אליך קוד חד־פעמי ב־SMS">
            <Input id="li-phone" type="tel" inputMode="tel" dir="ltr" className="text-start" autoComplete="tel" placeholder="050-1234567" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Button type="submit" variant="brand" size="lg" loading={busy} disabled={!phone}>
            <MessageSquareText className="size-5" aria-hidden /> שליחת קוד
          </Button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <Field label={`הקוד שנשלח ל־${displayPhone(e164!)}`} htmlFor="li-code" hint={isPreview ? `בתצוגה המקדימה הקוד הוא ${PREVIEW_CODE}` : undefined}>
            <Input id="li-code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" className="text-center text-2xl tracking-[0.5em]" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
          </Field>
          <Button type="submit" variant="brand" size="lg" loading={busy} disabled={code.length < 6}>
            כניסה
          </Button>
          <div className="flex justify-between text-sm">
            <button type="button" className="font-semibold underline" onClick={() => (setStep("phone"), setCode(""))}>
              שינוי מספר
            </button>
            <button type="button" className="font-semibold underline disabled:no-underline disabled:opacity-50" disabled={wait > 0 || busy} onClick={() => void send()}>
              {wait > 0 ? `שליחה חוזרת בעוד ${wait}` : "שליחה חוזרת"}
            </button>
          </div>
        </form>
      )}
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" /> או <span className="h-px flex-1 bg-line" />
      </div>
      <Button variant="secondary" size="lg" onClick={() => void google()} disabled={busy}>
        <GoogleMark /> המשך עם Google
      </Button>
      {error && (
        <p role="alert" className="rounded-2xl bg-bad-soft p-3 text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

export function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}

export function BizLoginScreen() {
  useAppearance();
  useSessionBoot();
  const [sp] = useSearchParams();
  const { ready, user } = useSession();
  const next = sp.get("next");
  if (ready && user) return <Navigate to={next?.startsWith("/biz") ? next : "/biz"} replace />;
  return (
    <div className="min-h-dvh bg-gradient-to-b from-brand-soft to-bg">
      <PreviewBanner />
      <div className="mx-auto flex max-w-md flex-col gap-6 px-5 py-12">
        <div className="flex items-center gap-2 text-xl font-black">
          <Logo /> Beautigo <span className="text-brand">Pro</span>
        </div>
        <div className="rounded-[28px] bg-bg p-6 shadow-xl">
          <LoginCard title="כניסה למערכת הניהול" subtitle="יומן, לקוחות, רשימת המתנה וסנכרון ל־Google Calendar." />
        </div>
        <p className="text-center text-xs text-muted">אנשי צוות: היכנסו עם מספר הטלפון שאליו נשלחה ההזמנה.</p>
      </div>
      <Toaster />
    </div>
  );
}
