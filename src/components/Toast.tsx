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
      ? "bg-emerald-500/15 ring-emerald-400/30 text-emerald-100"
      : state.type === "warn"
      ? "bg-amber-500/15 ring-amber-400/30 text-amber-100"
      : state.type === "error"
      ? "bg-rose-500/15 ring-rose-400/30 text-rose-100"
      : "bg-sky-500/15 ring-sky-400/30 text-sky-100";

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[min(620px,calc(100%-2rem))] -translate-x-1/2">
      <div className={`rounded-2xl px-4 py-3 ring-1 shadow-soft ${tone}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm leading-relaxed">{state.message}</div>
          <button className="rounded-lg bg-white/10 px-2 py-1 text-xs hover:bg-white/15" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
