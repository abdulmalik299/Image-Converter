import { PropsWithChildren } from "react";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-slate-900 ring-1 ring-white/10 shadow-soft flex items-center justify-center">
              <img src="/favicon.svg" className="h-7 w-7" alt="" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Image Converter</h1>
              <p className="text-sm text-slate-300">
                Convert PNG/JPG/WebP and create SVG locally • No uploads • Batch ZIP • Offline-ready
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="good">Files never upload</Badge>
            <Badge tone="info">Works offline after first load</Badge>
            <Badge tone="muted">Made for GitHub Pages</Badge>
          </div>
        </header>

        <main className="mt-6">{children}</main>

        <footer className="mt-10 border-t border-white/10 pt-6 text-xs text-slate-400 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p>Privacy-first: everything is processed in your browser.</p>
          <p>Tip: If a format doesn’t open, try Chrome/Edge (format support varies).</p>
        </footer>
      </div>
    </div>
  );
}

export function Card({ title, subtitle, right, children }: PropsWithChildren<{ title: string; subtitle?: string; right?: React.ReactNode }>) {
  return (
    <section className="rounded-2xl bg-slate-900/40 ring-1 ring-white/10 shadow-soft">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle ? <p className="text-sm text-slate-300">{subtitle}</p> : null}
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Badge({ children, tone = "muted" }: PropsWithChildren<{ tone?: "muted" | "good" | "info" | "warn" }>) {
  const cls =
    tone === "good"
      ? "bg-emerald-500/10 text-emerald-200 ring-emerald-400/20"
      : tone === "info"
      ? "bg-sky-500/10 text-sky-200 ring-sky-400/20"
      : tone === "warn"
      ? "bg-amber-500/10 text-amber-100 ring-amber-400/20"
      : "bg-white/5 text-slate-200 ring-white/10";
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ${cls}`}>{children}</span>;
}

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }
) {
  const { variant = "primary", className = "", ...rest } = props;
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-sky-500/90 hover:bg-sky-500 text-slate-950"
      : variant === "danger"
      ? "bg-rose-500/90 hover:bg-rose-500 text-slate-950"
      : "bg-white/5 hover:bg-white/10 text-slate-100 ring-1 ring-white/10";
  return <button className={`${base} ${styles} ${className}`} {...rest} />;
}

export function Field({ label, hint, children }: PropsWithChildren<{ label: string; hint?: string }>) {
  return (
    <label className="block space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-slate-200">{label}</span>
        {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-xl bg-slate-950/60 px-3 py-2 text-sm ring-1 ring-white/10",
        "placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400/60"
      ].join(" ")}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        "w-full rounded-xl bg-slate-950/60 px-3 py-2 text-sm ring-1 ring-white/10",
        "focus:outline-none focus:ring-2 focus:ring-sky-400/60"
      ].join(" ")}
    />
  );
}

export function Slider(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} type="range" className="w-full accent-sky-400" />;
}

export function Divider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-white/10" />
      {label ? <div className="text-xs text-slate-400">{label}</div> : null}
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}
