import type { ReactNode } from "react";

export type TabKey =
  | "png-jpg"
  | "png-webp"
  | "jpg-webp"
  | "any-raster"
  | "raster-svg"
  | "svg-raster"
  | "batch"
  | "finder"
  | "help"
  | "upscale"
  | "pdf-raster";

function TabIcon({ path, accent }: { path: ReactNode; accent: string }) {
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/85 ring-1 ring-slate-200 shadow-sm">
      <svg viewBox="0 0 24 24" className={`h-5 w-5 ${accent}`} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {path}
      </svg>
    </span>
  );
}

export const TABS: { key: TabKey; label: string; desc: string; icon: ReactNode }[] = [
  { key: "png-jpg", label: "PNG ↔ JPG", desc: "Simple photo/graphics conversion", icon: <TabIcon accent="text-sky-600" path={<><rect x="3" y="4" width="8" height="16" rx="2"/><rect x="13" y="4" width="8" height="16" rx="2"/><path d="M9 12h6"/></>} /> },
  { key: "png-webp", label: "PNG ↔ WebP", desc: "Smaller files for websites", icon: <TabIcon accent="text-cyan-600" path={<><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2 2.5 14 0 16"/></>} /> },
  { key: "jpg-webp", label: "JPG ↔ WebP", desc: "Photo compression with quality control", icon: <TabIcon accent="text-indigo-600" path={<><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="9" cy="11" r="2"/><path d="m13 14 2-2 3 3"/></>} /> },
  { key: "any-raster", label: "Any Raster → Raster", desc: "Convert between many common image formats", icon: <TabIcon accent="text-teal-600" path={<><path d="M5 8h14M5 16h14"/><path d="m8 5-3 3 3 3M16 13l3 3-3 3"/></>} /> },
  { key: "raster-svg", label: "Raster → SVG", desc: "Turn logos and artwork into vector files", icon: <TabIcon accent="text-violet-600" path={<><path d="M4 17 12 3l8 14H4Z"/><path d="M10 14h4"/></>} /> },
  { key: "svg-raster", label: "SVG → Raster", desc: "Export SVG at exact image sizes", icon: <TabIcon accent="text-blue-600" path={<><path d="M4 4h16v16H4z"/><path d="M8 8h8v8H8z"/></>} /> },
  { key: "batch", label: "Batch ZIP", desc: "Convert many files and download once", icon: <TabIcon accent="text-emerald-600" path={<><rect x="4" y="7" width="16" height="13" rx="2"/><path d="M9 7V4h6v3M12 11v5"/></>} /> },
  { key: "finder", label: "Conversion Finder", desc: "Tell us from/to and get the best path", icon: <TabIcon accent="text-amber-600" path={<><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M11 8v3l2 1"/></>} /> },
  { key: "upscale", label: "Adjustments", desc: "Photo editing, HSL correction, crop and collage", icon: <TabIcon accent="text-fuchsia-600" path={<><circle cx="12" cy="12" r="8"/><path d="M12 8v8M8 12h8"/></>} /> },
  { key: "pdf-raster", label: "PDF → Raster", desc: "Render PDF pages into image formats with DPI controls", icon: <TabIcon accent="text-lime-600" path={<><path d="M6 3h9l3 3v15H6z"/><path d="M15 3v3h3"/><path d="M9 13h6M9 17h4"/></>} /> },
  { key: "help", label: "Help & Tips", desc: "Friendly answers and quality suggestions", icon: <TabIcon accent="text-rose-600" path={<><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4"/><path d="M12 17h.01"/></>} /> }
];
