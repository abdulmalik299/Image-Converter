import { useState } from "react";

export type AccordionItem = { id: string; title: string; body: React.ReactNode };

export function Accordion({ items }: { items: AccordionItem[] }) {
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null);

  return (
    <div className="space-y-2">
      {items.map((it) => {
        const isOpen = open === it.id;
        return (
          <div key={it.id} className="rounded-2xl bg-slate-950/40 ring-1 ring-white/10 overflow-hidden">
            <button
              className="w-full px-4 py-3 text-left flex items-start justify-between gap-3 hover:bg-white/5"
              onClick={() => setOpen(isOpen ? null : it.id)}
              aria-expanded={isOpen}
            >
              <div className="font-semibold text-slate-100">{it.title}</div>
              <div className="text-xs text-slate-400 mt-1">{isOpen ? "Hide" : "Show"}</div>
            </button>
            {isOpen ? <div className="px-4 pb-4 text-sm text-slate-300 leading-relaxed">{it.body}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
