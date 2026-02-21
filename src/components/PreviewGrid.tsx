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
        <div key={it.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/80">
          <div className="aspect-[16/10] bg-slate-50 flex items-center justify-center overflow-hidden dark:bg-slate-800/70">
            {it.file.type === "image/svg+xml" ? (
              <div className="w-full h-full flex items-center justify-center text-xs text-slate-600 p-4 text-center dark:text-slate-200">
                SVG file<br/><span className="text-slate-500 dark:text-slate-400">(preview may vary)</span>
              </div>
            ) : (
              <img src={it.url} alt="" className="max-h-full max-w-full object-contain" />
            )}
          </div>
          <div className="p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{it.file.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {it.file.type || "unknown"} • {humanBytes(it.file.size)}
                </div>
                {it.note ? <div className="text-xs text-amber-600 mt-1">{it.note}</div> : null}
              </div>
              <div className="flex items-center gap-2">
                {extraRight ? extraRight(it.id) : null}
                {onRemove ? (
                  <button
                    className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-700"
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
