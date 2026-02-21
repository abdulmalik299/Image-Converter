import type { EditorState, LUT3D } from "../tabs/UpscaleTab";

type WorkerMsg =
  | { type: "setSource"; bitmap: ImageBitmap }
  | { type: "render"; id: number; state: EditorState; mode: "preview" | "full"; lut3d: LUT3D };

let sourceBitmap: ImageBitmap | null = null;
let latestId = 0;

const clamp = (v: number, min = 0, max = 255) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rgbToHsl = (r: number, g: number, b: number) => {
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
};
const hslToRgb = (h: number, s: number, l: number) => {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return { r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255), g: Math.round(hue2rgb(p, q, h) * 255), b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255) };
};
const buildLut = (points: Array<{ x: number; y: number }>) => {
  const lut = new Uint8Array(256);
  const sorted = [...points].sort((a, b) => a.x - b.x);
  for (let i = 0; i < 256; i++) {
    let p1 = sorted[0], p2 = sorted[sorted.length - 1];
    for (let j = 0; j < sorted.length - 1; j++) {
      if (i >= sorted[j].x && i <= sorted[j + 1].x) { p1 = sorted[j]; p2 = sorted[j + 1]; break; }
    }
    const t = p2.x === p1.x ? 0 : (i - p1.x) / (p2.x - p1.x);
    lut[i] = clamp(Math.round(lerp(p1.y, p2.y, t)));
  }
  return lut;
};
const mapHueRange = (h: number) => {
  const deg = h * 360;
  if (deg < 20 || deg >= 340) return "red";
  if (deg < 45) return "orange";
  if (deg < 75) return "yellow";
  if (deg < 160) return "green";
  if (deg < 195) return "aqua";
  if (deg < 255) return "blue";
  if (deg < 290) return "purple";
  return "magenta";
};

self.onmessage = (event: MessageEvent<WorkerMsg>) => {
  const msg = event.data;
  if (msg.type === "setSource") { sourceBitmap?.close(); sourceBitmap = msg.bitmap; return; }
  if (!sourceBitmap || msg.type !== "render") return;
  latestId = msg.id;
  const { state, mode, lut3d, id } = msg;
  const g = state.geometry;
  const cropX = Math.round((g.cropX / 100) * sourceBitmap.width);
  const cropY = Math.round((g.cropY / 100) * sourceBitmap.height);
  const cropW = Math.max(1, Math.round((g.cropW / 100) * sourceBitmap.width));
  const cropH = Math.max(1, Math.round((g.cropH / 100) * sourceBitmap.height));
  const outW = g.resizeW || cropW;
  const outH = g.resizeH || cropH;
  const renderScale = mode === "preview" ? 0.45 : 1;
  const workW = Math.max(1, Math.round(outW * renderScale));
  const workH = Math.max(1, Math.round(outH * renderScale));

  const canvas = new OffscreenCanvas(workW, workH);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  ctx.translate(workW / 2, workH / 2);
  ctx.rotate((g.rotate * Math.PI) / 180);
  ctx.transform(1, g.perspectiveV / 100, g.perspectiveH / 100, 1, 0, 0);
  ctx.scale(g.flipH ? -1 : 1, g.flipV ? -1 : 1);
  ctx.drawImage(sourceBitmap, cropX, cropY, cropW, cropH, -workW / 2, -workH / 2, workW, workH);

  const image = ctx.getImageData(0, 0, workW, workH);
  const d = image.data;
  const lutRGB = buildLut(state.toneCurve.rgb);
  const lutR = buildLut(state.toneCurve.r), lutG = buildLut(state.toneCurve.g), lutB = buildLut(state.toneCurve.b);
  for (let i = 0; i < d.length; i += 4) {
    if (id !== latestId) return;
    let r = d[i], g1 = d[i + 1], b = d[i + 2];
    const exposureMul = Math.pow(2, state.basicTone.exposure);
    const contrastMul = 1 + state.basicTone.contrast / 100;
    r = 128 + (r * exposureMul + state.basicTone.brightness - 128) * contrastMul;
    g1 = 128 + (g1 * exposureMul + state.basicTone.brightness - 128) * contrastMul;
    b = 128 + (b * exposureMul + state.basicTone.brightness - 128) * contrastMul;
    let { h, s, l } = rgbToHsl(clamp(r), clamp(g1), clamp(b));
    const range = state.color.hsl[mapHueRange(h) as keyof typeof state.color.hsl];
    h = (h + range.hue / 360 + 1) % 1;
    s = clamp((s + range.sat / 100) * 255, 0, 255) / 255;
    l = clamp((l + range.lum / 100) * 255, 0, 255) / 255;
    const rgb = hslToRgb(h, s, l);
    r = rgb.r; g1 = rgb.g; b = rgb.b;
    r = lutRGB[clamp(r)] + (lutR[clamp(r)] - clamp(r));
    g1 = lutRGB[clamp(g1)] + (lutG[clamp(g1)] - clamp(g1));
    b = lutRGB[clamp(b)] + (lutB[clamp(b)] - clamp(b));
    d[i] = clamp(r); d[i + 1] = clamp(g1); d[i + 2] = clamp(b);
  }

  if (lut3d) {
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g1 = d[i + 1] / 255, b = d[i + 2] / 255;
      const idx = ((Math.round(r * (lut3d.size - 1)) * lut3d.size + Math.round(g1 * (lut3d.size - 1))) * lut3d.size + Math.round(b * (lut3d.size - 1))) * 3;
      d[i] = clamp(lut3d.table[idx] * 255); d[i + 1] = clamp(lut3d.table[idx + 1] * 255); d[i + 2] = clamp(lut3d.table[idx + 2] * 255);
    }
  }

  ctx.putImageData(image, 0, 0);
  const out = new OffscreenCanvas(outW, outH);
  out.getContext("2d")?.drawImage(canvas, 0, 0, outW, outH);
  const bitmap = out.transferToImageBitmap();
  self.postMessage({ type: "result", id, bitmap }, [bitmap]);
};
