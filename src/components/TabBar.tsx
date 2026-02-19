import type { TabKey } from "../tabs/tabs";
import { TABS } from "../tabs/tabs";

export function TabBar({ value, onChange }: { value: TabKey; onChange: (v: TabKey) => void }) {
  return (
    <div className="mt-6 rounded-3xl border border-slate-200/90 bg-white/90 p-2 shadow-[0_20px_42px_-32px_rgba(15,23,42,.35)] backdrop-blur">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={[
                "flex-1 min-w-[12.5rem] text-left rounded-2xl px-4 py-3 transition",
                active ? "bg-gradient-to-br from-sky-50 to-indigo-50 ring-1 ring-sky-200" : "hover:bg-slate-50"
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 font-semibold text-slate-800">{t.icon} {t.label}</div>
                {active ? (
                  <span className="text-[11px] rounded-full bg-sky-100 px-2 py-0.5 text-sky-700">Selected</span>
                ) : null}
              </div>
              <div className="mt-1 text-xs text-slate-500">{t.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
