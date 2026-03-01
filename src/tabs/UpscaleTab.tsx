import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from "react";
import { Button, Field, Input, Select, Slider } from "../components/ui";
import { Toast, type ToastState } from "../components/Toast";
import type { CommonRasterSettings } from "../lib/settings";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/bmp", "image/gif", "image/avif", "image/tiff"];
const HSL_RANGES = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"] as const;
type HslRange = (typeof HSL_RANGES)[number];
type RGB = { r: number; g: number; b: number };
type CurvePoint = { x: number; y: number };
type CurveChannel = "rgb" | "r" | "g" | "b";

type EditorState = {
  basicTone: { exposure: number; brightness: number; contrast: number; highlights: number; shadows: number; whites: number; blacks: number };
  toneCurve: Record<CurveChannel, CurvePoint[]>;
  color: {
    temperature: number;
    tint: number;
    vibrance: number;
    saturation: number;
    hsl: Record<HslRange, { hue: number; sat: number; lum: number }>;
  };
  grading: {
    shadows: { hue: number; sat: number; lum: number };
    midtones: { hue: number; sat: number; lum: number };
    highlights: { hue: number; sat: number; lum: number };
  };
  detail: {
    sharpenAmount: number;
    sharpenRadius: number;
    sharpenThreshold: number;
    clarity: number;
    texture: number;
    dehaze: number;
    noiseLuma: number;
    noiseColor: number;
  };
  geometry: {
    cropX: number;
    cropY: number;
    cropW: number;
    cropH: number;
    rotate: number;
    flipH: boolean;
    flipV: boolean;
    resizeW: number;
    resizeH: number;
    perspectiveV: number;
    perspectiveH: number;
    lensDistortion: number;
    vignette: number;
    smoothingQuality: "low" | "medium" | "high";
    ratioPreset: GeometryRatioPreset;
    cropShapeMode: "rect" | "quad";
    quadTLX: number;
    quadTLY: number;
    quadTRX: number;
    quadTRY: number;
    quadBRX: number;
    quadBRY: number;
    quadBLX: number;
    quadBLY: number;
  };
  advanced: {
    gamma: number;
    channelMixer: { r: RGB; g: RGB; b: RGB };
    labMode: boolean;
    highPass: number;
    edgePreview: boolean;
  };
  export: {
    format: "png" | "jpg" | "webp" | "avif";
    quality: number;
    bitDepth: "8-bit" | "16-bit" | "32-bit" | "64-bit";
    colorSpace: "sRGB" | "Display-P3" | "Adobe RGB" | "ProPhoto RGB" | "Rec.2020" | "Linear sRGB";
    resizeOnExport: boolean;
    width: number;
    height: number;
  };
};

type LUT3D = { size: number; table: Float32Array } | null;
type SectionKey = "basicTone"|"toneCurve"|"color"|"grading"|"detail"|"geometry"|"advanced"|"export";

const SECTION_ITEMS: Array<{ key: SectionKey; label: string }> = [
  { key: "basicTone", label: "Basic Tone" },
  { key: "toneCurve", label: "Tone Curve" },
  { key: "color", label: "HSL / Color" },
  { key: "grading", label: "Color Grading" },
  { key: "detail", label: "Detail" },
  { key: "geometry", label: "Geometry / Crop" },
  { key: "advanced", label: "Advanced" },
  { key: "export", label: "Export" }
];

const BIT_DEPTH_FACTORS = { "8-bit": 1, "16-bit": 2, "32-bit": 4, "64-bit": 8 } as const;
const PREVIEW_MAX_DIMENSION = 1920;
const INTERACTIVE_PREVIEW_MAX_DIMENSION = 960;
const INTERACTIVE_PREVIEW_DELAY_MS = 10;
const FINAL_PREVIEW_DELAY_MS = 18;
const PREVIEW_TARGET_BYTES = 260 * 1024;

const GEOMETRY_RATIO_PRESETS = [
  { key: "free", label: "Custom" },
  { key: "original", label: "Original" },
  { key: "1:1", label: "1:1" },
  { key: "3:4", label: "3:4" },
  { key: "4:5", label: "4:5" },
  { key: "9:16", label: "9:16" },
  { key: "16:9", label: "16:9" }
] as const;
type GeometryRatioPreset = (typeof GEOMETRY_RATIO_PRESETS)[number]["key"];

type CropGestureMode = "move" | "nw" | "ne" | "sw" | "se" | "quadMove" | "quadTL" | "quadTR" | "quadBR" | "quadBL" | "edgeTop" | "edgeRight" | "edgeBottom" | "edgeLeft";

type QuadShape = {
  quadTLX: number;
  quadTLY: number;
  quadTRX: number;
  quadTRY: number;
  quadBRX: number;
  quadBRY: number;
  quadBLX: number;
  quadBLY: number;
};

function applyColorSpaceTransform(r: number, g: number, b: number, colorSpace: EditorState["export"]["colorSpace"]) {
  if (colorSpace === "Display-P3") return { r: clamp(r * 1.03), g: clamp(g * 1.01), b: clamp(b * 1.06) };
  if (colorSpace === "Adobe RGB") return { r: clamp(r * 1.06), g: clamp(g * 1.03), b: clamp(b * 0.97) };
  if (colorSpace === "ProPhoto RGB") return { r: clamp(r * 1.09), g: clamp(g * 1.05), b: clamp(b * 1.03) };
  if (colorSpace === "Rec.2020") return { r: clamp(r * 1.04), g: clamp(g * 1.04), b: clamp(b * 1.08) };
  if (colorSpace === "Linear sRGB") return { r: clamp(Math.pow(r / 255, 2.2) * 255), g: clamp(Math.pow(g / 255, 2.2) * 255), b: clamp(Math.pow(b / 255, 2.2) * 255) };
  return { r, g, b };
}

const defaultState: EditorState = {
  basicTone: { exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
  toneCurve: {
    rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    r: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    g: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
    b: [{ x: 0, y: 0 }, { x: 255, y: 255 }]
  },
  color: {
    temperature: 0,
    tint: 0,
    vibrance: 0,
    saturation: 0,
    hsl: Object.fromEntries(HSL_RANGES.map((k) => [k, { hue: 0, sat: 0, lum: 0 }])) as EditorState["color"]["hsl"]
  },
  grading: {
    shadows: { hue: 220, sat: 0, lum: 0 },
    midtones: { hue: 35, sat: 0, lum: 0 },
    highlights: { hue: 50, sat: 0, lum: 0 }
  },
  detail: { sharpenAmount: 0, sharpenRadius: 1, sharpenThreshold: 0, clarity: 0, texture: 0, dehaze: 0, noiseLuma: 0, noiseColor: 0 },
  geometry: {
    cropX: 0,
    cropY: 0,
    cropW: 100,
    cropH: 100,
    rotate: 0,
    flipH: false,
    flipV: false,
    resizeW: 0,
    resizeH: 0,
    perspectiveV: 0,
    perspectiveH: 0,
    lensDistortion: 0,
    vignette: 0,
    smoothingQuality: "high",
    ratioPreset: "original",
    cropShapeMode: "rect",
    quadTLX: 0,
    quadTLY: 0,
    quadTRX: 100,
    quadTRY: 0,
    quadBRX: 100,
    quadBRY: 100,
    quadBLX: 0,
    quadBLY: 100
  },
  advanced: {
    gamma: 1,
    channelMixer: { r: { r: 100, g: 0, b: 0 }, g: { r: 0, g: 100, b: 0 }, b: { r: 0, g: 0, b: 100 } },
    labMode: false,
    highPass: 0,
    edgePreview: false
  },
  export: { format: "png", quality: 92, bitDepth: "8-bit", colorSpace: "sRGB", resizeOnExport: false, width: 0, height: 0 }
};

const clamp = (v: number, min = 0, max = 255) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function useHistory<T>(initial: T) {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initial);
  const [future, setFuture] = useState<T[]>([]);

  const commit = useCallback((next: T) => {
    setPresent((current) => {
      if (Object.is(current, next)) return current;
      setPast((p) => [...p.slice(-30), current]);
      setFuture([]);
      return next;
    });
  }, []);
  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [present, ...f]);
      setPresent(prev);
      return p.slice(0, -1);
    });
  }, [present]);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const next = f[0];
      setPast((p) => [...p, present]);
      setPresent(next);
      return f.slice(1);
    });
  }, [present]);
  return { past, present, future, commit, undo, redo };
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s, l };
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return { r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255), g: Math.round(hue2rgb(p, q, h) * 255), b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255) };
}

function buildLut(points: CurvePoint[]) {
  const lut = new Uint8Array(256);
  const sorted = [...points].sort((a, b) => a.x - b.x);
  for (let i = 0; i < 256; i++) {
    let p1 = sorted[0];
    let p2 = sorted[sorted.length - 1];
    for (let j = 0; j < sorted.length - 1; j++) {
      if (i >= sorted[j].x && i <= sorted[j + 1].x) {
        p1 = sorted[j]; p2 = sorted[j + 1]; break;
      }
    }
    const t = p2.x === p1.x ? 0 : (i - p1.x) / (p2.x - p1.x);
    lut[i] = clamp(Math.round(lerp(p1.y, p2.y, t)));
  }
  return lut;
}

function mapHueRange(h: number): HslRange {
  const deg = h * 360;
  if (deg < 20 || deg >= 340) return "red";
  if (deg < 45) return "orange";
  if (deg < 75) return "yellow";
  if (deg < 160) return "green";
  if (deg < 195) return "aqua";
  if (deg < 255) return "blue";
  if (deg < 290) return "purple";
  return "magenta";
}

function hueDistance(a: number, b: number) {
  const raw = Math.abs(a - b) % 360;
  return Math.min(raw, 360 - raw);
}

function getHueBandWeights(h: number): Record<HslRange, number> {
  const hue = (h * 360 + 360) % 360;
  const centers: Record<HslRange, number> = {
    red: 0,
    orange: 32,
    yellow: 58,
    green: 125,
    aqua: 185,
    blue: 238,
    purple: 280,
    magenta: 322
  };
  const width = 78;
  const falloff = 1.15;
  const weights = {} as Record<HslRange, number>;
  let sum = 0;
  for (const range of HSL_RANGES) {
    const dist = hueDistance(hue, centers[range]);
    const influence = Math.max(0, 1 - dist / width);
    const weight = Math.pow(influence, falloff);
    weights[range] = weight;
    sum += weight;
  }
  if (sum <= 0.0001) {
    const fallback = mapHueRange(h);
    for (const range of HSL_RANGES) weights[range] = range === fallback ? 1 : 0;
    return weights;
  }
  for (const range of HSL_RANGES) weights[range] /= sum;
  return weights;
}

function formatControlValue(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : "0";
}

