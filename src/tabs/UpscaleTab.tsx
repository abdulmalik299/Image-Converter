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
const PREVIEW_MAX_DIMENSION = 2048;

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
  const equals = useCallback((a: T, b: T) => JSON.stringify(a) === JSON.stringify(b), []);

  const commit = useCallback((next: T) => {
    setPresent((current) => {
      if (equals(current, next)) return current;
      setPast((p) => [...p.slice(-30), current]);
      setFuture([]);
      return next;
    });
  }, [equals]);
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
  return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}

function Collapsible({ title, defaultOpen = true, right, children, icon }: { title: string; defaultOpen?: boolean; right?: React.ReactNode; children: React.ReactNode; icon: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return <div className="rounded-2xl border border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/70">
    <div className="w-full px-4 py-3 flex items-center gap-3">
      <button type="button" className="flex-1 flex justify-between items-center" onClick={() => setOpen((v) => !v)}>
        <span className="font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center gap-2">{icon}{title}</span>
        <span>{open ? "−" : "+"}</span>
      </button>
      {right ? <div onClick={(e) => e.stopPropagation()}>{right}</div> : null}
    </div>
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
  const toolbarBtnClass = `h-10 w-10 rounded-full p-0 text-slate-100 shadow-none ${isMobile ? "border-0 bg-transparent ring-0 hover:bg-slate-800/45" : "border border-slate-400/70 bg-transparent hover:border-sky-400 hover:bg-slate-800/30"}`;
  const toolbarToggleBtnClass = `h-10 w-10 rounded-full p-0 text-slate-100 shadow-none ${isMobile ? "border-0 bg-transparent ring-0 hover:bg-slate-800/45" : "border border-slate-400/70 bg-transparent hover:border-sky-400 hover:bg-slate-800/30"}`;
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
    const originalCanvas = sourceCanvasRef.current || document.createElement("canvas");
    originalCanvas.width = bmp.width;
    originalCanvas.height = bmp.height;
    originalCanvas.getContext("2d")?.drawImage(bmp, 0, 0);
    sourceCanvasRef.current = originalCanvas;

    const previewScale = Math.min(1, PREVIEW_MAX_DIMENSION / Math.max(bmp.width, bmp.height));
    const previewCanvas = previewSourceCanvasRef.current || document.createElement("canvas");
    previewCanvas.width = Math.max(1, Math.round(bmp.width * previewScale));
    previewCanvas.height = Math.max(1, Math.round(bmp.height * previewScale));
    const previewCtx = previewCanvas.getContext("2d");
    if (previewCtx) {
      previewCtx.imageSmoothingEnabled = true;
      previewCtx.imageSmoothingQuality = "high";
      previewCtx.drawImage(bmp, 0, 0, previewCanvas.width, previewCanvas.height);
      previewSourceCanvasRef.current = previewCanvas;
    }

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
    const cropX = Math.round((g.cropX / 100) * src.width), cropY = Math.round((g.cropY / 100) * src.height);
    const cropW = Math.max(1, Math.round((g.cropW / 100) * src.width)), cropH = Math.max(1, Math.round((g.cropH / 100) * src.height));
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
    const renderScale = !forExport && lightweight ? 0.45 : 1;
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
    }, isInteracting ? 90 : 35);
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
        <Button variant="ghost" className={toolbarBtnClass} title="Undo" aria-label="Undo" disabled={!past.length} onClick={undo}><ToolbarIcon kind="undo" /></Button>
        <Button variant="ghost" className={toolbarBtnClass} title="Redo" aria-label="Redo" disabled={!future.length} onClick={redo}><ToolbarIcon kind="redo" /></Button>
        <Button variant="ghost" className={toolbarBtnClass} title="Fit preview" aria-label="Fit preview" onClick={() => { setZoom("fit"); setZoomLevel(1); }}><ToolbarIcon kind="fit" /></Button>
        <Button variant="ghost" className={toolbarBtnClass} title="Actual size" aria-label="Actual size" onClick={() => { setZoom("100"); setZoomLevel(1); }}><ToolbarIcon kind="actual" /></Button>
        <Button variant="ghost" className={toolbarBtnClass} title="Zoom out" aria-label="Zoom out" onClick={() => { setZoom("custom"); setZoomLevel((z) => Math.max(0.25, z - 0.1)); }}><ToolbarIcon kind="zoomOut" /></Button>
        <Button variant="ghost" className={toolbarBtnClass} title="Zoom in" aria-label="Zoom in" onClick={() => { setZoom("custom"); setZoomLevel((z) => Math.min(3, z + 0.1)); }}><ToolbarIcon kind="zoomIn" /></Button>
        <Button variant={showBefore ? "primary" : "ghost"} className={toolbarToggleBtnClass} title="Before/after compare" aria-label="Before/after compare" onClick={() => setShowBefore((v) => !v)}><ToolbarIcon kind="compare" /></Button>
        <Button variant="ghost" className={toolbarBtnClass} title="Hold original" aria-label="Hold original" onMouseDown={() => setHoldBefore(true)} onMouseUp={() => setHoldBefore(false)} onMouseLeave={() => setHoldBefore(false)}><ToolbarIcon kind="hold" /></Button>
        <Button variant="ghost" className={toolbarBtnClass} title="Reset all adjustments" aria-label="Reset all adjustments" onClick={resetAll}><ToolbarIcon kind="reset" /></Button>
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
          <Button variant="ghost" className={toolbarBtnClass} title="Undo" aria-label="Undo" disabled={!past.length} onClick={undo}><ToolbarIcon kind="undo" /></Button>
          <Button variant="ghost" className={toolbarBtnClass} title="Redo" aria-label="Redo" disabled={!future.length} onClick={redo}><ToolbarIcon kind="redo" /></Button>
        </div>
        <div className="pointer-events-auto flex flex-wrap justify-start gap-2 sm:justify-end">
          <Button variant="ghost" className={toolbarBtnClass} title="Fit preview" aria-label="Fit preview" onClick={() => { setZoom("fit"); setZoomLevel(1); }}><ToolbarIcon kind="fit" /></Button>
          <Button variant="ghost" className={toolbarBtnClass} title="Actual size" aria-label="Actual size" onClick={() => { setZoom("100"); setZoomLevel(1); }}><ToolbarIcon kind="actual" /></Button>
          <Button variant="ghost" className={toolbarBtnClass} title="Zoom out" aria-label="Zoom out" onClick={() => { setZoom("custom"); setZoomLevel((z) => Math.max(0.25, z - 0.1)); }}><ToolbarIcon kind="zoomOut" /></Button>
          <Button variant="ghost" className={toolbarBtnClass} title="Zoom in" aria-label="Zoom in" onClick={() => { setZoom("custom"); setZoomLevel((z) => Math.min(3, z + 0.1)); }}><ToolbarIcon kind="zoomIn" /></Button>
          <Button variant={showBefore ? "primary" : "ghost"} className={toolbarToggleBtnClass} title="Before/after compare" aria-label="Before/after compare" onClick={() => setShowBefore((v) => !v)}><ToolbarIcon kind="compare" /></Button>
          <Button variant="ghost" className={toolbarBtnClass} title="Hold original" aria-label="Hold original" onMouseDown={() => setHoldBefore(true)} onMouseUp={() => setHoldBefore(false)} onMouseLeave={() => setHoldBefore(false)}><ToolbarIcon kind="hold" /></Button>
          <Button variant="ghost" className={toolbarBtnClass} title="Reset all adjustments" aria-label="Reset all adjustments" onClick={resetAll}><ToolbarIcon kind="reset" /></Button>
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
          {!file ? <span className="text-slate-400 text-sm">Load an image to begin editing.</span> : <canvas key={canvasRenderNonce} ref={previewCanvasRef} style={{ transform: `scale(${zoom === "fit" ? 1 : zoomLevel})` }} className="h-auto max-h-full w-auto max-w-full rounded-lg transition-transform" />}
          {busy ? <div className="absolute inset-0 bg-slate-900/55 flex items-center justify-center text-slate-100 text-sm">Preparing export…</div> : null}
          {(showBefore || holdBefore) ? <div className="absolute bottom-3 right-3 rounded bg-slate-900/80 px-2 py-1 text-xs text-white">Original view</div> : null}
          {!file ? <div className="absolute bottom-3 left-3 rounded bg-slate-900/70 px-2 py-1 text-xs text-slate-200">Tap preview to upload</div> : <div className="absolute bottom-3 left-3 rounded bg-slate-900/70 px-2 py-1 text-xs text-slate-200">Use × to remove and upload a new image</div>}
        </div>
      </div>

      {showSettingsMobile ? <div ref={sheetRef} {...sliderHandlers} className="absolute inset-x-4 bottom-20 z-30 max-h-[48vh] overflow-y-auto rounded-2xl border border-slate-500/70 bg-slate-900/82 p-3 shadow-xl backdrop-blur-md">
        <div className="space-y-4">
        {(mobileTool === "basicTone") ? <div ref={setSectionRef("basicTone")}><Collapsible icon={<SectionIcon kind="basicTone" />} title="Basic Tone" right={<Button variant="ghost" onClick={() => resetSection("basicTone")}>Reset</Button>}>
          {Object.entries(state.basicTone).map(([k, v]) => <Field key={k} label={k[0].toUpperCase() + k.slice(1)} hint={String(v)}><Slider min={k === "exposure" ? -5 : -100} max={k === "exposure" ? 5 : 100} step={k === "exposure" ? 0.1 : 1} value={v} onChange={(e) => patch((p) => ({ ...p, basicTone: { ...p.basicTone, [k]: Number(e.target.value) } }))} /></Field>)}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Exposure (precise)"><Input type="number" step={0.01} min={-5} max={5} value={state.basicTone.exposure} onChange={(e) => patch((p) => ({ ...p, basicTone: { ...p.basicTone, exposure: Number(e.target.value) } }))} /></Field>
            <Field label="Contrast (precise)"><Input type="number" step={0.1} min={-100} max={100} value={state.basicTone.contrast} onChange={(e) => patch((p) => ({ ...p, basicTone: { ...p.basicTone, contrast: Number(e.target.value) } }))} /></Field>
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

        {(mobileTool === "color") ? <div ref={setSectionRef("color")}><Collapsible icon={<SectionIcon kind="color" />} title="Color" right={<Button variant="ghost" onClick={() => resetSection("color")}>Reset</Button>}>
          {(["temperature", "tint", "vibrance", "saturation"] as const).map((k) => <Field key={k} label={k} hint={String(state.color[k])}><Slider min={-100} max={100} value={state.color[k]} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, [k]: Number(e.target.value) } }))} /></Field>)}
          {HSL_RANGES.map((range) => <div className="grid grid-cols-3 gap-2" key={range}>
            <Field label={`${range} H`} hint={String(state.color.hsl[range].hue)}><Slider min={-100} max={100} value={state.color.hsl[range].hue} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, hsl: { ...p.color.hsl, [range]: { ...p.color.hsl[range], hue: Number(e.target.value) } } } }))} /></Field>
            <Field label="S" hint={String(state.color.hsl[range].sat)}><Slider min={-100} max={100} value={state.color.hsl[range].sat} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, hsl: { ...p.color.hsl, [range]: { ...p.color.hsl[range], sat: Number(e.target.value) } } } }))} /></Field>
            <Field label="L" hint={String(state.color.hsl[range].lum)}><Slider min={-100} max={100} value={state.color.hsl[range].lum} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, hsl: { ...p.color.hsl, [range]: { ...p.color.hsl[range], lum: Number(e.target.value) } } } }))} /></Field>
          </div>)}
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
