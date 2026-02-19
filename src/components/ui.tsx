import { PropsWithChildren } from "react";

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-10">
        <header className="relative overflow-hidden rounded-3xl border border-sky-100/90 bg-white/85 p-6 shadow-[0_20px_45px_-30px_rgba(2,132,199,.45)] backdrop-blur">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-300 via-blue-400 to-indigo-300" />
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shadow-sky-200/60 ring-1 ring-sky-100 flex items-center justify-center">
                <img src="/logo-mark.svg" className="h-9 w-9" alt="Image Converter logo" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Image Converter</h1>
                <p className="text-sm text-slate-600">
                  Clean, private image conversion with calm design and one-click results.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="good">🔒 Private on your device</Badge>
              <Badge tone="info">⚡ Fast & offline-ready</Badge>
              <Badge tone="muted">🎨 Better SVG quality</Badge>
            </div>
          </div>
        </header>

        <main className="mt-6">{children}</main>

        <footer className="mt-10 border-t border-slate-200 pt-6 text-xs text-slate-500 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p>Everything runs in your browser. Your images are never uploaded.</p>
          <p>If a format fails, try Chrome or Edge (format support depends on browser).</p>
        </footer>
      </div>
    </div>
  );
}

export function Card({ title, subtitle, right, children }: PropsWithChildren<{ title: string; subtitle?: string; right?: React.ReactNode }>) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white/85 shadow-[0_20px_40px_-34px_rgba(15,23,42,.45)] backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="text-sm text-slate-600">{subtitle}</p> : null}
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
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : tone === "info"
      ? "bg-sky-50 text-sky-700 ring-sky-200"
      : tone === "warn"
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-slate-100 text-slate-700 ring-slate-200";
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
      ? "bg-sky-600 hover:bg-sky-700 text-white"
      : variant === "danger"
      ? "bg-rose-600 hover:bg-rose-700 text-white"
      : "bg-slate-100 hover:bg-slate-200 text-slate-700 ring-1 ring-slate-200";
  return <button className={`${base} ${styles} ${className}`} {...rest} />;
}

export function Field({ label, hint, children }: PropsWithChildren<{ label: string; hint?: string }>) {
  return (
    <label className="block space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-slate-700">{label}</span>
        {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
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
        "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700",
        "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300"
      ].join(" ")}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={[
        "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700",
        "focus:outline-none focus:ring-2 focus:ring-sky-300"
      ].join(" ")}
    />
  );
}

export function Slider(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} type="range" className="w-full accent-sky-600" />;
}

export function Divider({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-slate-200" />
      {label ? <div className="text-xs text-slate-500">{label}</div> : null}
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