function clampPercent(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function clampCropToBounds(cropX: number, cropY: number, cropW: number, cropH: number) {
  const boundedW = clampPercent(cropW, 5, 100);
  const boundedH = clampPercent(cropH, 5, 100);
  return {
    cropW: boundedW,
    cropH: boundedH,
    cropX: clampPercent(cropX, 0, 100 - boundedW),
    cropY: clampPercent(cropY, 0, 100 - boundedH)
  };
}

function clampCropWithRatio(cropX: number, cropY: number, cropW: number, cropH: number, ratio: number | null) {
  if (!ratio) return clampCropToBounds(cropX, cropY, cropW, cropH);

  let boundedX = clampPercent(cropX, 0, 95);
  let boundedY = clampPercent(cropY, 0, 95);
  const maxW = Math.max(5, Math.min(100 - boundedX, (100 - boundedY) * ratio));
  const maxH = Math.max(5, Math.min(100 - boundedY, (100 - boundedX) / ratio));

  let nextW = clampPercent(cropW, 5, maxW);
  let nextH = clampPercent(cropH, 5, maxH);

  if (nextW / nextH > ratio) nextW = clampPercent(nextH * ratio, 5, maxW);
  else nextH = clampPercent(nextW / ratio, 5, maxH);

  const bounds = clampCropToBounds(boundedX, boundedY, nextW, nextH);
  return {
    cropX: bounds.cropX,
    cropY: bounds.cropY,
    cropW: bounds.cropW,
    cropH: clampPercent(bounds.cropW / ratio, 5, 100 - bounds.cropY)
  };
}

function getQuadPoints(g: EditorState["geometry"]) {
  return [
    { x: g.quadTLX, y: g.quadTLY },
    { x: g.quadTRX, y: g.quadTRY },
    { x: g.quadBRX, y: g.quadBRY },
    { x: g.quadBLX, y: g.quadBLY }
  ];
}

function clampQuadShape(shape: QuadShape): QuadShape {
  return {
    quadTLX: clampPercent(shape.quadTLX),
    quadTLY: clampPercent(shape.quadTLY),
    quadTRX: clampPercent(shape.quadTRX),
    quadTRY: clampPercent(shape.quadTRY),
    quadBRX: clampPercent(shape.quadBRX),
    quadBRY: clampPercent(shape.quadBRY),
    quadBLX: clampPercent(shape.quadBLX),
    quadBLY: clampPercent(shape.quadBLY)
  };
}

function moveQuadShape(shape: QuadShape, dx: number, dy: number): QuadShape {
  const xs = [shape.quadTLX, shape.quadTRX, shape.quadBRX, shape.quadBLX];
  const ys = [shape.quadTLY, shape.quadTRY, shape.quadBRY, shape.quadBLY];
  const minDx = -Math.min(...xs);
  const maxDx = 100 - Math.max(...xs);
  const minDy = -Math.min(...ys);
  const maxDy = 100 - Math.max(...ys);
  const boundedDx = clamp(dx, minDx, maxDx);
  const boundedDy = clamp(dy, minDy, maxDy);
  return {
    quadTLX: shape.quadTLX + boundedDx,
    quadTLY: shape.quadTLY + boundedDy,
    quadTRX: shape.quadTRX + boundedDx,
    quadTRY: shape.quadTRY + boundedDy,
    quadBRX: shape.quadBRX + boundedDx,
    quadBRY: shape.quadBRY + boundedDy,
    quadBLX: shape.quadBLX + boundedDx,
    quadBLY: shape.quadBLY + boundedDy
  };
}

function parseRatioPreset(preset: GeometryRatioPreset): number | null {
  if (preset === "free" || preset === "original") return null;
  const [w, h] = preset.split(":").map(Number);
  if (!w || !h) return null;
  return w / h;
}

function sampleNeighborhood(data: Uint8ClampedArray, w: number, h: number, x: number, y: number, radius: number) {
  let r = 0, g = 0, b = 0, c = 0;
  for (let yy = -radius; yy <= radius; yy++) {
    for (let xx = -radius; xx <= radius; xx++) {
      const nx = x + xx, ny = y + yy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) {
        const i = (ny * w + nx) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; c++;
      }
    }
  }
  return { r: r / c, g: g / c, b: b / c };
}

async function parseCube(file: File): Promise<LUT3D> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).filter((l) => !l.startsWith("#"));
  const sizeLine = lines.find((l) => l.startsWith("LUT_3D_SIZE"));
  if (!sizeLine) return null;
  const size = Number(sizeLine.split(/\s+/)[1]);
  const values = lines.filter((l) => /^[-\d.]+\s+[-\d.]+\s+[-\d.]+$/.test(l)).flatMap((l) => l.split(/\s+/).map(Number));
  if (!size || values.length < size * size * size * 3) return null;
  return { size, table: new Float32Array(values.slice(0, size * size * size * 3)) };
}

