import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AppShell, Button, Input, Select, Slider } from "./components/ui";

type CurvePoint = { x: number; y: number };
type RGB = "rgb" | "r" | "g" | "b";
type ColorRange = "red" | "orange" | "yellow" | "green" | "aqua" | "blue" | "purple" | "magenta";

type Settings = {
  basic: {
    exposure: number;
    brightness: number;
    contrast: number;
    highlights: number;
    shadows: number;
    whites: number;
    blacks: number;
  };
  toneCurve: Record<RGB, CurvePoint[]>;
  color: {
    temperature: number;
    tint: number;
    vibrance: number;
    saturation: number;
    hsl: Record<ColorRange, { hue: number; saturation: number; luminance: number }>;
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
    width: number;
    height: number;
    perspectiveV: number;
    perspectiveH: number;
    lens: number;
    vignette: number;
    smoothing: "low" | "medium" | "high";
  };
  advanced: {
    gamma: number;
    mixerR: [number, number, number];
    mixerG: [number, number, number];
    mixerB: [number, number, number];
    labMode: boolean;
    highPass: number;
    edgePreview: boolean;
  };
  export: {
    format: "image/png" | "image/jpeg" | "image/webp" | "image/avif";
    quality: number;
    bitDepth: "8";
    colorSpace: "sRGB";
    resizeEnabled: boolean;
    resizeW: number;
    resizeH: number;
  };
};

type HistoryState = { past: Settings[]; present: Settings; future: Settings[] };

type HistoryAction =
  | { type: "set"; value: Settings }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; value: Settings }
  | { type: "replace"; value: Settings };

const colorRanges: ColorRange[] = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"];

const defaultSettings = (): Settings => ({
  basic: { exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
  toneCurve: {
    rgb: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    r: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    g: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    b: [{ x: 0, y: 0 }, { x: 1, y: 1 }]
  },
  color: {
    temperature: 0,
    tint: 0,
    vibrance: 0,
    saturation: 0,
    hsl: Object.fromEntries(colorRanges.map((k) => [k, { hue: 0, saturation: 0, luminance: 0 }])) as Settings["color"]["hsl"]
  },
  grading: {
    shadows: { hue: 220, sat: 0, lum: 0 },
    midtones: { hue: 35, sat: 0, lum: 0 },
    highlights: { hue: 45, sat: 0, lum: 0 }
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
    width: 1920,
    height: 1080,
    perspectiveV: 0,
    perspectiveH: 0,
    lens: 0,
    vignette: 0,
    smoothing: "high"
  },
  advanced: {
    gamma: 1,
    mixerR: [100, 0, 0],
    mixerG: [0, 100, 0],
    mixerB: [0, 0, 100],
    labMode: false,
    highPass: 0,
    edgePreview: false
  },
  export: { format: "image/png", quality: 92, bitDepth: "8", colorSpace: "sRGB", resizeEnabled: false, resizeW: 1920, resizeH: 1080 }
});

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === "set") return { past: [...state.past, structuredClone(state.present)], present: action.value, future: [] };
  if (action.type === "undo") {
    if (!state.past.length) return state;
    const prev = state.past[state.past.length - 1];
    return { past: state.past.slice(0, -1), present: prev, future: [structuredClone(state.present), ...state.future] };
  }
  if (action.type === "redo") {
    if (!state.future.length) return state;
    const next = state.future[0];
    return { past: [...state.past, structuredClone(state.present)], present: next, future: state.future.slice(1) };
  }
  if (action.type === "reset") return { past: [], present: action.value, future: [] };
  return { ...state, present: action.value };
}

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <details open className="rounded-2xl border border-slate-200 bg-white/85 p-3"><summary className="cursor-pointer font-semibold text-slate-900">{title}</summary><div className="mt-3 space-y-3">{children}</div></details>;
}

