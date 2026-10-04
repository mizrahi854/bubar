import clsx from "clsx";
import { Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router";

export { clsx as cx };

type Variant = "primary" | "secondary" | "ghost" | "danger" | "glass" | "inverse" | "brand" | "brand-soft";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-ink-inverse hover:opacity-90",
  secondary: "bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink hover:bg-surface",
  danger: "bg-bad-soft text-bad hover:opacity-90",
  glass: "glass-light text-[#111] hover:bg-white",
  inverse: "bg-white text-[#111] hover:bg-white/90",
  brand: "bg-brand text-brand-ink hover:opacity-90 shadow-[0_8px_20px_-8px_var(--brand)]",
  "brand-soft": "bg-brand-soft text-brand hover:opacity-90",
};
const SIZES = { sm: "h-9 px-3.5 text-sm gap-1.5", md: "h-12 px-5 text-[15px] gap-2", lg: "h-[52px] px-6 text-base gap-2" };

export function btn(variant: Variant = "primary", size: keyof typeof SIZES = "md", extra?: string) {
  return clsx(
    "inline-flex select-none items-center justify-center rounded-full font-semibold transition-[background,opacity,transform] duration-150 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({ variant = "primary", size = "md", loading, className, children, ...rest }: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof SIZES; loading?: boolean }) {
  return (
    <button type="button" className={btn(variant, size, className)} disabled={loading || rest.disabled} aria-busy={loading || undefined} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function LinkButton({ variant = "primary", size = "md", className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof SIZES }) {
  return <Link className={btn(variant, size, className)} {...rest} />;
}

export function IconButton({ label, className, children, ...rest }: ComponentProps<"button"> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={clsx("grid size-11 shrink-0 place-items-center rounded-full transition hover:bg-surface active:scale-95", className)} {...rest}>
      {children}
    </button>
  );
}

export function Chip({ active, className, ...rest }: ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={clsx(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition active:scale-[0.97]",
        active ? "border-ink bg-ink text-ink-inverse" : "border-line bg-bg text-ink hover:bg-surface",
        className,
      )}
      {...rest}
    />
  );
}

export function Card({ className, ...rest }: ComponentProps<"div">) {
  return <div className={clsx("rounded-[var(--radius-card)] border border-line bg-bg", className)} {...rest} />;
}

type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "dark" | "outline";
const TONES: Record<Tone, string> = {
  neutral: "bg-surface text-ink",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  info: "bg-info-soft text-info",
  dark: "bg-black/55 text-white backdrop-blur",
  outline: "border border-line text-muted",
};
export function Badge({ tone = "neutral", className, ...rest }: ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", TONES[tone], className)} {...rest} />;
}

export function Avatar({ src, name, size = 40, className, ring }: { src?: string | null; name: string; size?: number; className?: string; ring?: boolean }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
  return src ? (
    <img src={src} alt="" width={size} height={size} loading="lazy" className={clsx("media shrink-0 rounded-full object-cover", ring && "ring-2 ring-white", className)} style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className={clsx("grid shrink-0 place-items-center rounded-full bg-surface-2 font-semibold text-ink", ring && "ring-2 ring-white", className)} style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </span>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] bg-surface px-6 py-12 text-center">
      {icon && <div className="grid size-14 place-items-center rounded-full bg-bg text-ink">{icon}</div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {text && <p className="max-w-sm text-sm leading-relaxed text-muted">{text}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("skeleton rounded-2xl", className)} />;
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs font-medium text-bad">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const inputCls =
  "h-12 w-full rounded-2xl border border-line bg-bg px-4 text-base text-ink placeholder:text-muted/80 transition focus:border-ink focus:outline-none";

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={clsx(inputCls, props.className)} />;
}
export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={clsx(inputCls, "h-auto min-h-24 py-3 leading-relaxed", props.className)} />;
}
export function Select(props: ComponentProps<"select">) {
  const custom = /(^|\s)w-/.test(props.className ?? "");
  return <select {...props} className={clsx(custom ? inputCls.replace("w-full ", "") : inputCls, "appearance-none pe-4", props.className)} />;
}

export function Toggle({ checked, onChange, label, description, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; id: string }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 py-2">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={clsx("relative h-8 w-[52px] shrink-0 rounded-full transition", checked ? "bg-ink" : "bg-surface-2")}
      >
        <span className={clsx("absolute top-1 size-6 rounded-full bg-white shadow transition-all", checked ? "start-[24px]" : "start-1")} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex min-w-0 rounded-full bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx("flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2 text-sm font-semibold transition sm:px-3", value === o.value ? "bg-bg shadow-sm" : "text-muted hover:text-ink")}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-lg font-bold">{children}</h2>
      {action}
    </div>
  );
}

export function DemoLabel({ children = "דמו", className }: { children?: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center rounded-full border border-dashed border-muted/60 px-2 py-0.5 text-[11px] font-semibold text-muted", className)}>
      {children}
    </span>
  );
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} מתוך 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden className={i <= Math.round(value) ? "fill-ink" : "fill-surface-2"}>
          <path d="M12 2.5l2.9 6.2 6.6.6-5 4.5 1.5 6.6L12 17l-6 3.4 1.5-6.6-5-4.5 6.6-.6z" />
        </svg>
      ))}
    </span>
  );
}
