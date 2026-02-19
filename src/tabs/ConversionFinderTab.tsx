import { useMemo, useState } from "react";
import { Card, Field, Select, Badge } from "../components/ui";

type Fmt = "png" | "jpg" | "webp" | "svg" | "gif" | "bmp" | "tiff" | "avif" | "ico";

const FORMATS: { id: Fmt; label: string }[] = [
  { id: "png", label: "PNG" },
  { id: "jpg", label: "JPG" },
  { id: "webp", label: "WebP" },
  { id: "svg", label: "SVG" },
  { id: "gif", label: "GIF" },
  { id: "bmp", label: "BMP" },
  { id: "tiff", label: "TIFF" },
  { id: "avif", label: "AVIF" },
  { id: "ico", label: "ICO" },
];

type Route = { from: Fmt; to: Fmt; tab: string; why: string };

const ROUTES: Route[] = [
  { from: "png", to: "jpg", tab: "PNG ↔ JPG", why: "Use when you need JPG output and can choose a background color." },
  { from: "jpg", to: "png", tab: "PNG ↔ JPG", why: "Good for editing, but transparency can't be recovered from JPG." },
  { from: "png", to: "webp", tab: "PNG ↔ WebP", why: "Great for web performance; supports transparency." },
  { from: "webp", to: "png", tab: "PNG ↔ WebP", why: "Useful when an app doesn't support WebP." },
  { from: "jpg", to: "webp", tab: "JPG ↔ WebP", why: "Often smaller at similar quality." },
  { from: "webp", to: "jpg", tab: "JPG ↔ WebP", why: "If the target needs JPG only." },
  { from: "svg", to: "png", tab: "SVG → PNG/JPG/WebP", why: "Export crisp raster at exact size." },
  { from: "svg", to: "jpg", tab: "SVG → PNG/JPG/WebP", why: "JPG is compatibility-first; no transparency." },
  { from: "svg", to: "webp", tab: "SVG → PNG/JPG/WebP", why: "Small web-friendly output." },
  { from: "png", to: "svg", tab: "PNG/JPG/WebP → SVG", why: "Best for logos/illustrations; tracing from pixels." },
  { from: "jpg", to: "svg", tab: "PNG/JPG/WebP → SVG", why: "Photos can become huge SVGs; use presets." },
  { from: "webp", to: "svg", tab: "PNG/JPG/WebP → SVG", why: "Same as above; results depend on image simplicity." },
];

export function ConversionFinderTab() {
  const [from, setFrom] = useState<Fmt>("png");
  const [to, setTo] = useState<Fmt>("webp");
  const match = useMemo(() => ROUTES.find((r) => r.from === from && r.to === to), [from, to]);

  const fallback = useMemo(() => {
    if (from === to) return "No conversion needed.";
    if (from === "svg" || to === "svg") return "Use the SVG tabs: SVG → Raster or Raster → SVG.";
    return "Use Any Raster → Raster (depends on browser support).";
  }, [from, to]);

  return (
    <div className="space-y-5">
      <Card title="Conversion Finder" subtitle="Pick from/to and we guide you." right={<Badge tone="good">Fast</Badge>}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Convert from">
            <Select value={from} onChange={(e) => setFrom(e.target.value as Fmt)}>
              {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </Select>
          </Field>
          <Field label="Convert to">
            <Select value={to} onChange={(e) => setTo(e.target.value as Fmt)}>
              {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
            </Select>
          </Field>
        </div>

        <div className="mt-4 rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4">
          {match ? (
            <>
              <div className="text-sm text-slate-600">Use tab:</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">{match.tab}</div>
              <div className="mt-2 text-sm text-slate-600 leading-relaxed">{match.why}</div>
            </>
          ) : (
            <div className="text-sm text-slate-600 leading-relaxed">{fallback}</div>
          )}
        </div>
      </Card>
    </div>
  );
}
