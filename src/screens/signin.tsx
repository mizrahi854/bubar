import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, ChevronRight, KeyRound, MapPin, Phone, UserRound } from "lucide-react";
import clsx from "clsx";
import type { CategoryId } from "../domain/types";
import { CATEGORIES } from "../domain/format";
import { registerCustomer, signInAs } from "../store/actions";
import { useApp } from "../store/app";
import { Avatar } from "../ui/kit";

/**
 * Sign-in: phone + SMS code, as in Beautigo Pro. This is a local demo session, not production
 * authentication: no SMS is sent and the code is always 123456.
 */
const DEMO_CODE = "123456";
const BACKDROP = "reels/Dd4RGV-K2ht.jpg";

const normPhone = (p: string) => p.replace(/\D/g, "");
const validPhone = (p: string) => /^0\d{8,9}$/.test(normPhone(p));

export function SignInScreen() {
  const [sp] = useSearchParams();
  const next = sp.get("next");
  const navigate = useNavigate();
  const db = useApp((s) => s.db);
  const draft = useApp((s) => s.bookingDraft);
  const [mode, setMode] = useState<"login" | "register" | "accounts">(sp.get("mode") === "register" ? "register" : "login");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [form, setForm] = useState({ name: "", cityId: "tlv" });
  const [interests, setInterests] = useState<CategoryId[]>([]);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const customers = db.users.filter((u) => u.role === "customer" && u.status === "active").slice(0, 4);
  const go = () => navigate(next && next.startsWith("/") ? next : "/", { replace: true });

  useEffect(() => setError(null), [mode]);

  const sendCode = () => {
    if (!validPhone(phone)) return setError("מספר טלפון ישראלי לא תקין (למשל 050-1234567)");
    setError(null);
    setCodeSent(true);
    requestAnimationFrame(() => codeRef.current?.focus());
  };

  const submit = () => {
    if (!codeSent) return sendCode();
    if (code !== DEMO_CODE) return setError("הקוד לא נכון. בדמו הקוד הוא 123456.");
    if (mode === "login") {
      const user = db.users.find((u) => u.phone && normPhone(u.phone) === normPhone(phone) && u.status === "active");
      if (!user) return setError("לא מצאנו חשבון עם המספר הזה. אפשר להירשם בחצי דקה.");
      signInAs(user.id);
      return go();
    }
    if (form.name.trim().length < 2) return setError("נא להזין שם מלא");
    const u = registerCustomer({ name: form.name, phone, cityId: form.cityId, interests });
    if (u) {
      signInAs(u.id);
      go();
    }
  };

  const title = mode === "login" ? "התחברות" : mode === "register" ? "הרשמה" : "חשבון לדוגמה";

  return (
    <div className="auth">
      <div className="auth-backdrop" aria-hidden>
        <img src={BACKDROP} alt="" />
      </div>

      <div className="auth-stack">
        <section className="auth-card" aria-labelledby="auth-title">
          <header className="auth-top">
            <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))} className="auth-wordmark" aria-label="חזרה">
              <ChevronRight className="size-5" aria-hidden />
              <span dir="ltr">Beautigo_</span>
            </button>
            <button type="button" className="auth-switch" onClick={() => setMode(mode === "register" ? "login" : "register")}>
              {mode === "register" ? "התחברות" : "הרשמה"}
            </button>
          </header>

          <div className="auth-title-row">
            <h1 id="auth-title" className="auth-title">
              {title}
            </h1>
            {mode !== "accounts" && (
              <button type="button" className="auth-pill" onClick={() => setMode("accounts")}>
                <UserRound className="size-4" aria-hidden /> חשבון לדוגמה
              </button>
            )}
          </div>

          {draft && next?.startsWith("/book") && <p className="auth-note">ההזמנה שלך שמורה. אחרי הכניסה נחזור בדיוק לאותו שלב.</p>}

          {mode === "accounts" ? (
            <div className="flex flex-col gap-2.5">
              {customers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    signInAs(u.id);
                    go();
                  }}
                  className="auth-field auth-account"
                >
                  <span className="auth-icon p-0">
                    <Avatar name={u.name} size={46} className="!bg-white" />
                  </span>
                  <span className="min-w-0 flex-1 text-start">
                    <span className="block truncate text-[17px] font-medium">{u.name}</span>
                    <span className="block truncate text-[13px] text-[#63636b]">{db.cities.find((c) => c.id === u.cityId)?.name}</span>
                  </span>
                  <ArrowLeft className="me-4 size-5 text-[#63636b]" aria-hidden />
                </button>
              ))}
              <button type="button" className="auth-link mt-2" onClick={() => setMode("login")}>
                חזרה לכניסה עם טלפון
              </button>
            </div>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              noValidate
            >
              {mode === "register" && (
                <label className="auth-field">
                  <span className="auth-icon">
                    <UserRound className="size-5" aria-hidden />
                  </span>
                  <span className="sr-only">שם מלא</span>
                  <input className="auth-input" placeholder="שם מלא" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
              )}

              <label className="auth-field">
                <span className="auth-icon">
                  <Phone className="size-5" aria-hidden />
                </span>
                <span className="sr-only">מספר טלפון</span>
                <input
                  className="auth-input"
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  placeholder="מספר טלפון"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setCodeSent(false);
                    setCode("");
                  }}
                />
              </label>

              <label className={clsx("auth-field", !codeSent && "is-idle")}>
                <span className="auth-icon">
                  <KeyRound className="size-5" aria-hidden />
                </span>
                <span className="sr-only">קוד אימות</span>
                <input
                  ref={codeRef}
                  className="auth-input"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  dir="ltr"
                  maxLength={6}
                  placeholder="קוד מה־SMS"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
                <button type="button" className="auth-chip" onClick={sendCode}>
                  {codeSent ? "שליחה שוב" : "שלחו לי קוד"}
                </button>
              </label>

              {mode === "register" && (
                <>
                  <label className="auth-field">
                    <span className="auth-icon">
                      <MapPin className="size-5" aria-hidden />
                    </span>
                    <span className="sr-only">עיר</span>
                    <select className="auth-input appearance-none" value={form.cityId} onChange={(e) => setForm({ ...form, cityId: e.target.value })}>
                      {db.cities.filter((c) => c.active).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset className="mt-1">
                    <legend className="mb-2 text-[13px] font-medium text-[#3a3a40]">מה מעניין אותך? הפיד ייבנה לפי זה</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {CATEGORIES.map((c) => {
                        const on = interests.includes(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => setInterests((x) => (on ? x.filter((y) => y !== c.id) : [...x, c.id]))}
                            className={clsx("auth-tag", on && "is-on")}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                </>
              )}

              {error && (
                <p role="alert" className="auth-error">
                  {error}
                  {mode === "login" && error.startsWith("לא מצאנו") && (
                    <button type="button" className="ms-1 font-bold underline" onClick={() => setMode("register")}>
                      להרשמה
                    </button>
                  )}
                </p>
              )}

              <div className="auth-submit-row">
                <p className="auth-fine">
                  {codeSent ? "שלחנו קוד בן 6 ספרות. בדמו לא נשלח SMS, והקוד הוא 123456." : "בלי סיסמאות. נכנסים עם מספר הטלפון וקוד חד־פעמי ב־SMS."}
                </p>
                <button type="submit" className="auth-go" aria-label={codeSent ? (mode === "login" ? "כניסה" : "יצירת חשבון") : "שליחת קוד"}>
                  <span className="auth-go-knob">
                    <ArrowLeft className="size-5" aria-hidden />
                  </span>
                </button>
              </div>

              <p className="auth-link">
                בעלי עסק? <Link to="/biz/login">כניסה ל־Beautigo Pro</Link>
              </p>
            </form>
          )}
        </section>

        <Link to="/" className="auth-dark">
          <span className="auth-dark-title">השראה</span>
          <span className="auth-dark-sub">35 ריסלים מהעסקים ברשת</span>
          <span className="auth-dark-cta">
            לגלות בלי להתחבר <ArrowLeft className="size-5" aria-hidden />
          </span>
        </Link>
      </div>
    </div>
  );
}
