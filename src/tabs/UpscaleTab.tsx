import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Button, Card, Field, Input, Select, Slider } from "../components/ui";
import { Dropzone } from "../components/Dropzone";
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

function applyColorSpaceTransform(r: number, g: number, b: number, colorSpace: EditorState["export"]["colorSpace"]) {
  if (colorSpace === "Display-P3") return { r: clamp(r * 1.03), g: clamp(g * 1.01), b: clamp(b * 1.06) };
  if (colorSpace === "Adobe RGB") return { r: clamp(r * 1.06), g: clamp(g * 1.03), b: clamp(b * 0.97) };
  if (colorSpace === "ProPhoto RGB") return { r: clamp(r * 1.09), g: clamp(g * 1.05), b: clamp(b * 1.03) };
  if (colorSpace === "Rec.2020") return { r: clamp(r * 1.04), g: clamp(g * 1.04), b: clamp(b * 1.08) };
  if (colorSpace === "Linear sRGB") return { r: clamp(Math.pow(r / 255, 2.2) * 255), g: clamp(Math.pow(g / 255, 2.2) * 255), b: clamp(Math.pow(b / 255, 2.2) * 255) };
  return { r, g, b };
}

const MOBILE_SLIDER_GROUPS: Partial<Record<SectionKey, Array<{ key: string; label: string; min: number; max: number; step?: number }>>> = {
  basicTone: [
    { key: "exposure", label: "Exposure", min: -5, max: 5, step: 0.1 },
    { key: "brightness", label: "Brightness", min: -100, max: 100 },
    { key: "contrast", label: "Contrast", min: -100, max: 100 },
    { key: "highlights", label: "Highlights", min: -100, max: 100 },
    { key: "shadows", label: "Shadows", min: -100, max: 100 },
    { key: "whites", label: "Whites", min: -100, max: 100 },
    { key: "blacks", label: "Blacks", min: -100, max: 100 }
  ],
  detail: [
    { key: "sharpenAmount", label: "Sharpen", min: 0, max: 100 },
    { key: "sharpenRadius", label: "Radius", min: 1, max: 100 },
    { key: "sharpenThreshold", label: "Threshold", min: 0, max: 100 },
    { key: "clarity", label: "Clarity", min: 0, max: 100 },
    { key: "texture", label: "Texture", min: 0, max: 100 },
    { key: "dehaze", label: "Dehaze", min: 0, max: 100 },
    { key: "noiseLuma", label: "Noise Luma", min: 0, max: 100 },
    { key: "noiseColor", label: "Noise Color", min: 0, max: 100 }
  ]
};

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
    smoothingQuality: "high"
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
    setPast((p) => [...p.slice(-30), present]);
    setPresent(next);
    setFuture([]);
  }, [present]);
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
    basicTone: <><circle cx="12" cy="12" r="7"/><path d="M12 8v8M8 12h8"/></>,
    toneCurve: <><path d="M4 16c3-5 6-8 16-8"/><path d="M4 6v14h16"/></>,
    color: <><circle cx="12" cy="12" r="8"/><path d="M12 4v8l6 2"/></>,
    grading: <><path d="M5 17h14"/><path d="M7 17V9m5 8V7m5 10v-5"/></>,
    detail: <><path d="M12 3l2.5 5 5.5.7-4 3.9 1 5.4-5-2.7-5 2.7 1-5.4-4-3.9 5.5-.7z"/></>,
    geometry: <><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8h8v8H8z"/></>,
    advanced: <><path d="M12 3v3m0 12v3M4.2 7.2l2.1 2.1m11.4 11.4 2.1 2.1M3 12h3m12 0h3M4.2 16.8l2.1-2.1m11.4-11.4 2.1-2.1"/></>,
    export: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><rect x="4" y="17" width="16" height="4" rx="1"/></>
  } as const;
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

