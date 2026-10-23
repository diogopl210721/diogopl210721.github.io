import { useEffect, useId, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Info, Loader2, X, XCircle } from "lucide-react";

export function cx(...v: Array<string | number | false | null | undefined>): string {
  return v.filter(Boolean).join(" ");
}

export function Card({ children, className, as: As = "section", ...rest }: {
  children: ReactNode; className?: string; as?: "section" | "div" | "article"; "aria-label"?: string; "aria-labelledby"?: string;
}) {
  return (
    <As className={cx("min-w-0 rounded-[20px] border border-ink-700 bg-ink-800 shadow-card", className)} {...rest}>
      {children}
    </As>
  );
}

export function CardHeader({ title, right, sub, id }: { title: ReactNode; right?: ReactNode; sub?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <div className="min-w-0">
        <h2 id={id} className="text-base font-bold text-white">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-mute">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
export function Button({ variant = "secondary", loading, className, children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean }) {
  const styles: Record<BtnVariant, string> = {
    primary: "bg-pos text-ink font-extrabold hover:brightness-105 disabled:bg-ink-600 disabled:text-mute",
    secondary: "border border-ink-600 bg-ink-800 text-white font-bold hover:bg-ink-750 disabled:text-mute",
    ghost: "text-sky font-bold hover:bg-ink-750 disabled:text-mute",
    danger: "border border-neg/50 bg-neg/10 text-neg font-bold hover:bg-neg/20 disabled:opacity-50",
  };
  return (
    <button
      type="button"
      className={cx("inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl px-4 text-sm transition disabled:cursor-not-allowed", styles[variant], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Badge({ children, tone = "sky", className }: { children: ReactNode; tone?: "sky" | "pos" | "neg" | "mute" | "warn"; className?: string }) {
  const t = {
    sky: "bg-sky-deep text-sky",
    pos: "bg-pos/15 text-pos",
    neg: "bg-neg/15 text-neg",
    mute: "bg-ink-700 text-mute-strong",
    warn: "bg-amber-400/15 text-amber-300",
  }[tone];
  return <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide", t, className)}>{children}</span>;
}

export function Spinner({ label = "Carregando" }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-mute">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-xl bg-ink-700/70", className)} aria-hidden="true" />;
}

export function Notice({ tone = "info", title, children, className, onClose }: {
  tone?: "info" | "ok" | "warn" | "error"; title?: ReactNode; children?: ReactNode; className?: string; onClose?: () => void;
}) {
  const map = {
    info: { Icon: Info, cls: "border-sky/30 bg-sky-deep/60 text-sky", body: "text-mute-strong" },
    ok: { Icon: CheckCircle2, cls: "border-pos/30 bg-pos/10 text-pos", body: "text-mute-strong" },
    warn: { Icon: AlertTriangle, cls: "border-amber-400/30 bg-amber-400/10 text-amber-300", body: "text-mute-strong" },
    error: { Icon: XCircle, cls: "border-neg/40 bg-neg/10 text-neg", body: "text-mute-strong" },
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex gap-3 rounded-2xl border p-3.5 text-sm", map.cls, className)}>
      <map.Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <div className="font-bold">{title}</div>}
        {children && <div className={cx("leading-relaxed", title && "mt-0.5", map.body)}>{children}</div>}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Fechar aviso" className="-m-2 h-11 w-11 shrink-0 rounded-xl text-mute hover:text-white">
          <X className="mx-auto h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      {icon && <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-750 text-sky">{icon}</div>}
      <div className="text-base font-bold">{title}</div>
      {children && <div className="max-w-sm text-sm leading-relaxed text-mute">{children}</div>}
      {action}
    </div>
  );
}

/** Painel modal: folha inferior no celular, caixa centralizada no computador. */
export function Sheet({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>("[data-autofocus], button, input")?.focus(), 30);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          "relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[24px] border border-ink-700 bg-ink-850 sm:rounded-[24px]",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-ink-700 px-5 py-3">
          <h2 id={titleId} className="min-w-0 truncate text-base font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="-mr-2 flex h-11 w-11 items-center justify-center rounded-xl text-mute hover:bg-ink-750 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-mute-strong">{label}</label>
      {children}
      {error ? <p className="text-xs font-semibold text-neg" role="alert">{error}</p> : hint ? <p className="text-xs leading-relaxed text-mute">{hint}</p> : null}
    </div>
  );
}

export const inputCls =
  "h-12 w-full rounded-2xl border border-ink-500 bg-ink-850 px-3.5 text-base text-white placeholder:text-ink-400 focus:border-sky focus:outline-none";

/** Quatro caixas de PIN, com opção de mostrar os dígitos. */
export function PinInput({ value, onChange, id, label, autoFocus, invalid, onComplete }: {
  value: string; onChange: (v: string) => void; id: string; label: string; autoFocus?: boolean; invalid?: boolean; onComplete?: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.padEnd(4, " ").slice(0, 4).split("");
  const set = (i: number, d: string) => {
    const arr = value.split("");
    arr[i] = d;
    const next = arr.join("").replace(/\s/g, "").slice(0, 4);
    onChange(next);
    if (d && i < 3) refs.current[i + 1]?.focus();
    if (next.length === 4) onComplete?.(next);
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label htmlFor={`${id}-0`} className="text-[13px] font-semibold text-mute-strong">{label}</label>
        <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show}
          className="-mr-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-2 text-[13px] font-semibold text-sky">
          {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          {show ? "Ocultar" : "Mostrar"}
        </button>
      </div>
      <div className="grid grid-cols-4 gap-3" role="group" aria-label={label}>
        {[0, 1, 2, 3].map((i) => (
          <input
            key={i}
            id={`${id}-${i}`}
            ref={(el) => (refs.current[i] = el)}
            type={show ? "text" : "password"}
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            maxLength={1}
            aria-label={`Dígito ${i + 1} do PIN`}
            aria-invalid={invalid || undefined}
            autoFocus={autoFocus && i === 0}
            value={digits[i] === " " ? "" : digits[i]}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, "");
              if (d.length > 1) {
                const pasted = d.slice(0, 4);
                onChange(pasted);
                refs.current[Math.min(pasted.length, 3)]?.focus();
                if (pasted.length === 4) onComplete?.(pasted);
                return;
              }
              set(i, d);
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !digits[i].trim() && i > 0) {
                refs.current[i - 1]?.focus();
                set(i - 1, "");
                e.preventDefault();
              }
            }}
            className={cx(
              "h-[60px] w-full rounded-2xl border bg-ink-850 text-center text-2xl font-bold text-white focus:outline-none",
              invalid ? "border-neg" : digits[i].trim() ? "border-pos" : "border-ink-500 focus:border-sky",
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label, size = "md", wrap }: {
  value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string; size?: "sm" | "md"; wrap?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className={cx("flex max-w-full gap-2", wrap ? "flex-wrap" : "overflow-x-auto no-scrollbar")}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "shrink-0 whitespace-nowrap rounded-full border px-4 font-semibold transition",
            size === "sm" ? "min-h-[40px] text-[13px]" : "min-h-[44px] text-sm",
            o.value === value ? "border-white bg-white text-ink" : "border-ink-600 text-mute-strong hover:border-ink-400",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function KeyValue({ k, v, vClass, sub }: { k: ReactNode; v: ReactNode; vClass?: string; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-mute-strong">{k}</span>
        <span className={cx("text-right font-bold tabular-nums", vClass)}>{v}</span>
      </div>
      {sub && <span className="text-xs text-mute">{sub}</span>}
    </div>
  );
}

export function Divider() {
  return <div className="h-px bg-ink-600" />;
}