function SliderRow({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return <label className="block"><div className="mb-1 flex justify-between text-xs"><span>{label}</span><span>{value.toFixed(2)}</span></div><Slider min={min} max={max} step={step ?? 1} value={value} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  const d = max - min;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0]; else if (h < 120) [r, g, b] = [x, c, 0]; else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c]; else if (h < 300) [r, g, b] = [x, 0, c]; else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const curveCanvasRef = useRef<HTMLCanvasElement>(null);
  const [source, setSource] = useState<ImageData | null>(null);
  const [lut, setLut] = useState<Uint8Array | null>(null);
  const [histogram, setHistogram] = useState<number[]>(Array(256).fill(0));
  const [processing, setProcessing] = useState(false);
  const [fileSizePreview, setFileSizePreview] = useState("-");
  const [activeCurve, setActiveCurve] = useState<RGB>("rgb");

  const [history, dispatch] = useReducer(historyReducer, null, () => ({ past: [], present: defaultSettings(), future: [] }));
  const settings = history.present;

  const updateSettings = useCallback((fn: (s: Settings) => Settings) => {
    dispatch({ type: "set", value: fn(structuredClone(settings)) });
  }, [settings]);

  const resetSection = (section: keyof Settings) => updateSettings((s) => ({ ...s, [section]: defaultSettings()[section] } as Settings));

  const loadFile = async (file: File) => {
    const bmp = await createImageBitmap(file);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    setSource(img);
    dispatch({ type: "replace", value: { ...settings, geometry: { ...settings.geometry, width: c.width, height: c.height }, export: { ...settings.export, resizeW: c.width, resizeH: c.height } } });
  };

  useEffect(() => {
    const c = curveCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#0f172a"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#334155";
    for (let i = 0; i <= 4; i++) {
      const p = (i / 4) * c.width;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, c.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(c.width, p); ctx.stroke();
    }
    const pts = [...settings.toneCurve[activeCurve]].sort((a, b) => a.x - b.x);
    ctx.strokeStyle = activeCurve === "r" ? "#f87171" : activeCurve === "g" ? "#4ade80" : activeCurve === "b" ? "#60a5fa" : "#f8fafc";
    ctx.beginPath();
    pts.forEach((p, i) => {
      const x = p.x * c.width, y = (1 - p.y) * c.height;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      ctx.fillStyle = "#e2e8f0"; ctx.fillRect(x - 3, y - 3, 6, 6);
    });
    ctx.stroke();
  }, [settings.toneCurve, activeCurve]);

  useEffect(() => {
    if (!source || !canvasRef.current) return;
    const token = setTimeout(() => {
      setProcessing(true);
      const canvas = canvasRef.current!;
      const { geometry } = settings;
      canvas.width = geometry.width;
      canvas.height = geometry.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = geometry.smoothing;
      const srcC = document.createElement("canvas"); srcC.width = source.width; srcC.height = source.height;
      const srcCtx = srcC.getContext("2d"); if (!srcCtx) return;
      srcCtx.putImageData(source, 0, 0);
      const cropPx = {
        x: (geometry.cropX / 100) * source.width,
        y: (geometry.cropY / 100) * source.height,
        w: (geometry.cropW / 100) * source.width,
        h: (geometry.cropH / 100) * source.height
      };
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((geometry.rotate * Math.PI) / 180);
      ctx.transform(1, geometry.perspectiveV / 100, geometry.perspectiveH / 100, 1, 0, 0);
      ctx.scale(geometry.flipH ? -1 : 1, geometry.flipV ? -1 : 1);
      ctx.drawImage(srcC, cropPx.x, cropPx.y, cropPx.w, cropPx.h, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
      ctx.restore();
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = img.data;
      const h = Array(256).fill(0);
      const curveFns: Record<RGB, (v: number) => number> = {
        rgb: curveMapper(settings.toneCurve.rgb), r: curveMapper(settings.toneCurve.r), g: curveMapper(settings.toneCurve.g), b: curveMapper(settings.toneCurve.b)
      };

      for (let i = 0; i < d.length; i += 4) {
        let r = d[i], g = d[i + 1], b = d[i + 2];
        const lum = (r + g + b) / 3 / 255;
        const exp = Math.pow(2, settings.basic.exposure);
        r *= exp; g *= exp; b *= exp;
        r += settings.basic.brightness; g += settings.basic.brightness; b += settings.basic.brightness;
        const contrast = (259 * (settings.basic.contrast + 255)) / (255 * (259 - settings.basic.contrast));
        r = contrast * (r - 128) + 128; g = contrast * (g - 128) + 128; b = contrast * (b - 128) + 128;
        const shadowWeight = clamp((0.5 - lum) * 2);
        const highlightWeight = clamp((lum - 0.5) * 2);
        r += settings.basic.shadows * shadowWeight - settings.basic.highlights * highlightWeight;
        g += settings.basic.shadows * shadowWeight - settings.basic.highlights * highlightWeight;
        b += settings.basic.shadows * shadowWeight - settings.basic.highlights * highlightWeight;
        r += settings.basic.whites * highlightWeight + settings.basic.blacks * shadowWeight;
        g += settings.basic.whites * highlightWeight + settings.basic.blacks * shadowWeight;
        b += settings.basic.whites * highlightWeight + settings.basic.blacks * shadowWeight;

        r += settings.color.temperature * 0.8 + settings.color.tint * 0.3;
        b -= settings.color.temperature * 0.8;
        g -= settings.color.tint * 0.3;

        let [hh, ss, ll] = rgbToHsl(r, g, b);
        const satFactor = 1 + settings.color.saturation / 100;
        ss = clamp(ss * satFactor + (settings.color.vibrance / 100) * (1 - ss));
        const range = pickRange(hh);
        const rr = settings.color.hsl[range];
        hh = (hh + rr.hue + 360) % 360;
        ss = clamp(ss * (1 + rr.saturation / 100));
        ll = clamp(ll + rr.luminance / 100);
        [r, g, b] = hslToRgb(hh, ss, ll);

        [r, g, b] = applyColorWheel(r, g, b, lum, settings.grading);

        r = curveFns.rgb(r / 255) * 255; g = curveFns.rgb(g / 255) * 255; b = curveFns.rgb(b / 255) * 255;
        r = curveFns.r(r / 255) * 255; g = curveFns.g(g / 255) * 255; b = curveFns.b(b / 255) * 255;

        if (settings.advanced.gamma !== 1) {
          r = 255 * Math.pow(clamp(r / 255), 1 / settings.advanced.gamma);
          g = 255 * Math.pow(clamp(g / 255), 1 / settings.advanced.gamma);
          b = 255 * Math.pow(clamp(b / 255), 1 / settings.advanced.gamma);
        }

        const mr = settings.advanced.mixerR, mg = settings.advanced.mixerG, mb = settings.advanced.mixerB;
        const nr = (r * mr[0] + g * mr[1] + b * mr[2]) / 100;
        const ng = (r * mg[0] + g * mg[1] + b * mg[2]) / 100;
        const nb = (r * mb[0] + g * mb[1] + b * mb[2]) / 100;
        r = nr; g = ng; b = nb;

        const cx = ((i / 4) % canvas.width) / canvas.width - 0.5;
        const cy = Math.floor(i / 4 / canvas.width) / canvas.height - 0.5;
        const dist = Math.sqrt(cx * cx + cy * cy);
        const vig = 1 - dist * (settings.geometry.vignette / 100) * 1.8;
        r *= vig; g *= vig; b *= vig;

        if (lut && lut.length >= 256 * 256 * 256 * 3) {
          const ri = clamp(Math.round(r), 0, 255), gi = clamp(Math.round(g), 0, 255), bi = clamp(Math.round(b), 0, 255);
          const idx = ((ri * 256 + gi) * 256 + bi) * 3;
          r = lut[idx]; g = lut[idx + 1]; b = lut[idx + 2];
        }

        r = clamp(r, 0, 255); g = clamp(g, 0, 255); b = clamp(b, 0, 255);
        d[i] = r; d[i + 1] = g; d[i + 2] = b;
        h[Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b))]++;
      }

      if (settings.detail.noiseLuma > 0 || settings.detail.noiseColor > 0 || settings.detail.sharpenAmount > 0 || settings.detail.dehaze > 0 || settings.detail.clarity > 0 || settings.detail.texture > 0 || settings.advanced.highPass > 0 || settings.advanced.edgePreview) {
        postProcess(img, settings);
      }
      ctx.putImageData(img, 0, 0);
      setHistogram(h);
      setProcessing(false);
    }, 40);

    return () => clearTimeout(token);
  }, [source, settings, lut]);

  const curveClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    const rect = c.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width);
    const y = clamp(1 - (e.clientY - rect.top) / rect.height);
    const points = [...settings.toneCurve[activeCurve], { x, y }].sort((a, b) => a.x - b.x);
    updateSettings((s) => ({ ...s, toneCurve: { ...s.toneCurve, [activeCurve]: points } }));
  };

  const exportImage = async () => {
    if (!canvasRef.current) return;
    const c = canvasRef.current;
    let out = c;
    if (settings.export.resizeEnabled) {
      const t = document.createElement("canvas");
      t.width = settings.export.resizeW; t.height = settings.export.resizeH;
      t.getContext("2d")?.drawImage(c, 0, 0, t.width, t.height);
      out = t;
    }
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, settings.export.format, settings.export.quality / 100));
    if (!blob) return;
    setFileSizePreview(`${(blob.size / 1024 / 1024).toFixed(2)} MB`);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `edited.${settings.export.format.split("/")[1]}`; a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <AppShell>
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-3">
            <input type="file" accept="image/*,.cube" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.name.endsWith(".cube")) setLut(await parseCubeLut(await f.text())); else void loadFile(f);
            }} />
            <div className="mt-2 flex gap-2">
              <Button onClick={() => dispatch({ type: "undo" })} disabled={!history.past.length}>Undo</Button>
              <Button onClick={() => dispatch({ type: "redo" })} disabled={!history.future.length}>Redo</Button>
              <Button variant="danger" onClick={() => dispatch({ type: "reset", value: defaultSettings() })}>Reset All</Button>
            </div>
          </div>

          <Panel title="Basic Tone"><SectionHeader onReset={() => resetSection("basic")} />
            <SliderRow label="Exposure" value={settings.basic.exposure} min={-5} max={5} step={0.01} onChange={(v) => updateSettings((s) => ({ ...s, basic: { ...s.basic, exposure: v } }))} />
            <SliderRow label="Brightness" value={settings.basic.brightness} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, basic: { ...s.basic, brightness: v } }))} />
            <SliderRow label="Contrast" value={settings.basic.contrast} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, basic: { ...s.basic, contrast: v } }))} />
            <SliderRow label="Highlights" value={settings.basic.highlights} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, basic: { ...s.basic, highlights: v } }))} />
            <SliderRow label="Shadows" value={settings.basic.shadows} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, basic: { ...s.basic, shadows: v } }))} />
            <SliderRow label="Whites" value={settings.basic.whites} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, basic: { ...s.basic, whites: v } }))} />
            <SliderRow label="Blacks" value={settings.basic.blacks} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, basic: { ...s.basic, blacks: v } }))} />
          </Panel>

          <Panel title="Tone Curve"><SectionHeader onReset={() => resetSection("toneCurve")} />
            <div className="flex gap-2">{(["rgb", "r", "g", "b"] as RGB[]).map((k) => <Button key={k} variant={activeCurve === k ? "primary" : "ghost"} onClick={() => setActiveCurve(k)}>{k.toUpperCase()}</Button>)}</div>
            <canvas ref={curveCanvasRef} width={300} height={300} className="w-full rounded-xl border border-slate-700" onClick={curveClick} onDoubleClick={() => updateSettings((s) => ({ ...s, toneCurve: { ...s.toneCurve, [activeCurve]: [{ x: 0, y: 0 }, { x: 1, y: 1 }] } }))} />
          </Panel>

          <Panel title="Color"><SectionHeader onReset={() => resetSection("color")} />
            <SliderRow label="Temperature" value={settings.color.temperature} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, color: { ...s.color, temperature: v } }))} />
            <SliderRow label="Tint" value={settings.color.tint} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, color: { ...s.color, tint: v } }))} />
            <SliderRow label="Vibrance" value={settings.color.vibrance} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, color: { ...s.color, vibrance: v } }))} />
            <SliderRow label="Saturation" value={settings.color.saturation} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, color: { ...s.color, saturation: v } }))} />
            {colorRanges.map((k) => <details key={k}><summary className="text-xs font-semibold uppercase">{k}</summary><div className="space-y-2"><SliderRow label="Hue" value={settings.color.hsl[k].hue} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, color: { ...s.color, hsl: { ...s.color.hsl, [k]: { ...s.color.hsl[k], hue: v } } } }))} /><SliderRow label="Sat" value={settings.color.hsl[k].saturation} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, color: { ...s.color, hsl: { ...s.color.hsl, [k]: { ...s.color.hsl[k], saturation: v } } } }))} /><SliderRow label="Lum" value={settings.color.hsl[k].luminance} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, color: { ...s.color, hsl: { ...s.color.hsl, [k]: { ...s.color.hsl[k], luminance: v } } } }))} /></div></details>)}
          </Panel>

          <Panel title="Color Grading"><SectionHeader onReset={() => resetSection("grading")} />
            {(["shadows", "midtones", "highlights"] as const).map((k) => <div key={k} className="rounded-xl border p-2"><p className="mb-2 text-xs font-semibold uppercase">{k}</p><Input type="color" value={hueToHex(settings.grading[k].hue)} onChange={(e) => updateSettings((s) => ({ ...s, grading: { ...s.grading, [k]: { ...s.grading[k], hue: hexToHue(e.target.value) } } }))} /><SliderRow label="Saturation" value={settings.grading[k].sat} min={0} max={100} onChange={(v) => updateSettings((s) => ({ ...s, grading: { ...s.grading, [k]: { ...s.grading[k], sat: v } } }))} /><SliderRow label="Luminance" value={settings.grading[k].lum} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, grading: { ...s.grading, [k]: { ...s.grading[k], lum: v } } }))} /></div>)}
          </Panel>

          <Panel title="Detail"><SectionHeader onReset={() => resetSection("detail")} />
            <SliderRow label="Sharpen Amount" value={settings.detail.sharpenAmount} min={0} max={200} onChange={(v) => updateSettings((s) => ({ ...s, detail: { ...s.detail, sharpenAmount: v } }))} />
            <SliderRow label="Sharpen Radius" value={settings.detail.sharpenRadius} min={0} max={5} step={0.1} onChange={(v) => updateSettings((s) => ({ ...s, detail: { ...s.detail, sharpenRadius: v } }))} />
            <SliderRow label="Sharpen Threshold" value={settings.detail.sharpenThreshold} min={0} max={255} onChange={(v) => updateSettings((s) => ({ ...s, detail: { ...s.detail, sharpenThreshold: v } }))} />
            <SliderRow label="Clarity" value={settings.detail.clarity} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, detail: { ...s.detail, clarity: v } }))} />
            <SliderRow label="Texture" value={settings.detail.texture} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, detail: { ...s.detail, texture: v } }))} />
            <SliderRow label="Dehaze" value={settings.detail.dehaze} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, detail: { ...s.detail, dehaze: v } }))} />
            <SliderRow label="Luminance NR" value={settings.detail.noiseLuma} min={0} max={100} onChange={(v) => updateSettings((s) => ({ ...s, detail: { ...s.detail, noiseLuma: v } }))} />
            <SliderRow label="Color NR" value={settings.detail.noiseColor} min={0} max={100} onChange={(v) => updateSettings((s) => ({ ...s, detail: { ...s.detail, noiseColor: v } }))} />
          </Panel>

          <Panel title="Geometry"><SectionHeader onReset={() => resetSection("geometry")} />
            <SliderRow label="Crop X %" value={settings.geometry.cropX} min={0} max={100} onChange={(v) => updateSettings((s) => ({ ...s, geometry: { ...s.geometry, cropX: v } }))} />
            <SliderRow label="Crop Y %" value={settings.geometry.cropY} min={0} max={100} onChange={(v) => updateSettings((s) => ({ ...s, geometry: { ...s.geometry, cropY: v } }))} />
            <SliderRow label="Crop W %" value={settings.geometry.cropW} min={1} max={100} onChange={(v) => updateSettings((s) => ({ ...s, geometry: { ...s.geometry, cropW: v } }))} />
            <SliderRow label="Crop H %" value={settings.geometry.cropH} min={1} max={100} onChange={(v) => updateSettings((s) => ({ ...s, geometry: { ...s.geometry, cropH: v } }))} />
            <SliderRow label="Rotate" value={settings.geometry.rotate} min={-180} max={180} onChange={(v) => updateSettings((s) => ({ ...s, geometry: { ...s.geometry, rotate: v } }))} />
            <div className="flex gap-2"><Button onClick={() => updateSettings((s) => ({ ...s, geometry: { ...s.geometry, flipH: !s.geometry.flipH } }))}>Flip H</Button><Button onClick={() => updateSettings((s) => ({ ...s, geometry: { ...s.geometry, flipV: !s.geometry.flipV } }))}>Flip V</Button></div>
            <div className="grid grid-cols-2 gap-2"><Input type="number" value={settings.geometry.width} onChange={(e) => updateSettings((s) => ({ ...s, geometry: { ...s.geometry, width: Number(e.target.value) } }))} /><Input type="number" value={settings.geometry.height} onChange={(e) => updateSettings((s) => ({ ...s, geometry: { ...s.geometry, height: Number(e.target.value) } }))} /></div>
            <SliderRow label="Perspective V" value={settings.geometry.perspectiveV} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, geometry: { ...s.geometry, perspectiveV: v } }))} />
            <SliderRow label="Perspective H" value={settings.geometry.perspectiveH} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, geometry: { ...s.geometry, perspectiveH: v } }))} />
            <SliderRow label="Lens Distortion" value={settings.geometry.lens} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, geometry: { ...s.geometry, lens: v } }))} />
            <SliderRow label="Vignette" value={settings.geometry.vignette} min={-100} max={100} onChange={(v) => updateSettings((s) => ({ ...s, geometry: { ...s.geometry, vignette: v } }))} />
            <Select value={settings.geometry.smoothing} onChange={(e) => updateSettings((s) => ({ ...s, geometry: { ...s.geometry, smoothing: e.target.value as Settings["geometry"]["smoothing"] } }))}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></Select>
          </Panel>

          <Panel title="Advanced"><SectionHeader onReset={() => resetSection("advanced")} />
            <SliderRow label="Gamma" value={settings.advanced.gamma} min={0.2} max={3} step={0.01} onChange={(v) => updateSettings((s) => ({ ...s, advanced: { ...s.advanced, gamma: v } }))} />
            <SliderRow label="High Pass" value={settings.advanced.highPass} min={0} max={100} onChange={(v) => updateSettings((s) => ({ ...s, advanced: { ...s.advanced, highPass: v } }))} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.advanced.labMode} onChange={(e) => updateSettings((s) => ({ ...s, advanced: { ...s.advanced, labMode: e.target.checked } }))} />LAB mode</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.advanced.edgePreview} onChange={(e) => updateSettings((s) => ({ ...s, advanced: { ...s.advanced, edgePreview: e.target.checked } }))} />Edge preview</label>
          </Panel>

          <Panel title="Export"><SectionHeader onReset={() => resetSection("export")} />
            <Select value={settings.export.format} onChange={(e) => updateSettings((s) => ({ ...s, export: { ...s.export, format: e.target.value as Settings["export"]["format"] } }))}><option value="image/png">PNG</option><option value="image/jpeg">JPG</option><option value="image/webp">WebP</option><option value="image/avif">AVIF</option></Select>
            <SliderRow label="Quality" value={settings.export.quality} min={1} max={100} onChange={(v) => updateSettings((s) => ({ ...s, export: { ...s.export, quality: v } }))} />
            <Select value={settings.export.bitDepth}><option value="8">8-bit</option></Select>
            <Select value={settings.export.colorSpace}><option value="sRGB">sRGB</option></Select>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.export.resizeEnabled} onChange={(e) => updateSettings((s) => ({ ...s, export: { ...s.export, resizeEnabled: e.target.checked } }))} />Resize on export</label>
            <div className="grid grid-cols-2 gap-2"><Input type="number" value={settings.export.resizeW} onChange={(e) => updateSettings((s) => ({ ...s, export: { ...s.export, resizeW: Number(e.target.value) } }))} /><Input type="number" value={settings.export.resizeH} onChange={(e) => updateSettings((s) => ({ ...s, export: { ...s.export, resizeH: Number(e.target.value) } }))} /></div>
            <p className="text-xs text-slate-600">File size preview: {fileSizePreview}</p>
            <Button onClick={() => void exportImage()}>Export</Button>
          </Panel>
        </div>

        <div className="space-y-3">
          <div className="relative rounded-2xl border border-slate-200 bg-white/90 p-3">
            {processing && <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-sm font-semibold">Processing…</div>}
            <canvas ref={canvasRef} className="max-h-[78vh] w-full rounded-xl bg-slate-950 object-contain" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/90 p-3">
            <p className="mb-2 text-sm font-semibold">Histogram</p>
            <div className="flex h-28 items-end gap-px">
              {histogram.map((v, i) => {
                const max = Math.max(...histogram, 1);
                return <div key={i} style={{ height: `${(v / max) * 100}%` }} className="w-full bg-slate-500" />;
              })}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function SectionHeader({ onReset }: { onReset: () => void }) {
  return <div className="flex justify-end"><Button variant="ghost" className="px-2 py-1 text-xs" onClick={onReset}>Reset Section</Button></div>;
}

function curveMapper(points: CurvePoint[]) {
  const pts = [...points].sort((a, b) => a.x - b.x);
  return (v: number) => {
    if (v <= pts[0].x) return pts[0].y;
    if (v >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
    for (let i = 1; i < pts.length; i++) {
      if (v <= pts[i].x) {
        const a = pts[i - 1], b = pts[i];
        const t = (v - a.x) / (b.x - a.x);
        return a.y + (b.y - a.y) * t;
      }
    }
    return v;
  };
}

function pickRange(h: number): ColorRange {
  if (h < 20 || h >= 340) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 160) return "green";
  if (h < 200) return "aqua";
  if (h < 255) return "blue";
  if (h < 290) return "purple";
  return "magenta";
}

function hueToHex(h: number) { const [r, g, b] = hslToRgb(h, 1, 0.5); return `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`; }
function hexToHue(hex: string) { const x = Number.parseInt(hex.slice(1), 16); const [h] = rgbToHsl((x >> 16) & 255, (x >> 8) & 255, x & 255); return h; }

function applyColorWheel(r: number, g: number, b: number, lum: number, grading: Settings["grading"]): [number, number, number] {
  const target = lum < 0.33 ? grading.shadows : lum < 0.66 ? grading.midtones : grading.highlights;
  const [wr, wg, wb] = hslToRgb(target.hue, target.sat / 100, 0.5);
  return [r + (wr - 128) * 0.25 + target.lum, g + (wg - 128) * 0.25 + target.lum, b + (wb - 128) * 0.25 + target.lum];
}

function postProcess(img: ImageData, settings: Settings) {
  const d = img.data;
  if (settings.detail.noiseLuma > 0 || settings.detail.noiseColor > 0) {
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.sin(i) * 0.5 + 0.5) * settings.detail.noiseLuma * 0.04;
      d[i] = d[i] * (1 - n) + (d[i] + d[i + 1] + d[i + 2]) / 3 * n;
      d[i + 1] = d[i + 1] * (1 - n) + (d[i] + d[i + 1] + d[i + 2]) / 3 * n;
      d[i + 2] = d[i + 2] * (1 - n) + (d[i] + d[i + 1] + d[i + 2]) / 3 * n;
    }
  }
  const edgeBoost = settings.detail.clarity * 0.25 + settings.detail.texture * 0.3 + settings.detail.dehaze * 0.4 + settings.advanced.highPass * 0.3;
  if (edgeBoost !== 0 || settings.advanced.edgePreview || settings.detail.sharpenAmount > 0) {
    for (let y = 1; y < img.height - 1; y++) {
      for (let x = 1; x < img.width - 1; x++) {
        const i = (y * img.width + x) * 4;
        const n = ((y - 1) * img.width + x) * 4, s = ((y + 1) * img.width + x) * 4, w = (y * img.width + x - 1) * 4, e = (y * img.width + x + 1) * 4;
        for (let c = 0; c < 3; c++) {
          const lap = d[n + c] + d[s + c] + d[w + c] + d[e + c] - 4 * d[i + c];
          if (settings.advanced.edgePreview) d[i + c] = clamp(Math.abs(lap) * 2, 0, 255);
          else d[i + c] = clamp(d[i + c] - lap * (edgeBoost / 100) + lap * (settings.detail.sharpenAmount / 200), 0, 255);
        }
      }
    }
  }
}

async function parseCubeLut(text: string): Promise<Uint8Array | null> {
  if (!text.includes("LUT_3D_SIZE")) return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const data = lines.filter((l) => /^\d/.test(l)).map((l) => l.split(/\s+/).map(Number));
  if (!data.length) return null;
  const out = new Uint8Array(256 * 256 * 256 * 3);
  for (let r = 0; r < 256; r++) for (let g = 0; g < 256; g++) for (let b = 0; b < 256; b++) {
    const idx = ((r * 256 + g) * 256 + b) * 3;
    out[idx] = r; out[idx + 1] = g; out[idx + 2] = b;
  }
  return out;
}

export default App;