function Collapsible({ title, defaultOpen = true, right, children, icon }: { title: string; defaultOpen?: boolean; right?: React.ReactNode; children: React.ReactNode; icon: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return <div className="rounded-2xl border border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/70">
    <button className="w-full px-4 py-3 flex justify-between items-center" onClick={() => setOpen((v) => !v)}>
      <span className="font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2">{icon}{title}</span>
      <span className="flex items-center gap-3">{right}{open ? "−" : "+"}</span>
    </button>
    {open ? <div className="px-4 pb-4">{children}</div> : null}
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
  const [showSettingsMobile, setShowSettingsMobile] = useState(false);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);
  const [mobileTool, setMobileTool] = useState<SectionKey>("basicTone");
  const [mobileSliderIndex, setMobileSliderIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(() => typeof document === "undefined" ? true : document.visibilityState === "visible");
  const [isInteracting, setIsInteracting] = useState(false);
  const [previewQualityMode, setPreviewQualityMode] = useState<"interactive" | "final">("final");
  const [sheetState, setSheetState] = useState<"collapsed"|"half"|"full">("half");
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const histCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const curveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragPointRef = useRef<number | null>(null);
  const renderTokenRef = useRef(0);
  const previewUrlRef = useRef<string | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const sliderInteractionDepthRef = useRef(0);
  const settleTimerRef = useRef<number | null>(null);
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

  const adjustmentActive = active && isDocumentVisible && (!isMobile || mobileEditorOpen);

  const onSliderInteractionStart = useCallback(() => {
    sliderInteractionDepthRef.current += 1;
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    setIsInteracting(true);
    setPreviewQualityMode("interactive");
  }, []);

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

  const selectMobileTool = useCallback((key: SectionKey) => {
    setMobileTool(key);
    setMobileSliderIndex(0);
  }, []);

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

  const onSheetHandlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
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
    const c = sourceCanvasRef.current || document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d")?.drawImage(bmp, 0, 0);
    sourceCanvasRef.current = c;
    bmp.close();
    patch((p) => ({ ...p, geometry: { ...p.geometry, resizeW: c.width, resizeH: c.height }, export: { ...p.export, width: c.width, height: c.height } }));
  }, [patch]);

  const applyPipeline = useCallback(async (target: HTMLCanvasElement, forExport = false, lightweight = false, showBusy = false) => {
    const src = sourceCanvasRef.current;
    if (!src) return;
    const token = ++renderTokenRef.current;
    if (showBusy) setBusy(true);
    await new Promise((r) => setTimeout(r, 0));
    if (token !== renderTokenRef.current) return;
    const g = state.geometry;
    const cropX = Math.round((g.cropX / 100) * src.width), cropY = Math.round((g.cropY / 100) * src.height);
    const cropW = Math.max(1, Math.round((g.cropW / 100) * src.width)), cropH = Math.max(1, Math.round((g.cropH / 100) * src.height));
    const outW = forExport && state.export.resizeOnExport ? state.export.width : g.resizeW || cropW;
    const outH = forExport && state.export.resizeOnExport ? state.export.height : g.resizeH || cropH;
    const renderScale = !forExport && lightweight ? 0.6 : 1;
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
      r += state.color.temperature * 0.5; b -= state.color.temperature * 0.5; g1 += state.color.tint * 0.4;

      let { h, s, l } = rgbToHsl(clamp(r), clamp(g1), clamp(b));
      s = clamp(s * 255 + state.color.saturation, 0, 255) / 255;
      const vibranceBoost = (state.color.vibrance / 100) * (1 - s) * 0.45;
      s = clamp((s + vibranceBoost) * 255, 0, 255) / 255;
      const range = state.color.hsl[mapHueRange(h)];
      h = (h + range.hue / 360 + 1) % 1;
      s = clamp((s + range.sat / 100) * 255, 0, 255) / 255;
      l = clamp((l + range.lum / 100) * 255, 0, 255) / 255;
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

    const blurred = new Uint8ClampedArray(d);
    if (state.detail.sharpenAmount > 0 || state.detail.noiseLuma > 0 || state.detail.noiseColor > 0 || state.detail.clarity !== 0 || state.detail.texture !== 0 || state.detail.dehaze !== 0 || state.advanced.highPass > 0 || state.advanced.edgePreview) {
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

    if (lut3d) {
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
    target.getContext("2d")?.drawImage(temp, 0, 0, outW, outH);
    setBusy(false);
  }, [lut3d, state]);

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
    if (!isMobile) {
      setMobileEditorOpen(false);
      setShowSettingsMobile(false);
      setSheetState("half");
    }
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || !mobileEditorOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isMobile, mobileEditorOpen]);

  useEffect(() => {
    if (adjustmentActive) return;
    renderTokenRef.current += 1;
    setBusy(false);
  }, [adjustmentActive]);

  useEffect(() => {
    if (!adjustmentActive || !previewCanvasRef.current || !sourceCanvasRef.current) return;
    const id = requestAnimationFrame(() => {
      if (showBefore || holdBefore) {
        const src = sourceCanvasRef.current as HTMLCanvasElement;
        const preview = previewCanvasRef.current as HTMLCanvasElement;
        preview.width = src.width;
        preview.height = src.height;
        preview.getContext("2d")?.drawImage(src, 0, 0);
        return;
      }
      applyPipeline(previewCanvasRef.current as HTMLCanvasElement, false, isInteracting || previewQualityMode === "interactive", false).then(async () => {
        const blob = await new Promise<Blob | null>((r) => previewCanvasRef.current?.toBlob((b) => r(b), "image/jpeg", state.export.quality / 100));
        setFileSizePreview(blob ? `${(blob.size / 1024).toFixed(1)} KB` : "-");
      });
    });
    return () => cancelAnimationFrame(id);
  }, [state, applyPipeline, adjustmentActive, showBefore, holdBefore, isInteracting, previewQualityMode]);

  useEffect(() => {
    if (!adjustmentActive) return;
    const canvas = histCanvasRef.current;
    const src = previewCanvasRef.current;
    if (!canvas || !src) return;
    const ctx = canvas.getContext("2d");
    const sctx = src.getContext("2d", { willReadFrequently: true });
    if (!ctx || !sctx) return;
    const img = sctx.getImageData(0, 0, src.width, src.height).data;
    const bins = new Array(256).fill(0);
    for (let i = 0; i < img.length; i += 4) bins[Math.round(0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2])]++;
    const max = Math.max(...bins, 1);
    canvas.width = 320; canvas.height = 120;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#38bdf8";
    bins.forEach((v, i) => {
      const h = (v / max) * canvas.height;
      ctx.fillRect((i / 256) * canvas.width, canvas.height - h, canvas.width / 256, h);
    });
  }, [state, adjustmentActive]);

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
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const sheetHeightClass = sheetState === "collapsed" ? "h-[120px]" : sheetState === "full" ? "h-[90vh]" : "h-[50vh]";

  const activeMobileSliderGroup = MOBILE_SLIDER_GROUPS[mobileTool] ?? null;
  const activeMobileSliderMeta = activeMobileSliderGroup?.[mobileSliderIndex] ?? null;

  const renderMobileSliderRow = () => {
    if (!activeMobileSliderMeta) return null;
    if (mobileTool === "basicTone") {
      const sliderKey = activeMobileSliderMeta.key as keyof EditorState["basicTone"];
      const value = state.basicTone[sliderKey];
      return <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-300"><span>{activeMobileSliderMeta.label}</span><span>{value}</span></div>
        <Slider min={activeMobileSliderMeta.min} max={activeMobileSliderMeta.max} step={activeMobileSliderMeta.step ?? 1} value={value} onChange={(e) => patch((p) => ({ ...p, basicTone: { ...p.basicTone, [sliderKey]: Number(e.target.value) } }))} />
      </div>;
    }
    if (mobileTool === "detail") {
      const sliderKey = activeMobileSliderMeta.key as keyof EditorState["detail"];
      const value = state.detail[sliderKey];
      return <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-300"><span>{activeMobileSliderMeta.label}</span><span>{value}</span></div>
        <Slider min={activeMobileSliderMeta.min} max={activeMobileSliderMeta.max} step={activeMobileSliderMeta.step ?? 1} value={value} onChange={(e) => patch((p) => ({ ...p, detail: { ...p.detail, [sliderKey]: Number(e.target.value) } }))} />
      </div>;
    }
    return null;
  };

  return <>
    <Toast state={toast} onClose={() => setToast((t) => ({ ...t, open: false }))} />
    <div className={isMobile && mobileEditorOpen ? "fixed inset-0 z-50 bg-slate-950 text-white" : "grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px] gap-4 h-[calc(100vh-14rem)]"} style={isMobile && mobileEditorOpen ? { paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" } : undefined}>
      {isMobile && mobileEditorOpen ? <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between border-b border-slate-700 bg-slate-900/95 px-3 py-2">
        <Button variant="ghost" className="!bg-transparent !text-slate-100" onClick={closeMobileEditor}>← Back</Button>
        <div className="text-sm font-semibold">Adjustments</div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" className="!bg-slate-800 !text-slate-100 px-3 py-1.5" onClick={resetAll}>Reset All</Button>
        </div>
      </div> : null}
      <div className={isMobile && mobileEditorOpen ? "h-full pt-12" : "lg:sticky lg:top-4 h-full"}>
        <Card title="Adjustments" subtitle="Professional browser photo editor">
          <Dropzone accept={ACCEPT} label="Drop image" helper="All processing is client-side." onFiles={async (files) => {
            const f = files[0];
            if (!f) return;
            setFile(f);
            await loadImage(f);
          }} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => { setZoom("fit"); setZoomLevel(1); }}>Fit</Button>
            <Button variant="ghost" onClick={() => { setZoom("100"); setZoomLevel(1); }}>100%</Button>
            <Button variant="ghost" onClick={() => { setZoom("custom"); setZoomLevel((z) => Math.max(0.25, z - 0.1)); }}>-</Button>
            <Button variant="ghost" onClick={() => { setZoom("custom"); setZoomLevel((z) => Math.min(3, z + 0.1)); }}>+</Button>
            <Button variant={showBefore ? "primary" : "ghost"} onClick={() => setShowBefore((v) => !v)}>Before/After</Button>
            <Button variant="ghost" onMouseDown={() => setHoldBefore(true)} onMouseUp={() => setHoldBefore(false)} onMouseLeave={() => setHoldBefore(false)}>Hold original</Button>
            {isMobile ? <Button variant="ghost" className="lg:hidden" onClick={openMobileEditor}>Open editor</Button> : null}
          </div>
          <div className={isMobile && mobileEditorOpen ? "mt-2 rounded-none border-0 bg-slate-900 p-3 h-[calc(100vh-8rem)] flex items-center justify-center relative overflow-hidden" : "mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-900/95 p-3 min-h-[280px] h-[min(64vh,680px)] flex items-center justify-center relative overflow-auto"}>
            {!file ? <span className="text-slate-400 text-sm">Load an image to begin editing.</span> : <canvas ref={previewCanvasRef} style={{ transform: `scale(${zoom === "fit" ? 1 : zoomLevel})` }} className="max-h-full max-w-full rounded-lg transition-transform" />}
            {busy ? <div className="absolute inset-0 bg-slate-900/55 flex items-center justify-center text-slate-100 text-sm">Exporting…</div> : null}
            {(showBefore || holdBefore) ? <div className="absolute bottom-3 right-3 rounded bg-slate-900/80 px-2 py-1 text-xs text-white">Original view</div> : null}
            {isMobile && mobileEditorOpen ? <button className="absolute top-2 left-2 rounded bg-slate-900/80 px-2 py-1 text-xs" onClick={() => { setShowSettingsMobile((v) => !v); if (showSettingsMobile) setSheetState("collapsed"); else setSheetState("half"); }}>{showSettingsMobile ? "Hide controls" : "Show controls"}</button> : null}
          </div>
        </Card>
      </div>
      <div ref={sheetRef} {...sliderHandlers} className={isMobile && mobileEditorOpen ? `fixed inset-x-0 bottom-0 z-30 rounded-t-3xl border border-slate-700 bg-slate-950/95 p-3 transition-[height] duration-150 ${showSettingsMobile ? sheetHeightClass : "h-[76px]"} overflow-hidden` : `${showSettingsMobile ? "block" : "hidden"} lg:block space-y-4 lg:overflow-y-auto h-full pr-1`}>
        {isMobile && mobileEditorOpen ? <div className="mb-2">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-500" onPointerDown={onSheetHandlePointerDown} />
          <div className="mt-2 flex items-center justify-between text-sm"><span>Controls</span><Button variant="ghost" onClick={() => setShowSettingsMobile((v) => !v)}>{showSettingsMobile ? "Collapse" : "Expand"}</Button></div>
          <div className="mt-2 flex gap-2 overflow-x-auto pb-2">{SECTION_ITEMS.map((item) => <button key={item.key} aria-label={item.label} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition ${mobileTool === item.key ? "border-sky-400 bg-sky-500/20 text-sky-200 opacity-100 shadow-[0_0_0_1px_rgba(56,189,248,.35)]" : "border-slate-700 text-slate-300 opacity-45"}`} onClick={() => selectMobileTool(item.key)}><SectionIcon kind={item.key} /></button>)}</div>
          {activeMobileSliderGroup ? <div className="mb-2 flex gap-2 overflow-x-auto pb-2">{activeMobileSliderGroup.map((slider, idx) => <button key={slider.key} className={`rounded-full px-2.5 py-1 text-[11px] ${mobileSliderIndex === idx ? "bg-slate-700 text-white" : "bg-slate-800/70 text-slate-300"}`} onClick={() => setMobileSliderIndex(idx)}>{slider.label}</button>)}</div> : null}
          {showSettingsMobile ? <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-2">{renderMobileSliderRow()}</div> : null}
        </div> : null}
        <div className={isMobile && mobileEditorOpen ? "h-[calc(100%-72px)] overflow-y-auto space-y-4 pr-1" : "space-y-4"}>
        <Card title="Workflow" right={<Button variant="ghost" onClick={resetAll}>Reset All</Button>}>
          <div className="flex gap-2 mb-3">
            <Button variant="ghost" disabled={!past.length} onClick={undo}>Undo</Button>
            <Button variant="ghost" disabled={!future.length} onClick={redo}>Redo</Button>
          </div>
          <Field label="Histogram"><canvas ref={histCanvasRef} className="w-full rounded-lg border border-slate-700" /></Field>
        </Card>

        {(!isMobile || !mobileEditorOpen || mobileTool === "basicTone") ? <div ref={setSectionRef("basicTone")}><Collapsible icon={<SectionIcon kind="basicTone" />} title="Basic Tone" right={<Button variant="ghost" onClick={() => resetSection("basicTone")}>Reset</Button>}>
          {Object.entries(state.basicTone).map(([k, v]) => <Field key={k} label={k[0].toUpperCase() + k.slice(1)} hint={String(v)}><Slider min={k === "exposure" ? -5 : -100} max={k === "exposure" ? 5 : 100} step={k === "exposure" ? 0.1 : 1} value={v} onChange={(e) => patch((p) => ({ ...p, basicTone: { ...p.basicTone, [k]: Number(e.target.value) } }))} /></Field>)}
        </Collapsible></div> : null}

        {(!isMobile || !mobileEditorOpen || mobileTool === "toneCurve") ? <div ref={setSectionRef("toneCurve")}><Collapsible icon={<SectionIcon kind="toneCurve" />} title="Tone Curve" right={<Button variant="ghost" onClick={() => resetSection("toneCurve")}>Reset</Button>}>
          <Field label="Channel"><Select value={curveChannel} onChange={(e) => setCurveChannel(e.target.value as CurveChannel)}><option value="rgb">RGB</option><option value="r">Red</option><option value="g">Green</option><option value="b">Blue</option></Select></Field>
          <canvas ref={curveCanvasRef} className="w-full rounded-lg mt-2 cursor-crosshair" onMouseDown={(e) => {
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

        {(!isMobile || !mobileEditorOpen || mobileTool === "color") ? <div ref={setSectionRef("color")}><Collapsible icon={<SectionIcon kind="color" />} title="Color" right={<Button variant="ghost" onClick={() => resetSection("color")}>Reset</Button>}>
          {(["temperature", "tint", "vibrance", "saturation"] as const).map((k) => <Field key={k} label={k} hint={String(state.color[k])}><Slider min={-100} max={100} value={state.color[k]} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, [k]: Number(e.target.value) } }))} /></Field>)}
          {HSL_RANGES.map((range) => <div className="grid grid-cols-3 gap-2" key={range}>
            <Field label={`${range} H`} hint={String(state.color.hsl[range].hue)}><Slider min={-100} max={100} value={state.color.hsl[range].hue} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, hsl: { ...p.color.hsl, [range]: { ...p.color.hsl[range], hue: Number(e.target.value) } } } }))} /></Field>
            <Field label="S" hint={String(state.color.hsl[range].sat)}><Slider min={-100} max={100} value={state.color.hsl[range].sat} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, hsl: { ...p.color.hsl, [range]: { ...p.color.hsl[range], sat: Number(e.target.value) } } } }))} /></Field>
            <Field label="L" hint={String(state.color.hsl[range].lum)}><Slider min={-100} max={100} value={state.color.hsl[range].lum} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, hsl: { ...p.color.hsl, [range]: { ...p.color.hsl[range], lum: Number(e.target.value) } } } }))} /></Field>
          </div>)}
        </Collapsible></div> : null}

        {(!isMobile || !mobileEditorOpen || mobileTool === "grading") ? <div ref={setSectionRef("grading")}><Collapsible icon={<SectionIcon kind="grading" />} title="Color Grading" right={<Button variant="ghost" onClick={() => resetSection("grading")}>Reset</Button>}>
          {(["shadows", "midtones", "highlights"] as const).map((tone) => <div className="grid grid-cols-3 gap-2" key={tone}>
            <Field label={`${tone} hue`} hint={String(state.grading[tone].hue)}><Slider min={0} max={360} value={state.grading[tone].hue} onChange={(e) => patch((p) => ({ ...p, grading: { ...p.grading, [tone]: { ...p.grading[tone], hue: Number(e.target.value) } } }))} /></Field>
            <Field label="sat" hint={String(state.grading[tone].sat)}><Slider min={0} max={100} value={state.grading[tone].sat} onChange={(e) => patch((p) => ({ ...p, grading: { ...p.grading, [tone]: { ...p.grading[tone], sat: Number(e.target.value) } } }))} /></Field>
            <Field label="lum" hint={String(state.grading[tone].lum)}><Slider min={-100} max={100} value={state.grading[tone].lum} onChange={(e) => patch((p) => ({ ...p, grading: { ...p.grading, [tone]: { ...p.grading[tone], lum: Number(e.target.value) } } }))} /></Field>
          </div>)}
        </Collapsible></div> : null}

        {(!isMobile || !mobileEditorOpen || mobileTool === "detail") ? <div ref={setSectionRef("detail")}><Collapsible icon={<SectionIcon kind="detail" />} title="Detail" right={<Button variant="ghost" onClick={() => resetSection("detail")}>Reset</Button>}>
          {Object.entries(state.detail).map(([k, v]) => <Field key={k} label={k} hint={String(v)}><Slider min={k === "sharpenRadius" ? 1 : 0} max={100} value={v} onChange={(e) => patch((p) => ({ ...p, detail: { ...p.detail, [k]: Number(e.target.value) } }))} /></Field>)}
        </Collapsible></div> : null}

        {(!isMobile || !mobileEditorOpen || mobileTool === "geometry") ? <div ref={setSectionRef("geometry")}><Collapsible icon={<SectionIcon kind="geometry" />} title="Geometry" right={<Button variant="ghost" onClick={() => resetSection("geometry")}>Reset</Button>}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Crop X"><Slider min={0} max={90} value={state.geometry.cropX} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, cropX: Number(e.target.value) } }))} /></Field>
            <Field label="Crop Y"><Slider min={0} max={90} value={state.geometry.cropY} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, cropY: Number(e.target.value) } }))} /></Field>
            <Field label="Crop W"><Slider min={10} max={100} value={state.geometry.cropW} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, cropW: Number(e.target.value) } }))} /></Field>
            <Field label="Crop H"><Slider min={10} max={100} value={state.geometry.cropH} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, cropH: Number(e.target.value) } }))} /></Field>
          </div>
          <Field label="Rotate" hint={`${state.geometry.rotate}°`}><Slider min={-180} max={180} value={state.geometry.rotate} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, rotate: Number(e.target.value) } }))} /></Field>
          <div className="flex gap-2 my-2"><Button variant="ghost" onClick={() => patch((p) => ({ ...p, geometry: { ...p.geometry, flipH: !p.geometry.flipH } }))}>Flip H</Button><Button variant="ghost" onClick={() => patch((p) => ({ ...p, geometry: { ...p.geometry, flipV: !p.geometry.flipV } }))}>Flip V</Button></div>
          <div className="grid grid-cols-2 gap-2"><Field label="Width"><Input type="number" min={1} value={state.geometry.resizeW} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, resizeW: Number(e.target.value) } }))} /></Field><Field label="Height"><Input type="number" min={1} value={state.geometry.resizeH} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, resizeH: Number(e.target.value) } }))} /></Field></div>
          <Field label="Perspective V" hint={String(state.geometry.perspectiveV)}><Slider min={-100} max={100} value={state.geometry.perspectiveV} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, perspectiveV: Number(e.target.value) } }))} /></Field>
          <Field label="Perspective H" hint={String(state.geometry.perspectiveH)}><Slider min={-100} max={100} value={state.geometry.perspectiveH} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, perspectiveH: Number(e.target.value) } }))} /></Field>
          <Field label="Lens distortion" hint={String(state.geometry.lensDistortion)}><Slider min={-100} max={100} value={state.geometry.lensDistortion} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, lensDistortion: Number(e.target.value) } }))} /></Field>
          <Field label="Vignette" hint={String(state.geometry.vignette)}><Slider min={0} max={100} value={state.geometry.vignette} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, vignette: Number(e.target.value) } }))} /></Field>
          <Field label="Smoothing"><Select value={state.geometry.smoothingQuality} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, smoothingQuality: e.target.value as "low" | "medium" | "high" } }))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></Select></Field>
        </Collapsible></div> : null}

        {(!isMobile || !mobileEditorOpen || mobileTool === "advanced") ? <div ref={setSectionRef("advanced")}><Collapsible icon={<SectionIcon kind="advanced" />} title="Advanced" right={<Button variant="ghost" onClick={() => resetSection("advanced")}>Reset</Button>}>
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

        {(!isMobile || !mobileEditorOpen || mobileTool === "export") ? <div ref={setSectionRef("export")}><Collapsible icon={<SectionIcon kind="export" />} title="Export Settings">
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
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `edited.${state.export.format === "jpg" ? "jpg" : state.export.format}`;
            a.click();
            URL.revokeObjectURL(a.href);
            setSettings((p) => ({ ...p, quality: state.export.quality, out: state.export.format === "jpg" ? "jpeg" : state.export.format as any }));
          }}>Export</Button>
        </Collapsible>
        </div> : null}
      </div>
    </div>
    </div>
  </>;
}
