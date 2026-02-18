import type { TabKey } from "../tabs/tabs";
import { TABS } from "../tabs/tabs";

export function TabBar({ value, onChange }: { value: TabKey; onChange: (v: TabKey) => void }) {
  return (
    <div className="mt-6 rounded-2xl bg-slate-900/40 ring-1 ring-white/10 shadow-soft">
      <div className="flex flex-wrap gap-1 p-2">
        {TABS.map((t) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={[
                "flex-1 min-w-[13rem] text-left rounded-xl px-4 py-3 transition",
                active ? "bg-slate-950 ring-1 ring-white/10" : "hover:bg-white/5"
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold">{t.label}</div>
                {active ? (
                  <span className="text-[11px] rounded-full bg-white/10 px-2 py-0.5 text-slate-200">Active</span>
                ) : (
                  <span className="text-[11px] text-slate-400">Open</span>
                )}
              </div>
              <div className="mt-1 text-xs text-slate-400">{t.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
