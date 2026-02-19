import type { TabKey } from "../tabs/tabs";
import { TABS } from "../tabs/tabs";

export function TabBar({ value, onChange }: { value: TabKey; onChange: (v: TabKey) => void }) {
  return (
    <div className="mt-6 rounded-3xl border border-slate-200 bg-white/80 p-2 shadow-[0_16px_32px_-28px_rgba(30,41,59,.45)]">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={[
                "flex-1 min-w-[12.5rem] text-left rounded-2xl px-4 py-3 transition",
                active ? "bg-sky-50 ring-1 ring-sky-200" : "hover:bg-slate-50"
              ].join(" ")}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-slate-800">{t.icon} {t.label}</div>
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
