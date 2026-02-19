import { useEffect } from "react";

export type ToastState = { open: boolean; message: string; type?: "info" | "ok" | "warn" | "error" };

export function Toast({ state, onClose }: { state: ToastState; onClose: () => void }) {
  useEffect(() => {
    if (!state.open) return;
    const t = window.setTimeout(onClose, 4200);
    return () => window.clearTimeout(t);
  }, [state.open, onClose]);

  if (!state.open) return null;

  const tone =
    state.type === "ok"
      ? "bg-emerald-50 ring-emerald-200 text-emerald-700"
      : state.type === "warn"
      ? "bg-amber-50 ring-amber-200 text-amber-700"
      : state.type === "error"
      ? "bg-rose-50 ring-rose-200 text-rose-700"
      : "bg-sky-50 ring-sky-200 text-sky-700";

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(620px,calc(100%-2rem))] -translate-x-1/2">
      <div className={`rounded-2xl px-4 py-3 ring-1 shadow-soft ${tone}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm leading-relaxed">{state.message}</div>
          <button className="rounded-lg bg-white px-2 py-1 text-xs ring-1 ring-slate-200 hover:bg-slate-100" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
