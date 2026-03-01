type RGB = { r: number; g: number; b: number };
type CurvePoint = { x: number; y: number };
type HslRange = "red" | "orange" | "yellow" | "green" | "aqua" | "blue" | "purple" | "magenta";
type RenderMode = "interactive" | "final" | "export";

type WorkerRenderRequest = {
  type: "render";
  requestId: number;
  mode: RenderMode;
  sourceBitmap: ImageBitmap;
  sourceWidth: number;
  sourceHeight: number;
  originalWidth: number;
  originalHeight: number;
  showLiveCropOverlayOnly: boolean;
  interactiveMaxDimension: number;
  finalScale: number;
  settings: any;
  lut3d: { size: number; table: Float32Array } | null;
};

type WorkerRenderResponse = {
  type: "rendered";
  requestId: number;
  width: number;
  height: number;
  bitmap: ImageBitmap;
};

const HSL_RANGES: HslRange[] = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"];
const clamp = (v: number, min = 0, max = 255) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function rgbToHsl(r: number, g: number, b: number) { r /= 255; g /= 255; b /= 255; const max = Math.max(r, g, b), min = Math.min(r, g, b); const l = (max + min) / 2; if (max === min) return { h: 0, s: 0, l }; const d = max - min; const s = l > 0.5 ? d / (2 - max - min) : d / (max + min); let h = 0; if (max === r) h = (g - b) / d + (g < b ? 6 : 0); else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; return { h: h / 6, s, l }; }
function hslToRgb(h: number, s: number, l: number): RGB { const hue2rgb = (p: number, q: number, t: number) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; } const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; return { r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255), g: Math.round(hue2rgb(p, q, h) * 255), b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255) }; }
function getHueBandWeights(h: number): Record<HslRange, number> { const wheel: Array<{ key: HslRange; center: number }> = [{ key: "red", center: 0 }, { key: "orange", center: 30 / 360 }, { key: "yellow", center: 60 / 360 }, { key: "green", center: 120 / 360 }, { key: "aqua", center: 180 / 360 }, { key: "blue", center: 240 / 360 }, { key: "purple", center: 275 / 360 }, { key: "magenta", center: 315 / 360 }]; const result = Object.fromEntries(HSL_RANGES.map((k) => [k, 0])) as Record<HslRange, number>; for (const item of wheel) { const diff = Math.min(Math.abs(h - item.center), 1 - Math.abs(h - item.center)); result[item.key] = Math.max(0, 1 - diff / (1 / 12)); } return result; }
function buildLut(points: CurvePoint[]) { const sorted = [...points].sort((a, b) => a.x - b.x); const out = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) { let left = sorted[0], right = sorted[sorted.length - 1]; for (let j = 0; j < sorted.length - 1; j++) { if (i >= sorted[j].x && i <= sorted[j + 1].x) { left = sorted[j]; right = sorted[j + 1]; break; } } const t = right.x === left.x ? 0 : (i - left.x) / (right.x - left.x); out[i] = clamp(Math.round(lerp(left.y, right.y, t))); } return out; }
function sampleNeighborhood(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, radius: number) { let r = 0, g = 0, b = 0, n = 0; for (let oy = -radius; oy <= radius; oy++) { for (let ox = -radius; ox <= radius; ox++) { const xx = Math.max(0, Math.min(width - 1, x + ox)); const yy = Math.max(0, Math.min(height - 1, y + oy)); const i = (yy * width + xx) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; } } return { r: r / n, g: g / n, b: b / n }; }
function applyColorSpaceTransform(r: number, g: number, b: number, colorSpace: any) { if (colorSpace === "Display-P3") return { r: clamp(r * 1.03), g: clamp(g * 1.01), b: clamp(b * 1.06) }; if (colorSpace === "Adobe RGB") return { r: clamp(r * 1.06), g: clamp(g * 1.03), b: clamp(b * 0.97) }; if (colorSpace === "ProPhoto RGB") return { r: clamp(r * 1.09), g: clamp(g * 1.05), b: clamp(b * 1.03) }; if (colorSpace === "Rec.2020") return { r: clamp(r * 1.04), g: clamp(g * 1.04), b: clamp(b * 1.08) }; if (colorSpace === "Linear sRGB") return { r: clamp(Math.pow(r / 255, 2.2) * 255), g: clamp(Math.pow(g / 255, 2.2) * 255), b: clamp(Math.pow(b / 255, 2.2) * 255) }; return { r, g, b }; }