function SectionIcon({ kind }: { kind: "basicTone"|"toneCurve"|"color"|"grading"|"detail"|"geometry"|"advanced"|"export" }) {
  const paths = {
    basicTone: <><circle cx="12" cy="12" r="6.5"/><path d="M12 5v14"/><path d="M5 12h14"/></>,
    toneCurve: <><path d="M4 19V5h16"/><path d="M5 16c3-4 6-6 9-7 2-1 3-2 6-5"/></>,
    color: <><path d="M12 3v4"/><path d="M12 17v4"/><path d="M4.5 7.5 7 10"/><path d="M17 14l2.5 2.5"/><circle cx="12" cy="12" r="4.5"/></>,
    grading: <><path d="M4 17h16"/><path d="M7 17V9"/><path d="M12 17V6"/><path d="M17 17v-4"/></>,
    detail: <><path d="m11 3 2.7 5.6 6.3.9-4.6 4.4 1.1 6.3L11 17.1 5.5 20.2l1.1-6.3L2 9.5l6.3-.9L11 3z"/></>,
    geometry: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16M15 4v16M4 9h16M4 15h16"/></>,
    advanced: <><path d="M12 3v3M12 18v3M3 12h3m12 0h3M6.5 6.5l2.2 2.2m6.6 6.6 2.2 2.2m0-11-2.2 2.2m-6.6 6.6-2.2 2.2"/></>,
    export: <><path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><rect x="4" y="17" width="16" height="3" rx="1"/></>
  } as const;
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

function ToolbarIcon({ kind }: { kind: "undo"|"redo"|"fit"|"actual"|"zoomOut"|"zoomIn"|"compare"|"hold"|"reset" }) {
  const paths = {
    undo: <><path d="M9 7H4v5" /><path d="M4 12a8 8 0 1 0 2.5-5.8" /></>,
    redo: <><path d="M15 7h5v5" /><path d="M20 12a8 8 0 1 1-2.5-5.8" /></>,
    fit: <><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M9 4v4H4" /><path d="M15 4v4h5" /><path d="M9 20v-4H4" /><path d="M15 20v-4h5" /></>,
    actual: <><rect x="4" y="4" width="16" height="16" rx="2.5" /><path d="M8 8h8v8H8z" /><path d="M12 8v8M8 12h8" /></>,
    zoomOut: <><circle cx="11" cy="11" r="6.5" /><path d="M8.5 11h5" /><path d="m16 16 4 4" /></>,
    zoomIn: <><circle cx="11" cy="11" r="6.5" /><path d="M8.5 11h5" /><path d="M11 8.5v5" /><path d="m16 16 4 4" /></>,
    compare: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M12 5v14" /><path d="M7 12h2m6 0h2" /></>,
    hold: <><path d="M12 4v16" /><path d="M8 8h8" /><path d="M8 16h8" /><path d="M6 12h12" /></>,
    reset: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 3v5h5" /></>
  } as const;
  return <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

function ToolbarButton({ active = false, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-100 transition hover:text-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-400/60 disabled:cursor-not-allowed disabled:opacity-45 ${active ? "text-sky-300" : ""} ${className}`}
    />
  );
}

function Collapsible({ title, defaultOpen = true, right, children, icon }: { title: string; defaultOpen?: boolean; right?: React.ReactNode; children: React.ReactNode; icon: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return <div className="rounded-2xl border border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/70">
    <div className="w-full px-3 py-2.5 flex items-center gap-2">
      <button type="button" className="flex-1 flex justify-between items-center" onClick={() => setOpen((v) => !v)}>
        <span className="font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2">{icon}{title}</span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {right ? <div onClick={(e) => e.stopPropagation()}>{right}</div> : null}
    </div>
    {open ? <div className="px-3 pb-3">{children}</div> : null}
  </div>;
}

export function UpscaleTab({ setSettings, active }: { settings: CommonRasterSettings; setSettings: (up: (p: CommonRasterSettings) => CommonRasterSettings) => void; active: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [toast, setToast] = useState<ToastState>({ open: false, message: "" });
  const [curveChannel, setCurveChannel] = useState<CurveChannel>("rgb");
  const [lut3d, setLut3d] = useState<LUT3D>(null);
  const [fileSizePreview, setFileSizePreview] = useState("-");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState<"fit"|"100"|"custom">("fit");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [showBefore, setShowBefore] = useState(false);
  const [holdBefore, setHoldBefore] = useState(false);
  const [showSettingsMobile, setShowSettingsMobile] = useState(true);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const [mobileTool, setMobileTool] = useState<SectionKey>("basicTone");
  const [isMobile, setIsMobile] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => typeof document === "undefined" ? true : document.visibilityState === "visible");
  const [isInteracting, setIsInteracting] = useState(false);
  const [previewQualityMode, setPreviewQualityMode] = useState<"interactive" | "final">("final");
  const [sheetState, setSheetState] = useState<"collapsed"|"half"|"full">("half");
  const [canvasRenderNonce, setCanvasRenderNonce] = useState(0);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const curveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragPointRef = useRef<number | null>(null);
  const renderTokenRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const sliderInteractionDepthRef = useRef(0);
  const settleTimerRef = useRef<number | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const preparedExportUrlRef = useRef<string | null>(null);
  const previewWrapRef = useRef<HTMLDivElement | null>(null);
  const cropGestureRef = useRef<{ mode: CropGestureMode; startX: number; startY: number; cropX: number; cropY: number; cropW: number; cropH: number; quad: QuadShape } | null>(null);
  const cropGestureFrameRef = useRef<number | null>(null);
  const bodyScrollRestoreRef = useRef<{ overflow: string; touchAction: string } | null>(null);
  const pendingCropRef = useRef<{ cropX: number; cropY: number; cropW: number; cropH: number; quad?: QuadShape } | null>(null);
  const [preparedExport, setPreparedExport] = useState<{ url: string; name: string; size: string } | null>(null);
  const sectionRefs = useRef<Record<SectionKey, HTMLDivElement | null>>({
    basicTone: null,
    toneCurve: null,
    color: null,
    grading: null,
    detail: null,
    geometry: null,
    advanced: null,
    export: null
  });

  const { present: state, commit, undo, redo, past, future } = useHistory(defaultState);

  const patch = useCallback((updater: (prev: EditorState) => EditorState) => commit(updater(state)), [commit, state]);

  const resetSection = (section: keyof EditorState) => patch((p) => ({ ...p, [section]: defaultState[section] }));
  const resetAll = () => { commit(defaultState); setLut3d(null); };
  const toolbarBtnClass = "";
  const toolbarToggleBtnClass = "";
  const mobileControlsClass = "pointer-events-auto absolute left-3 top-3 z-20 flex flex-wrap items-center gap-1.5";

  const adjustmentActive = active && isDocumentVisible && (!isMobile || mobileEditorOpen);

  const isAdjustmentInteractionTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest('input[type="range"], canvas[data-adjustment-control="true"]'));
  }, []);

  const onSliderInteractionStart = useCallback((event?: SyntheticEvent) => {
    if (event && !isAdjustmentInteractionTarget(event.target)) return;
    sliderInteractionDepthRef.current += 1;
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    setIsInteracting(true);
    setPreviewQualityMode("interactive");
  }, [isAdjustmentInteractionTarget]);

  const onSliderInteractionEnd = useCallback(() => {
    sliderInteractionDepthRef.current = Math.max(0, sliderInteractionDepthRef.current - 1);
    if (sliderInteractionDepthRef.current === 0) {
      setIsInteracting(false);
      settleTimerRef.current = window.setTimeout(() => setPreviewQualityMode("final"), 140);
    }
  }, []);

  const sliderHandlers = {
    onPointerDownCapture: onSliderInteractionStart,
    onPointerUpCapture: onSliderInteractionEnd,
    onPointerCancelCapture: onSliderInteractionEnd,
    onMouseUpCapture: onSliderInteractionEnd,
    onTouchEndCapture: onSliderInteractionEnd
  };

  const scrollToSection = useCallback((key: SectionKey) => {
    const section = sectionRefs.current[key];
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const setSectionRef = (key: SectionKey) => (node: HTMLDivElement | null) => {
    sectionRefs.current[key] = node;
  };

  const applyRatioPreset = useCallback((preset: GeometryRatioPreset) => {
    patch((prev) => {
      const nextGeometry = { ...prev.geometry, ratioPreset: preset };
      const ratio = preset === "original"
        ? (sourceCanvasRef.current ? sourceCanvasRef.current.width / Math.max(1, sourceCanvasRef.current.height) : null)
        : parseRatioPreset(preset);
      if (!ratio) {
        return {
          ...prev,
          geometry: {
            ...nextGeometry,
            ...clampCropToBounds(nextGeometry.cropX, nextGeometry.cropY, nextGeometry.cropW, nextGeometry.cropH)
          }
        };
      }

      const fitted = clampCropWithRatio(nextGeometry.cropX, nextGeometry.cropY, nextGeometry.cropW, nextGeometry.cropH, ratio);
      return {
        ...prev,
        geometry: {
          ...nextGeometry,
          ...fitted
        }
      };
    });
  }, [patch]);

  const patchGeometryCrop = useCallback((key: "cropX" | "cropY" | "cropW" | "cropH", rawValue: number) => {
    patch((prev) => {
      const g = prev.geometry;
      const ratio = g.ratioPreset === "original"
        ? (sourceCanvasRef.current ? sourceCanvasRef.current.width / Math.max(1, sourceCanvasRef.current.height) : null)
        : parseRatioPreset(g.ratioPreset);
      let cropX = g.cropX;
      let cropY = g.cropY;
      let cropW = g.cropW;
      let cropH = g.cropH;

      if (key === "cropX") cropX = rawValue;
      if (key === "cropY") cropY = rawValue;
      if (key === "cropW") cropW = rawValue;
      if (key === "cropH") cropH = rawValue;

      const nextCrop = ratio
        ? clampCropWithRatio(cropX, cropY, cropW, cropH, ratio)
        : clampCropToBounds(cropX, cropY, cropW, cropH);

      return { ...prev, geometry: { ...g, ...nextCrop } };
    });
  }, [patch]);

  const nudgeGeometryRotate = useCallback((amount: number) => {
    patch((prev) => ({
      ...prev,
      geometry: {
        ...prev.geometry,
        rotate: clampPercent(prev.geometry.rotate + amount, -180, 180)
      }
    }));
  }, [patch]);

  const startCropGesture = useCallback((mode: CropGestureMode, event: ReactPointerEvent<HTMLElement>) => {
    if (!file || mobileTool !== "geometry" || !previewCanvasRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const canvasRect = previewCanvasRef.current.getBoundingClientRect();
    if (canvasRect.width < 2 || canvasRect.height < 2) return;

    onSliderInteractionStart();
    if (!bodyScrollRestoreRef.current) {
      bodyScrollRestoreRef.current = {
        overflow: document.body.style.overflow,
        touchAction: document.body.style.touchAction
      };
      document.body.style.overflow = "hidden";
      document.body.style.touchAction = "none";
    }
    cropGestureRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      cropX: state.geometry.cropX,
      cropY: state.geometry.cropY,
      cropW: state.geometry.cropW,
      cropH: state.geometry.cropH,
      quad: {
        quadTLX: state.geometry.quadTLX,
        quadTLY: state.geometry.quadTLY,
        quadTRX: state.geometry.quadTRX,
        quadTRY: state.geometry.quadTRY,
        quadBRX: state.geometry.quadBRX,
        quadBRY: state.geometry.quadBRY,
        quadBLX: state.geometry.quadBLX,
        quadBLY: state.geometry.quadBLY
      }
    };

    const onMove = (moveEvent: PointerEvent) => {
      const gesture = cropGestureRef.current;
      const canvas = previewCanvasRef.current;
      if (!gesture || !canvas) return;
      moveEvent.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const dxPct = ((moveEvent.clientX - gesture.startX) / Math.max(1, rect.width)) * 100;
      const dyPct = ((moveEvent.clientY - gesture.startY) / Math.max(1, rect.height)) * 100;

      let cropX = gesture.cropX;
      let cropY = gesture.cropY;
      let cropW = gesture.cropW;
      let cropH = gesture.cropH;
      const minSize = 5;

      if (gesture.mode === "move") {
        cropX = gesture.cropX + dxPct;
        cropY = gesture.cropY + dyPct;
      } else if (["nw", "ne", "sw", "se"].includes(gesture.mode)) {
        if (gesture.mode === "nw" || gesture.mode === "sw") {
          cropX = clampPercent(gesture.cropX + dxPct, 0, gesture.cropX + gesture.cropW - minSize);
          cropW = clampPercent(gesture.cropW - (cropX - gesture.cropX), minSize, 100);
        }
        if (gesture.mode === "ne" || gesture.mode === "se") {
          cropW = clampPercent(gesture.cropW + dxPct, minSize, 100 - gesture.cropX);
        }
        if (gesture.mode === "nw" || gesture.mode === "ne") {
          cropY = clampPercent(gesture.cropY + dyPct, 0, gesture.cropY + gesture.cropH - minSize);
          cropH = clampPercent(gesture.cropH - (cropY - gesture.cropY), minSize, 100);
        }
        if (gesture.mode === "sw" || gesture.mode === "se") {
          cropH = clampPercent(gesture.cropH + dyPct, minSize, 100 - gesture.cropY);
        }
      }

      let quad = gesture.quad;
      if (gesture.mode === "quadMove") {
        quad = moveQuadShape(gesture.quad, dxPct, dyPct);
      } else if (gesture.mode === "quadTL") {
        quad = clampQuadShape({ ...gesture.quad, quadTLX: gesture.quad.quadTLX + dxPct, quadTLY: gesture.quad.quadTLY + dyPct });
      } else if (gesture.mode === "quadTR") {
        quad = clampQuadShape({ ...gesture.quad, quadTRX: gesture.quad.quadTRX + dxPct, quadTRY: gesture.quad.quadTRY + dyPct });
      } else if (gesture.mode === "quadBR") {
        quad = clampQuadShape({ ...gesture.quad, quadBRX: gesture.quad.quadBRX + dxPct, quadBRY: gesture.quad.quadBRY + dyPct });
      } else if (gesture.mode === "quadBL") {
        quad = clampQuadShape({ ...gesture.quad, quadBLX: gesture.quad.quadBLX + dxPct, quadBLY: gesture.quad.quadBLY + dyPct });
      } else if (gesture.mode === "edgeTop") {
        quad = clampQuadShape({ ...gesture.quad, quadTLX: gesture.quad.quadTLX + dxPct, quadTLY: gesture.quad.quadTLY + dyPct, quadTRX: gesture.quad.quadTRX + dxPct, quadTRY: gesture.quad.quadTRY + dyPct });
      } else if (gesture.mode === "edgeRight") {
        quad = clampQuadShape({ ...gesture.quad, quadTRX: gesture.quad.quadTRX + dxPct, quadTRY: gesture.quad.quadTRY + dyPct, quadBRX: gesture.quad.quadBRX + dxPct, quadBRY: gesture.quad.quadBRY + dyPct });
      } else if (gesture.mode === "edgeBottom") {
        quad = clampQuadShape({ ...gesture.quad, quadBLX: gesture.quad.quadBLX + dxPct, quadBLY: gesture.quad.quadBLY + dyPct, quadBRX: gesture.quad.quadBRX + dxPct, quadBRY: gesture.quad.quadBRY + dyPct });
      } else if (gesture.mode === "edgeLeft") {
        quad = clampQuadShape({ ...gesture.quad, quadTLX: gesture.quad.quadTLX + dxPct, quadTLY: gesture.quad.quadTLY + dyPct, quadBLX: gesture.quad.quadBLX + dxPct, quadBLY: gesture.quad.quadBLY + dyPct });
      }

      const ratio = state.geometry.ratioPreset === "original"
        ? (sourceCanvasRef.current ? sourceCanvasRef.current.width / Math.max(1, sourceCanvasRef.current.height) : null)
        : parseRatioPreset(state.geometry.ratioPreset);
      const nextCrop = ratio
        ? clampCropWithRatio(cropX, cropY, cropW, cropH, ratio)
        : clampCropToBounds(cropX, cropY, cropW, cropH);

      pendingCropRef.current = { ...nextCrop, quad };
      if (cropGestureFrameRef.current !== null) return;
      cropGestureFrameRef.current = window.requestAnimationFrame(() => {
        cropGestureFrameRef.current = null;
        const pending = pendingCropRef.current;
        if (!pending) return;
        patch((prev) => ({
          ...prev,
          geometry: {
            ...prev.geometry,
            cropX: pending.cropX,
            cropY: pending.cropY,
            cropW: pending.cropW,
            cropH: pending.cropH,
            ...(pending.quad ?? {})
          }
        }));
      });
    };

    const onUp = () => {
      cropGestureRef.current = null;
      pendingCropRef.current = null;
      if (cropGestureFrameRef.current !== null) {
        window.cancelAnimationFrame(cropGestureFrameRef.current);
        cropGestureFrameRef.current = null;
      }
      onSliderInteractionEnd();
      if (bodyScrollRestoreRef.current) {
        document.body.style.overflow = bodyScrollRestoreRef.current.overflow;
        document.body.style.touchAction = bodyScrollRestoreRef.current.touchAction;
        bodyScrollRestoreRef.current = null;
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [file, mobileTool, onSliderInteractionEnd, onSliderInteractionStart, patch, state.geometry]);

  const closeMobileEditor = useCallback(() => {
    setMobileEditorOpen(false);
    setShowSettingsMobile(false);
    setSheetState("half");
  }, []);

  const openMobileEditor = useCallback(() => {
    setMobileEditorOpen(true);
    setShowSettingsMobile(true);
    setSheetState("half");
  }, []);

  const onSheetHandlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!sheetRef.current) return;
    const startY = event.clientY;
    const initialState = sheetState;
    const onMove = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
    };
    const onUp = (upEvent: PointerEvent) => {
      const delta = upEvent.clientY - startY;
      if (delta < -60) {
        if (initialState === "collapsed") setSheetState("half");
        else setSheetState("full");
      } else if (delta > 60) {
        if (initialState === "full") setSheetState("half");
        else setSheetState("collapsed");
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
  };

  const loadImage = useCallback(async (f: File) => {
    const bmp = await createImageBitmap(f);
    const originalCanvas = sourceCanvasRef.current || document.createElement("canvas");
    originalCanvas.width = bmp.width;
    originalCanvas.height = bmp.height;
    originalCanvas.getContext("2d")?.drawImage(bmp, 0, 0);
    sourceCanvasRef.current = originalCanvas;

    const previewScale = Math.min(1, PREVIEW_MAX_DIMENSION / Math.max(bmp.width, bmp.height));
    const previewCanvas = previewSourceCanvasRef.current || document.createElement("canvas");
    let targetW = Math.max(1, Math.round(bmp.width * previewScale));
    let targetH = Math.max(1, Math.round(bmp.height * previewScale));
    let quality = 0.84;
    let bestBitmap: ImageBitmap | null = null;

    for (let attempt = 0; attempt < 7; attempt++) {
      const workingCanvas = document.createElement("canvas");
      workingCanvas.width = targetW;
      workingCanvas.height = targetH;
      const workingCtx = workingCanvas.getContext("2d");
      if (!workingCtx) break;
      workingCtx.imageSmoothingEnabled = true;
      workingCtx.imageSmoothingQuality = "high";
      workingCtx.drawImage(bmp, 0, 0, targetW, targetH);

      const blob = await new Promise<Blob | null>((resolve) => workingCanvas.toBlob((b) => resolve(b), "image/jpeg", quality));
      if (!blob) break;

      if (bestBitmap) bestBitmap.close();
      bestBitmap = await createImageBitmap(blob);

      if (blob.size <= PREVIEW_TARGET_BYTES) break;

      if (quality > 0.55) quality -= 0.1;
      else {
        targetW = Math.max(1, Math.round(targetW * 0.86));
        targetH = Math.max(1, Math.round(targetH * 0.86));
      }
    }

    previewCanvas.width = bestBitmap ? bestBitmap.width : targetW;
    previewCanvas.height = bestBitmap ? bestBitmap.height : targetH;
    const previewCtx = previewCanvas.getContext("2d");
    if (previewCtx) {
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewCtx.imageSmoothingEnabled = true;
      previewCtx.imageSmoothingQuality = "high";
      if (bestBitmap) previewCtx.drawImage(bestBitmap, 0, 0);
      else previewCtx.drawImage(bmp, 0, 0, previewCanvas.width, previewCanvas.height);
      previewSourceCanvasRef.current = previewCanvas;
    }
    if (bestBitmap) bestBitmap.close();

    bmp.close();
    patch((p) => ({
      ...p,
      geometry: { ...p.geometry, resizeW: originalCanvas.width, resizeH: originalCanvas.height },
      export: { ...p.export, width: originalCanvas.width, height: originalCanvas.height }
    }));
  }, [patch]);

  const handleImageSelect = useCallback(async (f?: File | null) => {
    if (!f) return;
    if (!ACCEPT.includes(f.type)) {
      setToast({ open: true, message: "Please choose a supported image format.", type: "error" });
      return;
    }
    setFile(f);
    setZoom("fit");
    setZoomLevel(1);
    if (preparedExportUrlRef.current) { URL.revokeObjectURL(preparedExportUrlRef.current); preparedExportUrlRef.current = null; }
    setPreparedExport(null);
    await loadImage(f);
    setCanvasRenderNonce((v) => v + 1);
    if (isMobile) {
      setShowSettingsMobile(true);
      setMobileEditorOpen(true);
    }
  }, [isMobile, loadImage]);

  const clearLoadedImage = useCallback(() => {
    setFile(null);
    sourceCanvasRef.current = null;
    previewSourceCanvasRef.current = null;
    if (previewCanvasRef.current) {
      const ctx = previewCanvasRef.current.getContext("2d");
      ctx?.clearRect(0, 0, previewCanvasRef.current.width, previewCanvasRef.current.height);
    }
    if (preparedExportUrlRef.current) {
      URL.revokeObjectURL(preparedExportUrlRef.current);
      preparedExportUrlRef.current = null;
    }
    setPreparedExport(null);
    setFileSizePreview("-");
    setZoom("fit");
    setZoomLevel(1);
    setCanvasRenderNonce((v) => v + 1);
  }, []);

  const commitCropSelection = useCallback(() => {
    const geometry = state.geometry;
    const applyDestructiveCrop = (src: HTMLCanvasElement | null) => {
      if (!src) return null;
      const out = document.createElement("canvas");

      if (geometry.cropShapeMode === "quad") {
        const points = getQuadPoints(geometry).map((pt) => ({
          x: (pt.x / 100) * src.width,
          y: (pt.y / 100) * src.height
        }));
        const minX = Math.max(0, Math.floor(Math.min(...points.map((pt) => pt.x))));
        const minY = Math.max(0, Math.floor(Math.min(...points.map((pt) => pt.y))));
        const maxX = Math.min(src.width, Math.ceil(Math.max(...points.map((pt) => pt.x))));
        const maxY = Math.min(src.height, Math.ceil(Math.max(...points.map((pt) => pt.y))));
        const w = Math.max(1, maxX - minX);
        const h = Math.max(1, maxY - minY);
        out.width = w;
        out.height = h;
        const octx = out.getContext("2d");
        if (!octx) return src;
        octx.save();
        octx.beginPath();
        octx.moveTo(points[0].x - minX, points[0].y - minY);
        octx.lineTo(points[1].x - minX, points[1].y - minY);
        octx.lineTo(points[2].x - minX, points[2].y - minY);
        octx.lineTo(points[3].x - minX, points[3].y - minY);
        octx.closePath();
        octx.clip();
        octx.drawImage(src, -minX, -minY);
        octx.restore();
        return out;
      }

      const cropX = Math.round((geometry.cropX / 100) * src.width);
      const cropY = Math.round((geometry.cropY / 100) * src.height);
      const cropW = Math.max(1, Math.round((geometry.cropW / 100) * src.width));
      const cropH = Math.max(1, Math.round((geometry.cropH / 100) * src.height));
      out.width = cropW;
      out.height = cropH;
      out.getContext("2d")?.drawImage(src, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      return out;
    };

    sourceCanvasRef.current = applyDestructiveCrop(sourceCanvasRef.current);
    previewSourceCanvasRef.current = applyDestructiveCrop(previewSourceCanvasRef.current);
    patch((prev) => ({
      ...prev,
      geometry: {
        ...prev.geometry,
        cropX: 0,
        cropY: 0,
        cropW: 100,
        cropH: 100,
        quadTLX: 0,
        quadTLY: 0,
        quadTRX: 100,
        quadTRY: 0,
        quadBRX: 100,
        quadBRY: 100,
        quadBLX: 0,
        quadBLY: 100
      }
    }));
    setCanvasRenderNonce((v) => v + 1);
  }, [patch, state.geometry]);

  const applyPipeline = useCallback(async (target: HTMLCanvasElement, forExport = false, lightweight = false, showBusy = false) => {
    const originalSource = sourceCanvasRef.current;
    const previewSource = previewSourceCanvasRef.current;
    const src = forExport ? originalSource : (previewSource ?? originalSource);
    if (!src || !originalSource) return;
    const token = ++renderTokenRef.current;
    if (showBusy) setBusy(true);
    await new Promise((r) => setTimeout(r, 0));
    if (token !== renderTokenRef.current) return;
    const g = state.geometry;
    const showLiveCropOverlayOnly = !forExport && mobileTool === "geometry";
    const cropX = showLiveCropOverlayOnly ? 0 : Math.round((g.cropX / 100) * src.width);
    const cropY = showLiveCropOverlayOnly ? 0 : Math.round((g.cropY / 100) * src.height);
    const cropW = showLiveCropOverlayOnly ? src.width : Math.max(1, Math.round((g.cropW / 100) * src.width));
    const cropH = showLiveCropOverlayOnly ? src.height : Math.max(1, Math.round((g.cropH / 100) * src.height));
    const previewScaleX = src.width / originalSource.width;
    const previewScaleY = src.height / originalSource.height;
    const targetW = forExport && state.export.resizeOnExport
      ? state.export.width
      : Math.max(1, Math.round((g.resizeW || Math.max(1, Math.round((g.cropW / 100) * originalSource.width))) * previewScaleX));
    const targetH = forExport && state.export.resizeOnExport
      ? state.export.height
      : Math.max(1, Math.round((g.resizeH || Math.max(1, Math.round((g.cropH / 100) * originalSource.height))) * previewScaleY));
    const outW = forExport ? targetW : Math.min(targetW, src.width);
    const outH = forExport ? targetH : Math.min(targetH, src.height);
    const interactiveMaxScale = !forExport && lightweight ? Math.min(1, INTERACTIVE_PREVIEW_MAX_DIMENSION / Math.max(outW, outH)) : 1;
    const renderScale = !forExport && lightweight ? Math.min(0.82, interactiveMaxScale) : 1;
    const workW = Math.max(1, Math.round(outW * renderScale));
    const workH = Math.max(1, Math.round(outH * renderScale));

    const temp = document.createElement("canvas");
    temp.width = workW; temp.height = workH;
    const tctx = temp.getContext("2d");
    if (!tctx) return;
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = g.smoothingQuality;
    tctx.translate(workW / 2, workH / 2);
    tctx.rotate((g.rotate * Math.PI) / 180);
    tctx.transform(1, g.perspectiveV / 100, g.perspectiveH / 100, 1, 0, 0);
    tctx.scale(g.flipH ? -1 : 1, g.flipV ? -1 : 1);
    tctx.drawImage(src, cropX, cropY, cropW, cropH, -workW / 2, -workH / 2, workW, workH);

    const ctx = temp.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const image = ctx.getImageData(0, 0, workW, workH);
    const d = image.data;
    const lutRGB = buildLut(state.toneCurve.rgb);
    const lutR = buildLut(state.toneCurve.r), lutG = buildLut(state.toneCurve.g), lutB = buildLut(state.toneCurve.b);

    const exposureMul = Math.pow(2, state.basicTone.exposure);
    const contrastMul = 1 + state.basicTone.contrast / 100;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g1 = d[i + 1], b = d[i + 2];
      r = r * exposureMul + state.basicTone.brightness;
      g1 = g1 * exposureMul + state.basicTone.brightness;
      b = b * exposureMul + state.basicTone.brightness;
      r = 128 + (r - 128) * contrastMul;
      g1 = 128 + (g1 - 128) * contrastMul;
      b = 128 + (b - 128) * contrastMul;
      const lum = (0.2126 * r + 0.7152 * g1 + 0.0722 * b) / 255;
      const sh = Math.max(0, 1 - lum * 2) * (state.basicTone.shadows / 100) * 80;
      const hi = Math.max(0, (lum - 0.5) * 2) * (state.basicTone.highlights / 100) * 80;
      r += sh - hi; g1 += sh - hi; b += sh - hi;
      if (lum > 0.8) { const w = (state.basicTone.whites / 100) * 60; r += w; g1 += w; b += w; }
      if (lum < 0.2) { const bl = (state.basicTone.blacks / 100) * 60; r += bl; g1 += bl; b += bl; }
      r += state.color.temperature * 0.66; b -= state.color.temperature * 0.66; g1 += state.color.tint * 0.56;

      let { h, s, l } = rgbToHsl(clamp(r), clamp(g1), clamp(b));
      s = clamp(s * 255 + state.color.saturation, 0, 255) / 255;
      const vibranceBoost = (state.color.vibrance / 165) * (1 - s) * 0.78;
      s = clamp((s + vibranceBoost) * 255, 0, 255) / 255;
      const bandWeights = getHueBandWeights(h);
      let hueShift = 0;
      let satShift = 0;
      let lumShift = 0;
      for (const range of HSL_RANGES) {
        const influence = bandWeights[range];
        if (influence <= 0) continue;
        const band = state.color.hsl[range];
        hueShift += (band.hue / 360) * influence;
        satShift += (band.sat / 120) * influence;
        lumShift += (band.lum / 120) * influence;
      }
      h = (h + hueShift + 1) % 1;
      s = clamp((s + satShift) * 255, 0, 255) / 255;
      l = clamp((l + lumShift) * 255, 0, 255) / 255;
      const graded = (() => {
        const shadowW = Math.max(0, 1 - l * 2), highW = Math.max(0, (l - 0.5) * 2), midW = 1 - shadowW - highW;
        const applyWheel = (wheel: { hue: number; sat: number; lum: number }, w: number, rgb: RGB) => {
          const tint = hslToRgb(wheel.hue / 360, clamp(wheel.sat, 0, 100) / 100, 0.5);
          rgb.r = lerp(rgb.r, tint.r, (wheel.sat / 100) * w * 0.35) + wheel.lum * w * 0.2;
          rgb.g = lerp(rgb.g, tint.g, (wheel.sat / 100) * w * 0.35) + wheel.lum * w * 0.2;
          rgb.b = lerp(rgb.b, tint.b, (wheel.sat / 100) * w * 0.35) + wheel.lum * w * 0.2;
        };
        const base = hslToRgb(h, s, l);
        applyWheel(state.grading.shadows, shadowW, base);
        applyWheel(state.grading.midtones, midW, base);
        applyWheel(state.grading.highlights, highW, base);
        return base;
      })();
      r = graded.r; g1 = graded.g; b = graded.b;

      if (state.advanced.labMode) {
        const avg = (r + g1 + b) / 3;
        r = lerp(avg, r, 1.15); g1 = lerp(avg, g1, 1.1); b = lerp(avg, b, 1.1);
      }
      const m = state.advanced.channelMixer;
      const nr = (r * m.r.r + g1 * m.r.g + b * m.r.b) / 100;
      const ng = (r * m.g.r + g1 * m.g.g + b * m.g.b) / 100;
      const nb = (r * m.b.r + g1 * m.b.g + b * m.b.b) / 100;
      r = Math.pow(clamp(nr) / 255, 1 / state.advanced.gamma) * 255;
      g1 = Math.pow(clamp(ng) / 255, 1 / state.advanced.gamma) * 255;
      b = Math.pow(clamp(nb) / 255, 1 / state.advanced.gamma) * 255;

      r = lutRGB[clamp(r)] + (lutR[clamp(r)] - clamp(r));
      g1 = lutRGB[clamp(g1)] + (lutG[clamp(g1)] - clamp(g1));
      b = lutRGB[clamp(b)] + (lutB[clamp(b)] - clamp(b));

      if (forExport) {
        const converted = applyColorSpaceTransform(r, g1, b, state.export.colorSpace);
        r = converted.r;
        g1 = converted.g;
        b = converted.b;
      }
      d[i] = clamp(r); d[i + 1] = clamp(g1); d[i + 2] = clamp(b);
    }

    const chromaSmoothStrength = Math.min(1, (Math.abs(state.color.vibrance) + Math.abs(state.color.saturation)) / 280);
    if (!lightweight && chromaSmoothStrength > 0.06 && workW > 2 && workH > 2) {
      const chromaSource = new Uint8ClampedArray(d);
      const chromaMix = 0.12 + chromaSmoothStrength * 0.2;
      const luma = (rr: number, gg: number, bb: number) => 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
      for (let y = 1; y < workH - 1; y++) {
        for (let x = 1; x < workW - 1; x++) {
          const i = (y * workW + x) * 4;
          const cR = chromaSource[i], cG = chromaSource[i + 1], cB = chromaSource[i + 2];
          const baseLum = luma(cR, cG, cB);
          let nr = 0, ng = 0, nb = 0, w = 0;
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const ni = ((y + oy) * workW + (x + ox)) * 4;
              const r2 = chromaSource[ni], g2 = chromaSource[ni + 1], b2 = chromaSource[ni + 2];
              const lumDiff = Math.abs(baseLum - luma(r2, g2, b2)) / 255;
              const ww = 1 - Math.min(1, lumDiff * 2.2);
              nr += r2 * ww; ng += g2 * ww; nb += b2 * ww; w += ww;
            }
          }
          if (w > 0.0001) {
            const sr = nr / w, sg = ng / w, sb = nb / w;
            d[i] = clamp(lerp(cR, sr, chromaMix));
            d[i + 1] = clamp(lerp(cG, sg, chromaMix));
            d[i + 2] = clamp(lerp(cB, sb, chromaMix));
          }
        }
      }
    }

    const blurred = new Uint8ClampedArray(d);
    if (!lightweight && (state.detail.sharpenAmount > 0 || state.detail.noiseLuma > 0 || state.detail.noiseColor > 0 || state.detail.clarity !== 0 || state.detail.texture !== 0 || state.detail.dehaze !== 0 || state.advanced.highPass > 0 || state.advanced.edgePreview)) {
      const rad = Math.max(1, Math.round(state.detail.sharpenRadius));
      for (let y = 0; y < workH; y++) {
        for (let x = 0; x < workW; x++) {
          const i = (y * workW + x) * 4;
          const n = sampleNeighborhood(d, workW, workH, x, y, Math.max(1, rad));
          blurred[i] = n.r; blurred[i + 1] = n.g; blurred[i + 2] = n.b;
        }
      }
      for (let i = 0; i < d.length; i += 4) {
        let r = d[i], g1 = d[i + 1], b = d[i + 2];
        const br = blurred[i], bg = blurred[i + 1], bb = blurred[i + 2];
        const hr = r - br, hg = g1 - bg, hb = b - bb;
        const edge = Math.abs(hr) + Math.abs(hg) + Math.abs(hb);
        if (state.detail.sharpenAmount > 0 && edge > state.detail.sharpenThreshold) {
          r += hr * (state.detail.sharpenAmount / 100);
          g1 += hg * (state.detail.sharpenAmount / 100);
          b += hb * (state.detail.sharpenAmount / 100);
        }
        const clarityFactor = state.detail.clarity / 100;
        r += hr * clarityFactor * 0.8; g1 += hg * clarityFactor * 0.8; b += hb * clarityFactor * 0.8;
        const textureFactor = state.detail.texture / 100;
        r += hr * textureFactor * 0.4; g1 += hg * textureFactor * 0.4; b += hb * textureFactor * 0.4;
        const dehazeFactor = state.detail.dehaze / 100;
        r = 128 + (r - 128) * (1 + dehazeFactor * 0.5); g1 = 128 + (g1 - 128) * (1 + dehazeFactor * 0.5); b = 128 + (b - 128) * (1 + dehazeFactor * 0.5);

        if (state.detail.noiseLuma > 0) {
          const mix = state.detail.noiseLuma / 100;
          const gray = (br + bg + bb) / 3;
          r = lerp(r, gray, mix * 0.4); g1 = lerp(g1, gray, mix * 0.4); b = lerp(b, gray, mix * 0.4);
        }
        if (state.detail.noiseColor > 0) {
          const mix = state.detail.noiseColor / 100;
          r = lerp(r, br, mix * 0.55); g1 = lerp(g1, bg, mix * 0.55); b = lerp(b, bb, mix * 0.55);
        }
        if (state.advanced.highPass > 0) {
          const hp = state.advanced.highPass / 100;
          r = 128 + hr * hp * 2; g1 = 128 + hg * hp * 2; b = 128 + hb * hp * 2;
        }
        if (state.advanced.edgePreview) {
          const e = clamp(edge * 1.2);
          r = g1 = b = e;
        }
        if (forExport) {
        const converted = applyColorSpaceTransform(r, g1, b, state.export.colorSpace);
        r = converted.r;
        g1 = converted.g;
        b = converted.b;
      }
      d[i] = clamp(r); d[i + 1] = clamp(g1); d[i + 2] = clamp(b);
      }
    }

    if (lut3d && !lightweight) {
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255, g1 = d[i + 1] / 255, b = d[i + 2] / 255;
        const idx = ((Math.round(r * (lut3d.size - 1)) * lut3d.size + Math.round(g1 * (lut3d.size - 1))) * lut3d.size + Math.round(b * (lut3d.size - 1))) * 3;
        d[i] = clamp(lut3d.table[idx] * 255); d[i + 1] = clamp(lut3d.table[idx + 1] * 255); d[i + 2] = clamp(lut3d.table[idx + 2] * 255);
      }
    }

    if (g.vignette > 0 || g.lensDistortion !== 0) {
      const cx = workW / 2, cy = workH / 2;
      const maxDist = Math.sqrt(cx * cx + cy * cy);
      for (let y = 0; y < workH; y++) for (let x = 0; x < workW; x++) {
        const i = (y * workW + x) * 4;
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
        const vig = 1 - (g.vignette / 100) * Math.pow(dist, 1.8);
        const distort = 1 + (g.lensDistortion / 100) * dist * 0.2;
        d[i] = clamp(d[i] * vig * distort); d[i + 1] = clamp(d[i + 1] * vig * distort); d[i + 2] = clamp(d[i + 2] * vig * distort);
      }
    }

    if (token !== renderTokenRef.current) return;
    ctx.putImageData(image, 0, 0);
    target.width = outW; target.height = outH;
    const targetCtx = target.getContext("2d");
    if (targetCtx) {
      targetCtx.imageSmoothingEnabled = true;
      targetCtx.imageSmoothingQuality = lightweight ? "medium" : g.smoothingQuality;
      targetCtx.drawImage(temp, 0, 0, outW, outH);
    }
    setBusy(false);
  }, [lut3d, mobileTool, state]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const onVisibility = () => setIsDocumentVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (isMobile) {
      setMobileEditorOpen(true);
      setShowSettingsMobile(true);
      setSheetState("half");
      return;
    }
    setMobileEditorOpen(false);
    setShowSettingsMobile(false);
    setSheetState("half");
  }, [isMobile]);

  useEffect(() => {
    if (adjustmentActive) return;
    renderTokenRef.current += 1;
    setBusy(false);
  }, [adjustmentActive]);

  useEffect(() => {
    if (!adjustmentActive || !previewCanvasRef.current || !sourceCanvasRef.current) return;
    if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = window.setTimeout(() => {
      if (showBefore || holdBefore) {
        const src = (previewSourceCanvasRef.current ?? sourceCanvasRef.current) as HTMLCanvasElement;
        const preview = previewCanvasRef.current as HTMLCanvasElement;
        preview.width = src.width;
        preview.height = src.height;
        preview.getContext("2d")?.drawImage(src, 0, 0);
        return;
      }
      applyPipeline(previewCanvasRef.current as HTMLCanvasElement, false, isInteracting || previewQualityMode === "interactive", false).then(async () => {
        if (isInteracting || previewQualityMode === "interactive") return;
        const blob = await new Promise<Blob | null>((r) => previewCanvasRef.current?.toBlob((b) => r(b), "image/jpeg", state.export.quality / 100));
        setFileSizePreview(blob ? `${(blob.size / 1024).toFixed(1)} KB` : "-");
      });
    }, isInteracting ? INTERACTIVE_PREVIEW_DELAY_MS : FINAL_PREVIEW_DELAY_MS);
    return () => {
      if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    };
  }, [state, applyPipeline, adjustmentActive, showBefore, holdBefore, isInteracting, previewQualityMode]);

  useEffect(() => {
    if (!adjustmentActive) return;
    const canvas = curveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = 320; canvas.height = 320;
    ctx.fillStyle = "#020617"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1e293b";
    for (let i = 0; i <= 4; i++) {
      const p = (i / 4) * canvas.width;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(canvas.width, p); ctx.stroke();
    }
    const points = [...state.toneCurve[curveChannel]].sort((a, b) => a.x - b.x);
    ctx.strokeStyle = curveChannel === "r" ? "#ef4444" : curveChannel === "g" ? "#22c55e" : curveChannel === "b" ? "#3b82f6" : "#f8fafc";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = (p.x / 255) * canvas.width, y = canvas.height - (p.y / 255) * canvas.height;
      if (!i) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = "#f8fafc";
    points.forEach((p) => {
      const x = (p.x / 255) * canvas.width, y = canvas.height - (p.y / 255) * canvas.height;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    });
  }, [state.toneCurve, curveChannel, adjustmentActive]);

  useEffect(() => () => {
    renderTokenRef.current += 1;
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current);
    if (cropGestureFrameRef.current !== null) window.cancelAnimationFrame(cropGestureFrameRef.current);
    if (bodyScrollRestoreRef.current) {
      document.body.style.overflow = bodyScrollRestoreRef.current.overflow;
      document.body.style.touchAction = bodyScrollRestoreRef.current.touchAction;
      bodyScrollRestoreRef.current = null;
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    if (preparedExportUrlRef.current) URL.revokeObjectURL(preparedExportUrlRef.current);
  }, []);

  useEffect(() => {
    if (!file || !preparedExport) return;
    if (preparedExportUrlRef.current) {
      URL.revokeObjectURL(preparedExportUrlRef.current);
      preparedExportUrlRef.current = null;
    }
    setPreparedExport(null);
  }, [
    file,
    state.basicTone,
    state.toneCurve,
    state.color,
    state.grading,
    state.detail,
    state.geometry,
    state.advanced,
    state.export
  ]);

  return <>
    <Toast state={toast} onClose={() => setToast((t) => ({ ...t, open: false }))} />
    <div className="relative h-[clamp(28rem,calc(100vh-10rem),82vh)] overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 shadow-2xl dark:border-slate-700">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT.join(",")}
        className="hidden"
        onChange={async (e) => {
          await handleImageSelect(e.target.files?.[0]);
          e.currentTarget.value = "";
        }}
      />
      {isMobile ? <>
      <div className={mobileControlsClass}>
        <ToolbarButton className={toolbarBtnClass} title="Undo" aria-label="Undo" disabled={!past.length} onClick={undo}><ToolbarIcon kind="undo" /></ToolbarButton>
        <ToolbarButton className={toolbarBtnClass} title="Redo" aria-label="Redo" disabled={!future.length} onClick={redo}><ToolbarIcon kind="redo" /></ToolbarButton>
        <ToolbarButton className={toolbarBtnClass} title="Fit preview" aria-label="Fit preview" onClick={() => { setZoom("fit"); setZoomLevel(1); }}><ToolbarIcon kind="fit" /></ToolbarButton>
        <ToolbarButton className={toolbarBtnClass} title="Actual size" aria-label="Actual size" onClick={() => { setZoom("100"); setZoomLevel(1); }}><ToolbarIcon kind="actual" /></ToolbarButton>
        <ToolbarButton className={toolbarBtnClass} title="Zoom out" aria-label="Zoom out" onClick={() => { setZoom("custom"); setZoomLevel((z) => Math.max(0.25, z - 0.1)); }}><ToolbarIcon kind="zoomOut" /></ToolbarButton>
        <ToolbarButton className={toolbarBtnClass} title="Zoom in" aria-label="Zoom in" onClick={() => { setZoom("custom"); setZoomLevel((z) => Math.min(3, z + 0.1)); }}><ToolbarIcon kind="zoomIn" /></ToolbarButton>
        <ToolbarButton active={showBefore} className={toolbarToggleBtnClass} title="Before/after compare" aria-label="Before/after compare" onClick={() => setShowBefore((v) => !v)}><ToolbarIcon kind="compare" /></ToolbarButton>
        <ToolbarButton className={toolbarBtnClass} title="Hold original" aria-label="Hold original" onMouseDown={() => setHoldBefore(true)} onMouseUp={() => setHoldBefore(false)} onMouseLeave={() => setHoldBefore(false)}><ToolbarIcon kind="hold" /></ToolbarButton>
        <ToolbarButton className={toolbarBtnClass} title="Reset all adjustments" aria-label="Reset all adjustments" onClick={resetAll}><ToolbarIcon kind="reset" /></ToolbarButton>
      </div>
      {file ? <button
        type="button"
        className="pointer-events-auto absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-slate-300/70 bg-slate-950/85 text-3xl leading-none text-white hover:border-sky-400"
        onClick={(event) => {
          event.stopPropagation();
          clearLoadedImage();
        }}
        aria-label="Close preview"
        title="Close image"
      >
        ×
      </button> : null}
      </> : <div className="absolute inset-x-3 top-3 z-20 flex flex-col gap-2 sm:inset-x-4 sm:top-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <ToolbarButton className={toolbarBtnClass} title="Undo" aria-label="Undo" disabled={!past.length} onClick={undo}><ToolbarIcon kind="undo" /></ToolbarButton>
          <ToolbarButton className={toolbarBtnClass} title="Redo" aria-label="Redo" disabled={!future.length} onClick={redo}><ToolbarIcon kind="redo" /></ToolbarButton>
        </div>
        <div className="pointer-events-auto flex flex-wrap justify-start gap-2 sm:justify-end">
          <ToolbarButton className={toolbarBtnClass} title="Fit preview" aria-label="Fit preview" onClick={() => { setZoom("fit"); setZoomLevel(1); }}><ToolbarIcon kind="fit" /></ToolbarButton>
          <ToolbarButton className={toolbarBtnClass} title="Actual size" aria-label="Actual size" onClick={() => { setZoom("100"); setZoomLevel(1); }}><ToolbarIcon kind="actual" /></ToolbarButton>
          <ToolbarButton className={toolbarBtnClass} title="Zoom out" aria-label="Zoom out" onClick={() => { setZoom("custom"); setZoomLevel((z) => Math.max(0.25, z - 0.1)); }}><ToolbarIcon kind="zoomOut" /></ToolbarButton>
          <ToolbarButton className={toolbarBtnClass} title="Zoom in" aria-label="Zoom in" onClick={() => { setZoom("custom"); setZoomLevel((z) => Math.min(3, z + 0.1)); }}><ToolbarIcon kind="zoomIn" /></ToolbarButton>
          <ToolbarButton active={showBefore} className={toolbarToggleBtnClass} title="Before/after compare" aria-label="Before/after compare" onClick={() => setShowBefore((v) => !v)}><ToolbarIcon kind="compare" /></ToolbarButton>
          <ToolbarButton className={toolbarBtnClass} title="Hold original" aria-label="Hold original" onMouseDown={() => setHoldBefore(true)} onMouseUp={() => setHoldBefore(false)} onMouseLeave={() => setHoldBefore(false)}><ToolbarIcon kind="hold" /></ToolbarButton>
          <ToolbarButton className={toolbarBtnClass} title="Reset all adjustments" aria-label="Reset all adjustments" onClick={resetAll}><ToolbarIcon kind="reset" /></ToolbarButton>
          {file ? <button
            type="button"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-300/70 bg-slate-950/85 text-3xl leading-none text-white hover:border-sky-400"
            onClick={(event) => {
              event.stopPropagation();
              clearLoadedImage();
            }}
            aria-label="Close preview"
            title="Close image"
          >
            ×
          </button> : null}
        </div>
      </div>}

      <div className="h-full w-full p-3 pb-36 md:p-4 md:pb-36">
        <div
          className={`relative flex h-full w-full items-center justify-center overflow-auto rounded-2xl border border-slate-700/80 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 ${!file ? "cursor-pointer" : "cursor-default"}`}
          onClick={() => {
            if (!file) fileInputRef.current?.click();
          }}
        >
          {!file ? <span className="text-slate-500 dark:text-slate-400 text-sm">Load an image to begin editing.</span> : <div ref={previewWrapRef} className="relative inline-block">
            <canvas key={canvasRenderNonce} ref={previewCanvasRef} style={{ transform: `scale(${zoom === "fit" ? 1 : zoomLevel})` }} className="h-auto max-h-full w-auto max-w-full rounded-lg transition-transform" />
            {mobileTool === "geometry" && !showBefore && !holdBefore ? (() => {
              const g = state.geometry;
              const rectMidX = g.cropX + g.cropW / 2;
              const rectTop = g.cropY;
              const quadPoints = [
                { key: "quadTL" as const, x: g.quadTLX, y: g.quadTLY },
                { key: "quadTR" as const, x: g.quadTRX, y: g.quadTRY },
                { key: "quadBR" as const, x: g.quadBRX, y: g.quadBRY },
                { key: "quadBL" as const, x: g.quadBLX, y: g.quadBLY }
              ];
              const edgeHandles = [
                { key: "edgeTop" as const, x: (g.quadTLX + g.quadTRX) / 2, y: (g.quadTLY + g.quadTRY) / 2 },
                { key: "edgeRight" as const, x: (g.quadTRX + g.quadBRX) / 2, y: (g.quadTRY + g.quadBRY) / 2 },
                { key: "edgeBottom" as const, x: (g.quadBLX + g.quadBRX) / 2, y: (g.quadBLY + g.quadBRY) / 2 },
                { key: "edgeLeft" as const, x: (g.quadTLX + g.quadBLX) / 2, y: (g.quadTLY + g.quadBLY) / 2 }
              ];
              const quadCenterX = (g.quadTLX + g.quadTRX + g.quadBRX + g.quadBLX) / 4;
              const quadCenterY = (g.quadTLY + g.quadTRY + g.quadBRY + g.quadBLY) / 4;
              const doneX = g.cropShapeMode === "quad" ? quadCenterX : rectMidX;
              const doneY = g.cropShapeMode === "quad" ? Math.min(g.quadTLY, g.quadTRY, g.quadBRY, g.quadBLY) : rectTop;

              return <>
                <button
                  type="button"
                  className="absolute z-20 -translate-x-1/2 rounded-md border border-white/70 bg-slate-900/85 px-3 py-1 text-xs font-semibold text-white"
                  style={{ left: `${doneX}%`, top: `calc(${doneY}% - 2rem)` }}
                  onClick={commitCropSelection}
                >
                  Done
                </button>
                {g.cropShapeMode === "rect" ? <div
                  className="absolute cursor-move rounded-lg border border-white/25 touch-none"
                  onPointerDown={(e) => startCropGesture("move", e)}
                  style={{
                    left: `${g.cropX}%`,
                    top: `${g.cropY}%`,
                    width: `${g.cropW}%`,
                    height: `${g.cropH}%`,
                    boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.45)"
                  }}
                >
                  <div className="absolute inset-0 border border-white/80" />
                  <div className="absolute left-1/3 right-1/3 top-0 h-px bg-white/40" />
                  <div className="absolute left-1/3 right-1/3 bottom-0 h-px bg-white/40" />
                  <div className="absolute top-1/3 bottom-1/3 left-0 w-px bg-white/40" />
                  <div className="absolute top-1/3 bottom-1/3 right-0 w-px bg-white/40" />
                  {["nw", "ne", "sw", "se"].map((corner) => {
                    const posClass = corner === "nw" ? "-left-2 -top-2" : corner === "ne" ? "-right-2 -top-2" : corner === "sw" ? "-left-2 -bottom-2" : "-right-2 -bottom-2";
                    return <button
                      key={corner}
                      type="button"
                      className={`absolute h-4 w-4 rounded-full border border-white bg-slate-900/80 ${posClass}`}
                      onPointerDown={(e) => startCropGesture(corner as CropGestureMode, e)}
                      style={{ touchAction: "none" }}
                      aria-label={`Resize crop ${corner}`}
                    />;
                  })}
                </div> : <div className="absolute inset-0">
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polygon
                      points={`${g.quadTLX},${g.quadTLY} ${g.quadTRX},${g.quadTRY} ${g.quadBRX},${g.quadBRY} ${g.quadBLX},${g.quadBLY}`}
                      fill="rgba(15,23,42,0.28)"
                      stroke="rgba(255,255,255,0.92)"
                      strokeWidth="0.35"
                    />
                  </svg>
                  <button
                    type="button"
                    className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-slate-900/85"
                    style={{ left: `${quadCenterX}%`, top: `${quadCenterY}%` }}
                    onPointerDown={(e) => startCropGesture("quadMove", e)}
                    aria-label="Move custom crop shape"
                  />
                  {quadPoints.map((point) => <button
                    key={point.key}
                    type="button"
                    className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-slate-900/90"
                    style={{ left: `${point.x}%`, top: `${point.y}%` }}
                    onPointerDown={(e) => startCropGesture(point.key, e)}
                    aria-label={`Move ${point.key}`}
                  />)}
                  {edgeHandles.map((edge) => <button
                    key={edge.key}
                    type="button"
                    className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-slate-800/90"
                    style={{ left: `${edge.x}%`, top: `${edge.y}%` }}
                    onPointerDown={(e) => startCropGesture(edge.key, e)}
                    aria-label={`Move ${edge.key}`}
                  />)}
                </div>}
              </>;
            })() : null}
          </div>}
          {busy ? <div className="absolute inset-0 bg-slate-900/55 flex items-center justify-center text-slate-100 text-sm">Preparing export…</div> : null}
          {(showBefore || holdBefore) ? <div className="absolute bottom-3 right-3 rounded bg-slate-900/80 px-2 py-1 text-xs text-white">Original view</div> : null}
          {!file ? <div className="absolute bottom-3 left-3 rounded bg-white/80 text-slate-700 dark:bg-slate-900/70 dark:text-slate-200 px-2 py-1 text-xs">Tap preview to upload</div> : <div className="absolute bottom-3 left-3 rounded bg-white/80 text-slate-700 dark:bg-slate-900/70 dark:text-slate-200 px-2 py-1 text-xs">Use × to remove and upload a new image</div>}
        </div>
      </div>

      {showSettingsMobile ? <div ref={sheetRef} {...sliderHandlers} className={`absolute inset-x-6 bottom-20 z-30 overflow-y-auto rounded-2xl border border-slate-300/70 bg-white/90 text-slate-800 shadow-xl backdrop-blur-md dark:border-slate-500/70 dark:bg-slate-900/82 dark:text-slate-100 sm:inset-x-4 sm:bottom-20 sm:p-3 p-2 ${sheetState === "collapsed" ? "max-h-[14vh]" : sheetState === "full" ? "max-h-[42vh]" : "max-h-[26vh] sm:max-h-[40vh]"}`}>
        <div className="mb-2 flex items-center justify-center"><button type="button" aria-label="Resize settings panel" onPointerDown={onSheetHandlePointerDown} className="h-1.5 w-14 rounded-full bg-slate-400/70 hover:bg-slate-500/80 dark:bg-slate-400/60 dark:hover:bg-slate-300/80" /></div>
        <div className="space-y-4">
        {(mobileTool === "basicTone") ? <div ref={setSectionRef("basicTone")}><Collapsible icon={<SectionIcon kind="basicTone" />} title="Basic Tone" right={<Button variant="ghost" onClick={() => resetSection("basicTone")}>Reset</Button>}>
          {Object.entries(state.basicTone).map(([k, v]) => <Field key={k} label={k[0].toUpperCase() + k.slice(1)} hint={formatControlValue(v, k === "exposure" ? 2 : 1)}><Slider min={k === "exposure" ? -8 : -150} max={k === "exposure" ? 8 : 150} step={k === "exposure" ? 0.05 : 0.5} value={v} onChange={(e) => patch((p) => ({ ...p, basicTone: { ...p.basicTone, [k]: Number(e.target.value) } }))} /></Field>)}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Exposure (precise)"><Input type="number" step={0.01} min={-8} max={8} value={state.basicTone.exposure} onChange={(e) => patch((p) => ({ ...p, basicTone: { ...p.basicTone, exposure: Number(e.target.value) } }))} /></Field>
            <Field label="Contrast (precise)"><Input type="number" step={0.1} min={-150} max={150} value={state.basicTone.contrast} onChange={(e) => patch((p) => ({ ...p, basicTone: { ...p.basicTone, contrast: Number(e.target.value) } }))} /></Field>
          </div>
        </Collapsible></div> : null}

        {(mobileTool === "toneCurve") ? <div ref={setSectionRef("toneCurve")}><Collapsible icon={<SectionIcon kind="toneCurve" />} title="Tone Curve" right={<Button variant="ghost" onClick={() => resetSection("toneCurve")}>Reset</Button>}>
          <Field label="Channel"><Select value={curveChannel} onChange={(e) => setCurveChannel(e.target.value as CurveChannel)}><option value="rgb">RGB</option><option value="r">Red</option><option value="g">Green</option><option value="b">Blue</option></Select></Field>
          <canvas ref={curveCanvasRef} data-adjustment-control="true" className="w-full rounded-lg mt-2 cursor-crosshair" onMouseDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 255;
            const y = 255 - ((e.clientY - rect.top) / rect.height) * 255;
            const points = state.toneCurve[curveChannel];
            let idx = points.findIndex((p) => Math.abs(p.x - x) < 8 && Math.abs(p.y - y) < 8);
            if (idx < 0) {
              patch((p) => ({ ...p, toneCurve: { ...p.toneCurve, [curveChannel]: [...p.toneCurve[curveChannel], { x: clamp(x), y: clamp(y) }].sort((a, b) => a.x - b.x) } }));
              idx = state.toneCurve[curveChannel].length;
            }
            dragPointRef.current = idx;
          }} onDoubleClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 255;
            patch((p) => ({ ...p, toneCurve: { ...p.toneCurve, [curveChannel]: p.toneCurve[curveChannel].filter((pt, i, arr) => i === 0 || i === arr.length - 1 || Math.abs(pt.x - x) > 8) } }));
          }} onMouseMove={(e) => {
            if (dragPointRef.current === null) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = clamp(((e.clientX - rect.left) / rect.width) * 255);
            const y = clamp(255 - ((e.clientY - rect.top) / rect.height) * 255);
            patch((p) => {
              const next = [...p.toneCurve[curveChannel]];
              if (dragPointRef.current! <= 0 || dragPointRef.current! >= next.length - 1) return p;
              next[dragPointRef.current!] = { x, y };
              return { ...p, toneCurve: { ...p.toneCurve, [curveChannel]: next.sort((a, b) => a.x - b.x) } };
            });
          }} onMouseUp={() => { dragPointRef.current = null; }} />
        </Collapsible></div> : null}

        {(mobileTool === "color") ? <div ref={setSectionRef("color")}><Collapsible icon={<SectionIcon kind="color" />} title="Color Precision Pro" right={<Button variant="ghost" onClick={() => resetSection("color")}>Reset</Button>}>
          <div className="mb-3 rounded-xl border border-slate-600/70 bg-slate-950/35 p-2.5 text-[11px] leading-relaxed text-slate-300">
            Smooth mode blends neighboring hue bands to avoid harsh edges and pixel-like color jumps.
          </div>
          {(["temperature", "tint", "vibrance", "saturation"] as const).map((k) => <Field key={k} label={k[0].toUpperCase() + k.slice(1)} hint={formatControlValue(state.color[k])}>
            <Slider min={-200} max={200} step={0.05} value={state.color[k]} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, [k]: Number(e.target.value) } }))} />
          </Field>)}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Temp precise"><Input type="number" step={0.01} min={-200} max={200} value={state.color.temperature} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, temperature: Number(e.target.value) } }))} /></Field>
            <Field label="Tint precise"><Input type="number" step={0.01} min={-200} max={200} value={state.color.tint} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, tint: Number(e.target.value) } }))} /></Field>
          </div>
          <div className="mt-3 space-y-2">
            {HSL_RANGES.map((range) => <div className="rounded-xl border border-slate-700/80 bg-slate-950/30 p-2" key={range}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-sky-200">{range}</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Field label="Hue" hint={formatControlValue(state.color.hsl[range].hue, 2)}><Slider min={-180} max={180} step={0.05} value={state.color.hsl[range].hue} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, hsl: { ...p.color.hsl, [range]: { ...p.color.hsl[range], hue: Number(e.target.value) } } } }))} /></Field>
                <Field label="Saturation" hint={formatControlValue(state.color.hsl[range].sat, 2)}><Slider min={-150} max={150} step={0.05} value={state.color.hsl[range].sat} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, hsl: { ...p.color.hsl, [range]: { ...p.color.hsl[range], sat: Number(e.target.value) } } } }))} /></Field>
                <Field label="Luminance" hint={formatControlValue(state.color.hsl[range].lum, 2)}><Slider min={-150} max={150} step={0.05} value={state.color.hsl[range].lum} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, hsl: { ...p.color.hsl, [range]: { ...p.color.hsl[range], lum: Number(e.target.value) } } } }))} /></Field>
              </div>
            </div>)}
          </div>
        </Collapsible></div> : null}

        {(mobileTool === "grading") ? <div ref={setSectionRef("grading")}><Collapsible icon={<SectionIcon kind="grading" />} title="Color Grading" right={<Button variant="ghost" onClick={() => resetSection("grading")}>Reset</Button>}>
          {(["shadows", "midtones", "highlights"] as const).map((tone) => <div className="grid grid-cols-3 gap-2" key={tone}>
            <Field label={`${tone} hue`} hint={String(state.grading[tone].hue)}><Slider min={0} max={360} value={state.grading[tone].hue} onChange={(e) => patch((p) => ({ ...p, grading: { ...p.grading, [tone]: { ...p.grading[tone], hue: Number(e.target.value) } } }))} /></Field>
            <Field label="sat" hint={String(state.grading[tone].sat)}><Slider min={0} max={100} value={state.grading[tone].sat} onChange={(e) => patch((p) => ({ ...p, grading: { ...p.grading, [tone]: { ...p.grading[tone], sat: Number(e.target.value) } } }))} /></Field>
            <Field label="lum" hint={String(state.grading[tone].lum)}><Slider min={-100} max={100} value={state.grading[tone].lum} onChange={(e) => patch((p) => ({ ...p, grading: { ...p.grading, [tone]: { ...p.grading[tone], lum: Number(e.target.value) } } }))} /></Field>
          </div>)}
        </Collapsible></div> : null}

        {(mobileTool === "detail") ? <div ref={setSectionRef("detail")}><Collapsible icon={<SectionIcon kind="detail" />} title="Detail" right={<Button variant="ghost" onClick={() => resetSection("detail")}>Reset</Button>}>
          {Object.entries(state.detail).map(([k, v]) => <Field key={k} label={k} hint={String(v)}><Slider min={k === "sharpenRadius" ? 1 : 0} max={100} value={v} onChange={(e) => patch((p) => ({ ...p, detail: { ...p.detail, [k]: Number(e.target.value) } }))} /></Field>)}
        </Collapsible></div> : null}

        {(mobileTool === "geometry") ? <div ref={setSectionRef("geometry")}><Collapsible icon={<SectionIcon kind="geometry" />} title="Geometry" right={<Button variant="ghost" onClick={() => resetSection("geometry")}>Reset</Button>}>
          <div className="mb-2 rounded-xl border border-slate-300/70 bg-slate-100/90 p-2.5 text-[11px] leading-relaxed text-slate-700 dark:border-slate-600/70 dark:bg-slate-950/35 dark:text-slate-300">
            Android-like quick tools: straighten, flip, free crop, and common aspect ratios for stories and wallpapers.
          </div>
          <Field label="Crop mode">
            <Select value={state.geometry.cropShapeMode} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, cropShapeMode: e.target.value as "rect" | "quad" } }))}>
              <option value="rect">Rectangle crop</option>
              <option value="quad">Custom edge shape</option>
            </Select>
          </Field>
          <div className="mb-3 flex flex-wrap gap-2">
            {GEOMETRY_RATIO_PRESETS.map((preset) => <button
              key={preset.key}
              type="button"
              className={`rounded-xl border px-2.5 py-1 text-xs font-semibold transition ${state.geometry.ratioPreset === preset.key ? "border-sky-400 bg-sky-100 text-sky-700 dark:border-sky-300 dark:bg-sky-500/15 dark:text-sky-200" : "border-slate-300 text-slate-700 hover:border-slate-500 dark:border-slate-600/80 dark:text-slate-300 dark:hover:border-slate-400"}`}
              onClick={() => applyRatioPreset(preset.key)}
            >
              {preset.label}
            </button>)}
          </div>
          <Field label="Straighten" hint={`${formatControlValue(state.geometry.rotate, 1)}°`}><Slider min={-45} max={45} step={0.1} value={state.geometry.rotate} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, rotate: Number(e.target.value) } }))} /></Field>
          <div className="my-2 grid grid-cols-4 gap-2">
            <Button variant="ghost" onClick={() => nudgeGeometryRotate(-1)}>↺ 1°</Button>
            <Button variant="ghost" onClick={() => nudgeGeometryRotate(1)}>↻ 1°</Button>
            <Button variant="ghost" onClick={() => patch((p) => ({ ...p, geometry: { ...p.geometry, flipH: !p.geometry.flipH } }))}>Flip H</Button>
            <Button variant="ghost" onClick={() => patch((p) => ({ ...p, geometry: { ...p.geometry, flipV: !p.geometry.flipV } }))}>Flip V</Button>
          </div>

          {state.geometry.cropShapeMode === "rect" ? <div className="grid grid-cols-2 gap-2">
            <Field label="Crop Left" hint={`${formatControlValue(state.geometry.cropX, 1)}%`}><Slider min={0} max={95} step={0.2} value={state.geometry.cropX} onChange={(e) => patchGeometryCrop("cropX", Number(e.target.value))} /></Field>
            <Field label="Crop Top" hint={`${formatControlValue(state.geometry.cropY, 1)}%`}><Slider min={0} max={95} step={0.2} value={state.geometry.cropY} onChange={(e) => patchGeometryCrop("cropY", Number(e.target.value))} /></Field>
            <Field label="Crop Width" hint={`${formatControlValue(state.geometry.cropW, 1)}%`}><Slider min={5} max={100} step={0.2} value={state.geometry.cropW} onChange={(e) => patchGeometryCrop("cropW", Number(e.target.value))} /></Field>
            <Field label="Crop Height" hint={`${formatControlValue(state.geometry.cropH, 1)}%`}><Slider min={5} max={100} step={0.2} value={state.geometry.cropH} onChange={(e) => patchGeometryCrop("cropH", Number(e.target.value))} /></Field>
          </div> : <div className="rounded-lg border border-slate-300/70 bg-slate-100/80 p-2 text-xs text-slate-700 dark:border-slate-600/70 dark:bg-slate-950/35 dark:text-slate-300">Drag any corner or edge point in preview to shape the crop polygon, then tap Done.</div>}
          <div className="mt-2 flex justify-end">
            <Button variant="ghost" onClick={commitCropSelection}>Done (apply crop)</Button>
          </div>

          <div className="grid grid-cols-2 gap-2"><Field label="Width"><Input type="number" min={1} value={state.geometry.resizeW} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, resizeW: Number(e.target.value) } }))} /></Field><Field label="Height"><Input type="number" min={1} value={state.geometry.resizeH} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, resizeH: Number(e.target.value) } }))} /></Field></div>
          <Field label="Perspective V" hint={String(state.geometry.perspectiveV)}><Slider min={-100} max={100} value={state.geometry.perspectiveV} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, perspectiveV: Number(e.target.value) } }))} /></Field>
          <Field label="Perspective H" hint={String(state.geometry.perspectiveH)}><Slider min={-100} max={100} value={state.geometry.perspectiveH} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, perspectiveH: Number(e.target.value) } }))} /></Field>
          <Field label="Lens distortion" hint={String(state.geometry.lensDistortion)}><Slider min={-100} max={100} value={state.geometry.lensDistortion} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, lensDistortion: Number(e.target.value) } }))} /></Field>
          <Field label="Vignette" hint={String(state.geometry.vignette)}><Slider min={0} max={100} value={state.geometry.vignette} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, vignette: Number(e.target.value) } }))} /></Field>
          <Field label="Smoothing"><Select value={state.geometry.smoothingQuality} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, smoothingQuality: e.target.value as "low" | "medium" | "high" } }))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></Select></Field>
        </Collapsible></div> : null}

        {(mobileTool === "advanced") ? <div ref={setSectionRef("advanced")}><Collapsible icon={<SectionIcon kind="advanced" />} title="Advanced" right={<Button variant="ghost" onClick={() => resetSection("advanced")}>Reset</Button>}>
          <Field label="Gamma" hint={state.advanced.gamma.toFixed(2)}><Slider min={0.2} max={3} step={0.01} value={state.advanced.gamma} onChange={(e) => patch((p) => ({ ...p, advanced: { ...p.advanced, gamma: Number(e.target.value) } }))} /></Field>
          {(["r", "g", "b"] as const).map((row) => <div key={row} className="grid grid-cols-3 gap-2">{(["r", "g", "b"] as const).map((col) => <Field key={`${row}${col}`} label={`${row.toUpperCase()}←${col.toUpperCase()}`}><Slider min={-200} max={200} value={state.advanced.channelMixer[row][col]} onChange={(e) => patch((p) => ({ ...p, advanced: { ...p.advanced, channelMixer: { ...p.advanced.channelMixer, [row]: { ...p.advanced.channelMixer[row], [col]: Number(e.target.value) } } } }))} /></Field>)}</div>)}
          <div className="flex gap-2 my-2"><Button variant="ghost" onClick={() => patch((p) => ({ ...p, advanced: { ...p.advanced, labMode: !p.advanced.labMode } }))}>{state.advanced.labMode ? "LAB On" : "LAB Off"}</Button><Button variant="ghost" onClick={() => patch((p) => ({ ...p, advanced: { ...p.advanced, edgePreview: !p.advanced.edgePreview } }))}>{state.advanced.edgePreview ? "Edge On" : "Edge Off"}</Button></div>
          <Field label="High Pass" hint={String(state.advanced.highPass)}><Slider min={0} max={100} value={state.advanced.highPass} onChange={(e) => patch((p) => ({ ...p, advanced: { ...p.advanced, highPass: Number(e.target.value) } }))} /></Field>
          <Field label="3D LUT (.cube)"><Input type="file" accept=".cube" onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const lut = await parseCube(f);
            if (!lut) setToast({ open: true, message: "Invalid LUT file", type: "error" });
            else setLut3d(lut);
          }} /></Field>
        </Collapsible></div> : null}

        {(mobileTool === "export") ? <div ref={setSectionRef("export")}><Collapsible icon={<SectionIcon kind="export" />} title="Export Settings">
          <Field label="Format"><Select value={state.export.format} onChange={(e) => patch((p) => ({ ...p, export: { ...p.export, format: e.target.value as EditorState["export"]["format"] } }))}><option value="png">PNG</option><option value="jpg">JPG</option><option value="webp">WebP</option><option value="avif">AVIF</option></Select></Field>
          <Field label="Quality" hint={String(state.export.quality)}><Slider min={1} max={100} value={state.export.quality} onChange={(e) => patch((p) => ({ ...p, export: { ...p.export, quality: Number(e.target.value) } }))} /></Field>
          <Field label="Bit depth"><Select value={state.export.bitDepth} onChange={(e) => patch((p) => ({ ...p, export: { ...p.export, bitDepth: e.target.value as EditorState["export"]["bitDepth"] } }))}><option value="8-bit">8-bit (standard web)</option><option value="16-bit">16-bit (reduced banding)</option><option value="32-bit">32-bit (float workflow simulation)</option><option value="64-bit">64-bit (max grading headroom)</option></Select></Field>
          <Field label="Color space"><Select value={state.export.colorSpace} onChange={(e) => patch((p) => ({ ...p, export: { ...p.export, colorSpace: e.target.value as EditorState["export"]["colorSpace"] } }))}><option value="sRGB">sRGB</option><option value="Display-P3">Display-P3</option><option value="Adobe RGB">Adobe RGB</option><option value="ProPhoto RGB">ProPhoto RGB</option><option value="Rec.2020">Rec.2020</option><option value="Linear sRGB">Linear sRGB</option></Select></Field>
          <div className="flex gap-2 mb-2"><Button variant="ghost" onClick={() => patch((p) => ({ ...p, export: { ...p.export, resizeOnExport: !p.export.resizeOnExport } }))}>{state.export.resizeOnExport ? "Resize on" : "Resize off"}</Button></div>
          {state.export.resizeOnExport ? <div className="grid grid-cols-2 gap-2"><Field label="Width"><Input type="number" min={1} value={state.export.width} onChange={(e) => patch((p) => ({ ...p, export: { ...p.export, width: Number(e.target.value) } }))} /></Field><Field label="Height"><Input type="number" min={1} value={state.export.height} onChange={(e) => patch((p) => ({ ...p, export: { ...p.export, height: Number(e.target.value) } }))} /></Field></div> : null}
          <p className="text-xs text-slate-500">Estimated file size: {fileSizePreview}</p>
          <p className="text-xs text-slate-500">Bit depth multiplier: ×{BIT_DEPTH_FACTORS[state.export.bitDepth]} (higher depth keeps more tonal precision during export pipeline).</p>
          <Button className="w-full" disabled={!file || busy} onClick={async () => {
            if (!previewCanvasRef.current || !file) return;
            const out = document.createElement("canvas");
            await applyPipeline(out, true, false, true);
            const mime = state.export.format === "jpg" ? "image/jpeg" : `image/${state.export.format}`;
            const blob = await new Promise<Blob | null>((r) => out.toBlob((b) => r(b), mime, state.export.quality / 100));
            if (!blob) return;
            if (preparedExportUrlRef.current) URL.revokeObjectURL(preparedExportUrlRef.current);
            const nextUrl = URL.createObjectURL(blob);
            preparedExportUrlRef.current = nextUrl;
            const ext = state.export.format === "jpg" ? "jpg" : state.export.format;
            setPreparedExport({ url: nextUrl, name: `edited.${ext}`, size: `${(blob.size / 1024).toFixed(1)} KB` });
            setSettings((p) => ({ ...p, quality: state.export.quality, out: state.export.format === "jpg" ? "jpeg" : state.export.format as any }));
          }}>Prepare export</Button>
          {preparedExport ? <div className="mt-2 rounded-xl bg-slate-100 p-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">Ready to download: <b>{preparedExport.name}</b> · {preparedExport.size}<Button className="mt-2 w-full" onClick={() => {
            const a = document.createElement("a");
            a.href = preparedExport.url;
            a.download = preparedExport.name;
            a.click();
          }}>Download final image</Button></div> : null}
        </Collapsible>
        </div> : null}
      </div>
      </div> : null}

      <div className="absolute inset-x-4 bottom-4 z-30">
        <div className="mx-auto w-full overflow-x-auto rounded-2xl border border-slate-600/60 bg-slate-950/70 px-3 py-2 [scrollbar-width:thin]">
          <div className="flex min-w-max items-center justify-center gap-2">
          {SECTION_ITEMS.map((item) => <button
            key={item.key}
            type="button"
            aria-label={item.label}
            className={`flex h-12 w-12 items-center justify-center rounded-xl border transition ${mobileTool === item.key && showSettingsMobile ? "border-sky-300 bg-sky-500/10 text-sky-200" : "border-slate-500 bg-transparent text-slate-200 hover:border-slate-300"}`}
            onClick={() => {
              if (mobileTool === item.key) {
                setShowSettingsMobile((v) => !v);
                return;
              }
              setMobileTool(item.key);
              setShowSettingsMobile(true);
            }}
          >
            <SectionIcon kind={item.key} />
          </button>)}
          </div>
        </div>
      </div>
    </div>
  </>;
}
