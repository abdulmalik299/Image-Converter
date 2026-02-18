import { humanBytes } from "../lib/format";

export type PreviewItem = {
  id: string;
  file: File;
  url: string;
  note?: string;
};

export function PreviewGrid({
  items,
  onRemove,
  extraRight
}: {
  items: PreviewItem[];
  onRemove?: (id: string) => void;
  extraRight?: (id: string) => React.ReactNode;
}) {
  if (!items.length) return null;

  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <div key={it.id} className="rounded-2xl bg-slate-950/40 ring-1 ring-white/10 overflow-hidden">
          <div className="aspect-[16/10] bg-slate-950/70 flex items-center justify-center overflow-hidden">
            {it.file.type === "image/svg+xml" ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-300 p-4 text-center">
                SVG file<br/><span className="text-slate-400">(preview may vary)</span>
              </div>
            ) : (
              <img src={it.url} alt="" className="max-h-full max-w-full object-contain" />
            )}
          </div>
          <div className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{it.file.name}</div>
                <div className="text-xs text-slate-400">
                  {it.file.type || "unknown"} • {humanBytes(it.file.size)}
                </div>
                {it.note ? <div className="text-xs text-amber-200/90 mt-1">{it.note}</div> : null}
              </div>
              <div className="flex items-center gap-2">
                {extraRight ? extraRight(it.id) : null}
                {onRemove ? (
                  <button
                    className="rounded-lg bg-white/5 px-2 py-1 text-xs ring-1 ring-white/10 hover:bg-white/10"
                    onClick={() => onRemove(it.id)}
                    title="Remove"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