export type RenderRequest = WorkerRenderRequest;
export type RenderResponse = WorkerRenderResponse;

function createCanvas(width: number, height: number) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  const inWorker = typeof WorkerGlobalScope !== "undefined" && typeof self !== "undefined" && self instanceof WorkerGlobalScope;
  if (inWorker) {
    throw new Error("no-offscreencanvas-in-worker");
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error("Canvas2D is unavailable");
}

export async function runAdjustRender(request: RenderRequest): Promise<RenderResponse> {
  const state = request.settings;
  const g = state.geometry;
  const forExport = request.mode === "export";
  const lightweight = request.mode === "interactive";
  const cropX = request.showLiveCropOverlayOnly ? 0 : Math.round((g.cropX / 100) * request.sourceWidth);
  const cropY = request.showLiveCropOverlayOnly ? 0 : Math.round((g.cropY / 100) * request.sourceHeight);
  const cropW = request.showLiveCropOverlayOnly ? request.sourceWidth : Math.max(1, Math.round((g.cropW / 100) * request.sourceWidth));
  const cropH = request.showLiveCropOverlayOnly ? request.sourceHeight : Math.max(1, Math.round((g.cropH / 100) * request.sourceHeight));
  const previewScaleX = request.sourceWidth / request.originalWidth;
  const previewScaleY = request.sourceHeight / request.originalHeight;
  const targetW = forExport && state.export.resizeOnExport ? state.export.width : Math.max(1, Math.round((g.resizeW || Math.max(1, Math.round((g.cropW / 100) * request.originalWidth))) * previewScaleX));
  const targetH = forExport && state.export.resizeOnExport ? state.export.height : Math.max(1, Math.round((g.resizeH || Math.max(1, Math.round((g.cropH / 100) * request.originalHeight))) * previewScaleY));
  const outW = forExport ? targetW : Math.min(targetW, request.sourceWidth);
  const outH = forExport ? targetH : Math.min(targetH, request.sourceHeight);
  const interactiveMaxScale = lightweight ? Math.min(1, request.interactiveMaxDimension / Math.max(outW, outH)) : 1;
  const renderScale = forExport ? 1 : (lightweight ? Math.min(0.82, interactiveMaxScale) : request.finalScale);
  const workW = Math.max(1, Math.round(outW * renderScale));
  const workH = Math.max(1, Math.round(outH * renderScale));
  const temp = createCanvas(workW, workH);
  const tctx = temp.getContext("2d"); if (!tctx) throw new Error("Unable to get render context");
  tctx.imageSmoothingEnabled = true; tctx.imageSmoothingQuality = g.smoothingQuality;
  tctx.translate(workW / 2, workH / 2); tctx.rotate((g.rotate * Math.PI) / 180); tctx.transform(1, g.perspectiveV / 100, g.perspectiveH / 100, 1, 0, 0); tctx.scale(g.flipH ? -1 : 1, g.flipV ? -1 : 1);
  tctx.drawImage(request.sourceBitmap, cropX, cropY, cropW, cropH, -workW / 2, -workH / 2, workW, workH);
  const ctx = temp.getContext("2d", { willReadFrequently: true }); if (!ctx) throw new Error("Unable to read render context");
  const image = ctx.getImageData(0, 0, workW, workH); const d = image.data;
  const lutRGB = buildLut(state.toneCurve.rgb as CurvePoint[]); const lutR = buildLut(state.toneCurve.r as CurvePoint[]), lutG = buildLut(state.toneCurve.g as CurvePoint[]), lutB = buildLut(state.toneCurve.b as CurvePoint[]);
  const exposureMul = Math.pow(2, state.basicTone.exposure); const contrastMul = 1 + state.basicTone.contrast / 100;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g1 = d[i + 1], b = d[i + 2]; r = r * exposureMul + state.basicTone.brightness; g1 = g1 * exposureMul + state.basicTone.brightness; b = b * exposureMul + state.basicTone.brightness; r = 128 + (r - 128) * contrastMul; g1 = 128 + (g1 - 128) * contrastMul; b = 128 + (b - 128) * contrastMul;
    const lum = (0.2126 * r + 0.7152 * g1 + 0.0722 * b) / 255; const sh = Math.max(0, 1 - lum * 2) * (state.basicTone.shadows / 100) * 80; const hi = Math.max(0, (lum - 0.5) * 2) * (state.basicTone.highlights / 100) * 80; r += sh - hi; g1 += sh - hi; b += sh - hi;
    if (lum > 0.8) { const w = (state.basicTone.whites / 100) * 60; r += w; g1 += w; b += w; } if (lum < 0.2) { const bl = (state.basicTone.blacks / 100) * 60; r += bl; g1 += bl; b += bl; }
    r += state.color.temperature * 0.66; b -= state.color.temperature * 0.66; g1 += state.color.tint * 0.56;
    let { h, s, l } = rgbToHsl(clamp(r), clamp(g1), clamp(b)); s = clamp(s * 255 + state.color.saturation, 0, 255) / 255; const vibranceBoost = (state.color.vibrance / 165) * (1 - s) * 0.78; s = clamp((s + vibranceBoost) * 255, 0, 255) / 255;
    const bandWeights = getHueBandWeights(h); let hueShift = 0, satShift = 0, lumShift = 0; for (const range of HSL_RANGES) { const influence = bandWeights[range]; if (influence <= 0) continue; const band = state.color.hsl[range]; hueShift += (band.hue / 360) * influence; satShift += (band.sat / 120) * influence; lumShift += (band.lum / 120) * influence; }
    h = (h + hueShift + 1) % 1; s = clamp((s + satShift) * 255, 0, 255) / 255; l = clamp((l + lumShift) * 255, 0, 255) / 255;
    const shadowW = Math.max(0, 1 - l * 2), highW = Math.max(0, (l - 0.5) * 2), midW = 1 - shadowW - highW;
    const applyWheel = (wheel: { hue: number; sat: number; lum: number }, w: number, rgb: RGB) => { const tint = hslToRgb(wheel.hue / 360, clamp(wheel.sat, 0, 100) / 100, 0.5); rgb.r = lerp(rgb.r, tint.r, (wheel.sat / 100) * w * 0.35) + wheel.lum * w * 0.2; rgb.g = lerp(rgb.g, tint.g, (wheel.sat / 100) * w * 0.35) + wheel.lum * w * 0.2; rgb.b = lerp(rgb.b, tint.b, (wheel.sat / 100) * w * 0.35) + wheel.lum * w * 0.2; };
    const base = hslToRgb(h, s, l); applyWheel(state.grading.shadows, shadowW, base); applyWheel(state.grading.midtones, midW, base); applyWheel(state.grading.highlights, highW, base); r = base.r; g1 = base.g; b = base.b;
    if (state.advanced.labMode) { const avg = (r + g1 + b) / 3; r = lerp(avg, r, 1.15); g1 = lerp(avg, g1, 1.1); b = lerp(avg, b, 1.1); }
    const m = state.advanced.channelMixer; const nr = (r * m.r.r + g1 * m.r.g + b * m.r.b) / 100; const ng = (r * m.g.r + g1 * m.g.g + b * m.g.b) / 100; const nb = (r * m.b.r + g1 * m.b.g + b * m.b.b) / 100;
    r = Math.pow(clamp(nr) / 255, 1 / state.advanced.gamma) * 255; g1 = Math.pow(clamp(ng) / 255, 1 / state.advanced.gamma) * 255; b = Math.pow(clamp(nb) / 255, 1 / state.advanced.gamma) * 255;
    r = lutRGB[clamp(r)] + (lutR[clamp(r)] - clamp(r)); g1 = lutRGB[clamp(g1)] + (lutG[clamp(g1)] - clamp(g1)); b = lutRGB[clamp(b)] + (lutB[clamp(b)] - clamp(b));
    if (forExport) { const converted = applyColorSpaceTransform(r, g1, b, state.export.colorSpace); r = converted.r; g1 = converted.g; b = converted.b; }
    d[i] = clamp(r); d[i + 1] = clamp(g1); d[i + 2] = clamp(b);
  }
  if (!lightweight && (state.detail.sharpenAmount > 0 || state.detail.noiseLuma > 0 || state.detail.noiseColor > 0 || state.detail.clarity !== 0 || state.detail.texture !== 0 || state.detail.dehaze !== 0 || state.advanced.highPass > 0 || state.advanced.edgePreview)) {
    const blurred = new Uint8ClampedArray(d); const rad = Math.max(1, Math.round(state.detail.sharpenRadius));
    for (let y = 0; y < workH; y++) for (let x = 0; x < workW; x++) { const i = (y * workW + x) * 4; const n = sampleNeighborhood(d, workW, workH, x, y, Math.max(1, rad)); blurred[i] = n.r; blurred[i + 1] = n.g; blurred[i + 2] = n.b; }
    for (let i = 0; i < d.length; i += 4) { let r = d[i], g1 = d[i + 1], b = d[i + 2]; const br = blurred[i], bg = blurred[i + 1], bb = blurred[i + 2]; const hr = r - br, hg = g1 - bg, hb = b - bb; const edge = Math.abs(hr) + Math.abs(hg) + Math.abs(hb); if (state.detail.sharpenAmount > 0 && edge > state.detail.sharpenThreshold) { r += hr * (state.detail.sharpenAmount / 100); g1 += hg * (state.detail.sharpenAmount / 100); b += hb * (state.detail.sharpenAmount / 100); }
      const clarityFactor = state.detail.clarity / 100; r += hr * clarityFactor * 0.8; g1 += hg * clarityFactor * 0.8; b += hb * clarityFactor * 0.8; const textureFactor = state.detail.texture / 100; r += hr * textureFactor * 0.4; g1 += hg * textureFactor * 0.4; b += hb * textureFactor * 0.4; const dehazeFactor = state.detail.dehaze / 100; r = 128 + (r - 128) * (1 + dehazeFactor * 0.5); g1 = 128 + (g1 - 128) * (1 + dehazeFactor * 0.5); b = 128 + (b - 128) * (1 + dehazeFactor * 0.5);
      if (state.detail.noiseLuma > 0) { const mix = state.detail.noiseLuma / 100; const gray = (br + bg + bb) / 3; r = lerp(r, gray, mix * 0.4); g1 = lerp(g1, gray, mix * 0.4); b = lerp(b, gray, mix * 0.4); }
      if (state.detail.noiseColor > 0) { const mix = state.detail.noiseColor / 100; r = lerp(r, br, mix * 0.55); g1 = lerp(g1, bg, mix * 0.55); b = lerp(b, bb, mix * 0.55); }
      if (state.advanced.highPass > 0) { const hp = state.advanced.highPass / 100; r = 128 + hr * hp * 2; g1 = 128 + hg * hp * 2; b = 128 + hb * hp * 2; }
      if (state.advanced.edgePreview) { const e = clamp(edge * 1.2); r = g1 = b = e; }
      if (forExport) { const converted = applyColorSpaceTransform(r, g1, b, state.export.colorSpace); r = converted.r; g1 = converted.g; b = converted.b; }
      d[i] = clamp(r); d[i + 1] = clamp(g1); d[i + 2] = clamp(b); }
  }
  if (request.lut3d && !lightweight) { for (let i = 0; i < d.length; i += 4) { const r = d[i] / 255, g1 = d[i + 1] / 255, b = d[i + 2] / 255; const idx = ((Math.round(r * (request.lut3d.size - 1)) * request.lut3d.size + Math.round(g1 * (request.lut3d.size - 1))) * request.lut3d.size + Math.round(b * (request.lut3d.size - 1))) * 3; d[i] = clamp(request.lut3d.table[idx] * 255); d[i + 1] = clamp(request.lut3d.table[idx + 1] * 255); d[i + 2] = clamp(request.lut3d.table[idx + 2] * 255); } }
  if (g.vignette > 0 || g.lensDistortion !== 0) { const cx = workW / 2, cy = workH / 2; const maxDist = Math.sqrt(cx * cx + cy * cy); for (let y = 0; y < workH; y++) for (let x = 0; x < workW; x++) { const i = (y * workW + x) * 4; const dx = x - cx, dy = y - cy; const dist = Math.sqrt(dx * dx + dy * dy) / maxDist; const vig = 1 - (g.vignette / 100) * Math.pow(dist, 1.8); const distort = 1 + (g.lensDistortion / 100) * dist * 0.2; d[i] = clamp(d[i] * vig * distort); d[i + 1] = clamp(d[i + 1] * vig * distort); d[i + 2] = clamp(d[i + 2] * vig * distort); } }
  ctx.putImageData(image, 0, 0);
  const outCanvas = createCanvas(outW, outH); const outCtx = outCanvas.getContext("2d"); if (!outCtx) throw new Error("Unable to create output context");
  outCtx.imageSmoothingEnabled = true; outCtx.imageSmoothingQuality = lightweight ? "medium" : g.smoothingQuality; outCtx.drawImage(temp, 0, 0, outW, outH);
  const bitmap = "transferToImageBitmap" in outCanvas ? outCanvas.transferToImageBitmap() : await createImageBitmap(outCanvas as HTMLCanvasElement);
  const response: RenderResponse = { type: "rendered", requestId: request.requestId, width: outW, height: outH, bitmap };
  return response;
}
