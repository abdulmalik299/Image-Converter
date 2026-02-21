import { PropsWithChildren } from "react";

function HeaderGlyph() {
  return (
    <svg viewBox="0 0 64 64" className="h-9 w-9" aria-hidden="true">
      <defs>
        <linearGradient id="logoG" x1="10" y1="8" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect x="7" y="7" width="50" height="50" rx="13" fill="url(#logoG)" />
      <path d="M16 42 25 31l8 7 14-16" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="46" cy="22" r="5" fill="#bfdbfe" />
    </svg>
  );
}

function TinyIcon({ path }: { path: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {path}
    </svg>
  );
}

export function AppShell({ children, themeControl }: PropsWithChildren<{ themeControl?: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-7xl px-4 py-6 md:py-8">
        <header className="relative overflow-hidden rounded-3xl border border-sky-100/90 bg-white/90 p-6 shadow-[0_26px_55px_-36px_rgba(37,99,235,.45)] backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 dark:shadow-none">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-300 via-blue-400 to-indigo-300 dark:from-sky-500/70 dark:via-indigo-500/70 dark:to-violet-500/70" />
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shadow-sky-200/60 ring-1 ring-sky-100 flex items-center justify-center">
                <HeaderGlyph />
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Image Converter</h1>
                <p className="text-base text-slate-600 dark:text-slate-300">
                  Premium image conversion with calm design, better quality controls, and one-click results.
                </p>
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 md:items-end">
              {themeControl}
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="good"><TinyIcon path={<><path d="M4 12l5 5L20 6"/></>} /> Private on-device</Badge>
                <Badge tone="info"><TinyIcon path={<><path d="M13 2 4 14h7l-1 8 10-13h-7z"/></>} /> Fast & offline-ready</Badge>
                <Badge tone="muted"><TinyIcon path={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>} /> High fidelity output</Badge>
              </div>
            </div>
          </div>
        </header>

        <main className="mt-6">{children}</main>
      </div>
    </div>
  );
}

export function Card({ title, subtitle, right, children }: PropsWithChildren<{ title: string; subtitle?: string; right?: React.ReactNode }>) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white/90 shadow-[0_20px_40px_-34px_rgba(15,23,42,.28)] backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900/88 dark:shadow-none">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          {subtitle ? <p className="text-sm text-slate-600 dark:text-slate-300">{subtitle}</p> : null}
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
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800"
      : tone === "info"
      ? "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:ring-sky-800"
      : tone === "warn"
      ? "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800"
      : "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700";
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ${cls}`}>{children}</span>;
}

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" }) {
  const { variant = "primary", className = "", ...rest } = props;
  const base = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";
  const styles =
    variant === "primary"
      ? "bg-sky-600 hover:bg-sky-700 text-white"
      : variant === "danger"
      ? "bg-rose-600 hover:bg-rose-700 text-white"
      : "bg-slate-100 hover:bg-slate-200 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:ring-slate-700";
  return <button className={`${base} ${styles} ${className}`} {...rest} />;
}

export function Field({ label, hint, children }: PropsWithChildren<{ label: string; hint?: string }>) {
  return <label className="block space-y-1"><div className="flex items-baseline justify-between gap-3"><span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>{hint ? <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span> : null}</div>{children}</label>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={["w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100", "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-300"].join(" ")} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={["w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100", "focus:outline-none focus:ring-2 focus:ring-sky-300"].join(" ")} />;
}

export function Slider(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} type="range" className="w-full accent-sky-600" />;
}

export function Divider({ label }: { label?: string }) {
  return <div className="flex items-center gap-3 py-2"><div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />{label ? <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div> : null}<div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" /></div>;
}
