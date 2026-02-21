import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    bitDepth: "8-bit";
    colorSpace: "sRGB";
    resizeOnExport: boolean;
    width: number;
    height: number;
  };
};

type LUT3D = { size: number; table: Float32Array } | null;

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

function Collapsible({ title, defaultOpen = true, right, children }: { title: string; defaultOpen?: boolean; right?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return <div className="rounded-2xl border border-slate-200 bg-slate-50/80">
    <button className="w-full px-4 py-3 flex justify-between items-center" onClick={() => setOpen((v) => !v)}>
      <span className="font-semibold text-slate-800">{title}</span>
      <span className="flex items-center gap-3">{right}{open ? "−" : "+"}</span>
    </button>
    {open ? <div className="px-4 pb-4">{children}</div> : null}
  </div>;
}

export function UpscaleTab({ setSettings }: { settings: CommonRasterSettings; setSettings: (up: (p: CommonRasterSettings) => CommonRasterSettings) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [toast, setToast] = useState<ToastState>({ open: false, message: "" });
  const [curveChannel, setCurveChannel] = useState<CurveChannel>("rgb");
  const [lut3d, setLut3d] = useState<LUT3D>(null);
  const [fileSizePreview, setFileSizePreview] = useState("-");
  const [busy, setBusy] = useState(false);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const histCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const curveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragPointRef = useRef<number | null>(null);

  const { present: state, commit, undo, redo, past, future } = useHistory(defaultState);

  const patch = useCallback((updater: (prev: EditorState) => EditorState) => commit(updater(state)), [commit, state]);

  const resetSection = (section: keyof EditorState) => patch((p) => ({ ...p, [section]: defaultState[section] }));
  const resetAll = () => { commit(defaultState); setLut3d(null); };

  const loadImage = useCallback(async (f: File) => {
    const bmp = await createImageBitmap(f);
    const c = sourceCanvasRef.current || document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d")?.drawImage(bmp, 0, 0);
    sourceCanvasRef.current = c;
    bmp.close();
    patch((p) => ({ ...p, geometry: { ...p.geometry, resizeW: c.width, resizeH: c.height }, export: { ...p.export, width: c.width, height: c.height } }));
  }, [patch]);

  const applyPipeline = useCallback(async (target: HTMLCanvasElement, forExport = false) => {
    const src = sourceCanvasRef.current;
    if (!src) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 0));
    const g = state.geometry;
    const cropX = Math.round((g.cropX / 100) * src.width), cropY = Math.round((g.cropY / 100) * src.height);
    const cropW = Math.max(1, Math.round((g.cropW / 100) * src.width)), cropH = Math.max(1, Math.round((g.cropH / 100) * src.height));
    const outW = forExport && state.export.resizeOnExport ? state.export.width : g.resizeW || cropW;
    const outH = forExport && state.export.resizeOnExport ? state.export.height : g.resizeH || cropH;

    const temp = document.createElement("canvas");
    temp.width = outW; temp.height = outH;
    const tctx = temp.getContext("2d");
    if (!tctx) return;
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = g.smoothingQuality;
    tctx.translate(outW / 2, outH / 2);
    tctx.rotate((g.rotate * Math.PI) / 180);
    tctx.transform(1, g.perspectiveV / 100, g.perspectiveH / 100, 1, 0, 0);
    tctx.scale(g.flipH ? -1 : 1, g.flipV ? -1 : 1);
    tctx.drawImage(src, cropX, cropY, cropW, cropH, -outW / 2, -outH / 2, outW, outH);

    const ctx = temp.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const image = ctx.getImageData(0, 0, outW, outH);
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

      d[i] = clamp(r); d[i + 1] = clamp(g1); d[i + 2] = clamp(b);
    }

    const blurred = new Uint8ClampedArray(d);
    if (state.detail.sharpenAmount > 0 || state.detail.noiseLuma > 0 || state.detail.noiseColor > 0 || state.detail.clarity !== 0 || state.detail.texture !== 0 || state.detail.dehaze !== 0 || state.advanced.highPass > 0 || state.advanced.edgePreview) {
      const rad = Math.max(1, Math.round(state.detail.sharpenRadius));
      for (let y = 0; y < outH; y++) {
        for (let x = 0; x < outW; x++) {
          const i = (y * outW + x) * 4;
          const n = sampleNeighborhood(d, outW, outH, x, y, Math.max(1, rad));
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
      const cx = outW / 2, cy = outH / 2;
      const maxDist = Math.sqrt(cx * cx + cy * cy);
      for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
        const i = (y * outW + x) * 4;
        const dx = x - cx, dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
        const vig = 1 - (g.vignette / 100) * Math.pow(dist, 1.8);
        const distort = 1 + (g.lensDistortion / 100) * dist * 0.2;
        d[i] = clamp(d[i] * vig * distort); d[i + 1] = clamp(d[i + 1] * vig * distort); d[i + 2] = clamp(d[i + 2] * vig * distort);
      }
    }

    ctx.putImageData(image, 0, 0);
    target.width = outW; target.height = outH;
    target.getContext("2d")?.drawImage(temp, 0, 0);
    setBusy(false);
  }, [lut3d, state]);

  useEffect(() => {
    if (!previewCanvasRef.current || !sourceCanvasRef.current) return;
    const id = requestAnimationFrame(() => {
      applyPipeline(previewCanvasRef.current as HTMLCanvasElement, false).then(async () => {
        const blob = await new Promise<Blob | null>((r) => previewCanvasRef.current?.toBlob((b) => r(b), "image/jpeg", state.export.quality / 100));
        setFileSizePreview(blob ? `${(blob.size / 1024).toFixed(1)} KB` : "-");
      });
    });
    return () => cancelAnimationFrame(id);
  }, [state, applyPipeline]);

  useEffect(() => {
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
  }, [state]);

  useEffect(() => {
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
  }, [state.toneCurve, curveChannel]);

  return <>
    <Toast state={toast} onClose={() => setToast((t) => ({ ...t, open: false }))} />
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-4">
        <Card title="Adjustments" subtitle="Professional browser photo editor">
          <Dropzone accept={ACCEPT} label="Drop image" helper="All processing is client-side." onFiles={async (files) => {
            const f = files[0];
            if (!f) return;
            setFile(f);
            await loadImage(f);
          }} />
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-900/95 p-3 min-h-[280px] flex items-center justify-center relative">
            {!file ? <span className="text-slate-400 text-sm">Load an image to begin editing.</span> : <canvas ref={previewCanvasRef} className="max-h-[520px] max-w-full rounded-lg" />}
            {busy ? <div className="absolute inset-0 bg-slate-900/55 flex items-center justify-center text-slate-100 text-sm">Processing…</div> : null}
          </div>
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Workflow" right={<Button variant="ghost" onClick={resetAll}>Reset All</Button>}>
          <div className="flex gap-2 mb-3">
            <Button variant="ghost" disabled={!past.length} onClick={undo}>Undo</Button>
            <Button variant="ghost" disabled={!future.length} onClick={redo}>Redo</Button>
          </div>
          <Field label="Histogram"><canvas ref={histCanvasRef} className="w-full rounded-lg border border-slate-700" /></Field>
        </Card>

        <Collapsible title="Basic Tone" right={<Button variant="ghost" onClick={() => resetSection("basicTone")}>Reset</Button>}>
          {Object.entries(state.basicTone).map(([k, v]) => <Field key={k} label={k[0].toUpperCase() + k.slice(1)} hint={String(v)}><Slider min={k === "exposure" ? -5 : -100} max={k === "exposure" ? 5 : 100} step={k === "exposure" ? 0.1 : 1} value={v} onChange={(e) => patch((p) => ({ ...p, basicTone: { ...p.basicTone, [k]: Number(e.target.value) } }))} /></Field>)}
        </Collapsible>

        <Collapsible title="Tone Curve" right={<Button variant="ghost" onClick={() => resetSection("toneCurve")}>Reset</Button>}>
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
        </Collapsible>

        <Collapsible title="Color" right={<Button variant="ghost" onClick={() => resetSection("color")}>Reset</Button>}>
          {(["temperature", "tint", "vibrance", "saturation"] as const).map((k) => <Field key={k} label={k} hint={String(state.color[k])}><Slider min={-100} max={100} value={state.color[k]} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, [k]: Number(e.target.value) } }))} /></Field>)}
          {HSL_RANGES.map((range) => <div className="grid grid-cols-3 gap-2" key={range}>
            <Field label={`${range} H`} hint={String(state.color.hsl[range].hue)}><Slider min={-100} max={100} value={state.color.hsl[range].hue} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, hsl: { ...p.color.hsl, [range]: { ...p.color.hsl[range], hue: Number(e.target.value) } } } }))} /></Field>
            <Field label="S" hint={String(state.color.hsl[range].sat)}><Slider min={-100} max={100} value={state.color.hsl[range].sat} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, hsl: { ...p.color.hsl, [range]: { ...p.color.hsl[range], sat: Number(e.target.value) } } } }))} /></Field>
            <Field label="L" hint={String(state.color.hsl[range].lum)}><Slider min={-100} max={100} value={state.color.hsl[range].lum} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, hsl: { ...p.color.hsl, [range]: { ...p.color.hsl[range], lum: Number(e.target.value) } } } }))} /></Field>
          </div>)}
        </Collapsible>

        <Collapsible title="Color Grading" right={<Button variant="ghost" onClick={() => resetSection("grading")}>Reset</Button>}>
          {(["shadows", "midtones", "highlights"] as const).map((tone) => <div className="grid grid-cols-3 gap-2" key={tone}>
            <Field label={`${tone} hue`} hint={String(state.grading[tone].hue)}><Slider min={0} max={360} value={state.grading[tone].hue} onChange={(e) => patch((p) => ({ ...p, grading: { ...p.grading, [tone]: { ...p.grading[tone], hue: Number(e.target.value) } } }))} /></Field>
            <Field label="sat" hint={String(state.grading[tone].sat)}><Slider min={0} max={100} value={state.grading[tone].sat} onChange={(e) => patch((p) => ({ ...p, grading: { ...p.grading, [tone]: { ...p.grading[tone], sat: Number(e.target.value) } } }))} /></Field>
            <Field label="lum" hint={String(state.grading[tone].lum)}><Slider min={-100} max={100} value={state.grading[tone].lum} onChange={(e) => patch((p) => ({ ...p, grading: { ...p.grading, [tone]: { ...p.grading[tone], lum: Number(e.target.value) } } }))} /></Field>
          </div>)}
        </Collapsible>

        <Collapsible title="Detail" right={<Button variant="ghost" onClick={() => resetSection("detail")}>Reset</Button>}>
          {Object.entries(state.detail).map(([k, v]) => <Field key={k} label={k} hint={String(v)}><Slider min={k === "sharpenRadius" ? 1 : 0} max={100} value={v} onChange={(e) => patch((p) => ({ ...p, detail: { ...p.detail, [k]: Number(e.target.value) } }))} /></Field>)}
        </Collapsible>

        <Collapsible title="Geometry" right={<Button variant="ghost" onClick={() => resetSection("geometry")}>Reset</Button>}>
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
        </Collapsible>

        <Collapsible title="Advanced" right={<Button variant="ghost" onClick={() => resetSection("advanced")}>Reset</Button>}>
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
        </Collapsible>

        <Collapsible title="Export Settings">
          <Field label="Format"><Select value={state.export.format} onChange={(e) => patch((p) => ({ ...p, export: { ...p.export, format: e.target.value as EditorState["export"]["format"] } }))}><option value="png">PNG</option><option value="jpg">JPG</option><option value="webp">WebP</option><option value="avif">AVIF</option></Select></Field>
          <Field label="Quality" hint={String(state.export.quality)}><Slider min={1} max={100} value={state.export.quality} onChange={(e) => patch((p) => ({ ...p, export: { ...p.export, quality: Number(e.target.value) } }))} /></Field>
          <Field label="Bit depth"><Select value={state.export.bitDepth}><option value="8-bit">8-bit</option></Select></Field>
          <Field label="Color space"><Select value={state.export.colorSpace}><option value="sRGB">sRGB</option></Select></Field>
          <div className="flex gap-2 mb-2"><Button variant="ghost" onClick={() => patch((p) => ({ ...p, export: { ...p.export, resizeOnExport: !p.export.resizeOnExport } }))}>{state.export.resizeOnExport ? "Resize on" : "Resize off"}</Button></div>
          {state.export.resizeOnExport ? <div className="grid grid-cols-2 gap-2"><Field label="Width"><Input type="number" min={1} value={state.export.width} onChange={(e) => patch((p) => ({ ...p, export: { ...p.export, width: Number(e.target.value) } }))} /></Field><Field label="Height"><Input type="number" min={1} value={state.export.height} onChange={(e) => patch((p) => ({ ...p, export: { ...p.export, height: Number(e.target.value) } }))} /></Field></div> : null}
          <p className="text-xs text-slate-500">Estimated file size: {fileSizePreview}</p>
          <Button className="w-full" disabled={!file || busy} onClick={async () => {
            if (!previewCanvasRef.current || !file) return;
            const out = document.createElement("canvas");
            await applyPipeline(out, true);
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
      </div>
    </div>
  </>;
}
