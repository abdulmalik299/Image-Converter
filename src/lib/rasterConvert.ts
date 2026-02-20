import { fileToBitmap, fitWithin } from "./imageDecode";
import { safeBaseName } from "./format";
import type { ColorTuneSettings } from "./settings";

export type RasterOut = "png" | "jpg" | "webp";

export type RasterConvertOptions = {
  out: RasterOut;
  quality: number;            // 0..100
  keepSize: boolean;
  maxWidth: number;
  maxHeight: number;
  resizeMode: "contain" | "cover";
  jpgBackground: string;
  stripMetadataHint: boolean;
  smoothing: boolean;
  smoothingQuality: "low" | "medium" | "high";
  sharpenAmount: number;
  pngCompression: "balanced" | "quality";
  chromaSubsampling: "420" | "444";
  resampleStrength?: number;
  enhance?: {
    autoColor: boolean;
    contrast: number;
    saturation: number;
    exposure: number;
    denoise: number;
    detailRecovery?: number;
    colorTune?: ColorTuneSettings;
  };
};

type Hsl = { h: number; s: number; l: number };

const COLOR_CENTERS: Array<keyof ColorTuneSettings> = ["red", "orange", "yellow", "green", "cyan", "blue", "magenta"];
const COLOR_HUE_CENTER: Record<keyof ColorTuneSettings, number> = {
  red: 0,
  orange: 30,
  yellow: 60,
  green: 120,
  cyan: 180,
  blue: 240,
  magenta: 300
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function createCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("Your browser does not support Canvas.");
  return { canvas, ctx };
}

function drawResized(bmp: ImageBitmap, opt: RasterConvertOptions) {
  const fit = fitWithin(bmp.width, bmp.height, opt.maxWidth, opt.maxHeight);
  const outputW = opt.keepSize ? bmp.width : fit.w;
  const outputH = opt.keepSize ? bmp.height : fit.h;

  const { canvas, ctx } = createCanvas(outputW, outputH);

  if (opt.out === "jpg") {
    ctx.fillStyle = opt.jpgBackground;
    ctx.fillRect(0, 0, outputW, outputH);
  }

  ctx.imageSmoothingEnabled = opt.smoothing;
  ctx.imageSmoothingQuality = opt.smoothingQuality;

  if (!opt.keepSize && opt.resizeMode === "cover") {
    const scale = Math.max(outputW / bmp.width, outputH / bmp.height);
    const drawW = bmp.width * scale;
    const drawH = bmp.height * scale;
    const dx = (outputW - drawW) * 0.5;
    const dy = (outputH - drawH) * 0.5;
    ctx.drawImage(bmp, dx, dy, drawW, drawH);
    return { canvas, ctx };
  }

  const resampleStrength = clamp(opt.resampleStrength ?? 50, 0, 100);
  const upscaleRatio = Math.max(outputW / bmp.width, outputH / bmp.height);

  if (upscaleRatio > 1.15 && resampleStrength > 20 && opt.smoothing) {
    const steps = Math.max(2, Math.min(5, Math.round(2 + (resampleStrength / 100) * 3)));
    let currentCanvas: HTMLCanvasElement;
    let currentCtx: CanvasRenderingContext2D;
    ({ canvas: currentCanvas, ctx: currentCtx } = createCanvas(bmp.width, bmp.height));
    currentCtx.drawImage(bmp, 0, 0);

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const w = Math.round(bmp.width + (outputW - bmp.width) * t);
      const h = Math.round(bmp.height + (outputH - bmp.height) * t);
      const next = createCanvas(w, h);
      next.ctx.imageSmoothingEnabled = true;
      next.ctx.imageSmoothingQuality = opt.smoothingQuality;
      next.ctx.drawImage(currentCanvas, 0, 0, w, h);
      currentCanvas = next.canvas;
      currentCtx = next.ctx;
    }

    ctx.drawImage(currentCanvas, 0, 0, outputW, outputH);
    return { canvas, ctx };
  }

  ctx.drawImage(bmp, 0, 0, outputW, outputH);
  return { canvas, ctx };
}

function applySharpen(canvas: HTMLCanvasElement, amount: number) {
  const strength = clamp(amount, 0, 100) / 100;
  if (strength <= 0.01) return canvas;

  const { canvas: out, ctx } = createCanvas(canvas.width, canvas.height);
  const sourceCtx = canvas.getContext("2d");
  if (!sourceCtx) return canvas;

  const srcData = sourceCtx.getImageData(0, 0, canvas.width, canvas.height);
  const dstData = ctx.createImageData(canvas.width, canvas.height);

  const w = canvas.width;
  const h = canvas.height;
  const src = srcData.data;
  const dst = dstData.data;

  const center = 5 + strength * 1.4;
  const edge = -1 - strength * 0.35;

  const sample = (x: number, y: number, c: number) => src[(y * w + x) * 4 + c];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        dst[idx] = src[idx];
        dst[idx + 1] = src[idx + 1];
        dst[idx + 2] = src[idx + 2];
        dst[idx + 3] = src[idx + 3];
        continue;
      }

      for (let c = 0; c < 3; c++) {
        const v =
          sample(x, y, c) * center +
          sample(x - 1, y, c) * edge +
          sample(x + 1, y, c) * edge +
          sample(x, y - 1, c) * edge +
          sample(x, y + 1, c) * edge;
        dst[idx + c] = clamp(Math.round(v), 0, 255);
      }
      dst[idx + 3] = src[idx + 3];
    }
  }

  ctx.putImageData(dstData, 0, 0);
  return out;
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta > 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }

  if (h < 0) h += 360;
  return { h, s: clamp(s, 0, 1), l: clamp(l, 0, 1) };
}

function hslToRgb(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hp >= 0 && hp < 1) [r1, g1, b1] = [c, x, 0];
  else if (hp < 2) [r1, g1, b1] = [x, c, 0];
  else if (hp < 3) [r1, g1, b1] = [0, c, x];
  else if (hp < 4) [r1, g1, b1] = [0, x, c];
  else if (hp < 5) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];

  const m = l - c / 2;
  return {
    r: clamp(Math.round((r1 + m) * 255), 0, 255),
    g: clamp(Math.round((g1 + m) * 255), 0, 255),
    b: clamp(Math.round((b1 + m) * 255), 0, 255)
  };
}

function hueDistance(a: number, b: number) {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
}

function applySelectiveColor(hsl: Hsl, colorTune?: ColorTuneSettings): Hsl {
  if (!colorTune) return hsl;
  let hueShift = 0;
  let satShift = 0;
  let lightShift = 0;

  for (const band of COLOR_CENTERS) {
    const center = COLOR_HUE_CENTER[band];
    const dist = hueDistance(hsl.h, center);
    const weight = clamp(1 - dist / 52, 0, 1);
    if (weight <= 0) continue;
    const conf = colorTune[band];
    hueShift += conf.hue * weight;
    satShift += conf.saturation * weight;
    lightShift += conf.lightness * weight;
  }

  return {
    h: (hsl.h + hueShift + 3600) % 360,
    s: clamp(hsl.s + satShift / 100, 0, 1),
    l: clamp(hsl.l + lightShift / 100, 0, 1)
  };
}


function applyOutputQuality(canvas: HTMLCanvasElement, quality: number, out: RasterOut) {
  const normalized = clamp(quality, 0, 100) / 100;
  if (normalized >= 0.995) return canvas;

  const { canvas: outCanvas, ctx } = createCanvas(canvas.width, canvas.height);
  const sourceCtx = canvas.getContext("2d");
  if (!sourceCtx) return canvas;

  const srcData = sourceCtx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = srcData.data;
  const levels = out === "png"
    ? Math.max(24, Math.round(48 + normalized * 208))
    : Math.max(16, Math.round(24 + normalized * 232));
  const step = 255 / (levels - 1);
  const grainMix = (1 - normalized) * (out === "png" ? 0.045 : 0.025);

  for (let i = 0; i < pixels.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const n = pixels[i + c] / step;
      const rounded = Math.round(n) * step;
      const dither = ((i + c) % 8 - 3.5) * grainMix;
      pixels[i + c] = clamp(Math.round(rounded + dither), 0, 255);
    }
  }

  ctx.putImageData(srcData, 0, 0);
  return outCanvas;
}

function applyAiEnhance(canvas: HTMLCanvasElement, enhance?: RasterConvertOptions["enhance"]) {
  if (!enhance) return canvas;

  const contrastStrength = clamp(enhance.contrast, 0, 100) / 100;
  const saturationStrength = clamp(enhance.saturation, 0, 100) / 100;
  const exposureStrength = clamp(enhance.exposure, -100, 100) / 100;
  const denoiseStrength = clamp(enhance.denoise, 0, 100) / 100;
  const detailRecovery = clamp(enhance.detailRecovery ?? 0, 0, 100) / 100;

  if (contrastStrength <= 0.001 && saturationStrength <= 0.001 && Math.abs(exposureStrength) <= 0.001 && denoiseStrength <= 0.001 && detailRecovery <= 0.001 && !enhance.autoColor && !enhance.colorTune) {
    return canvas;
  }

  const { canvas: out, ctx } = createCanvas(canvas.width, canvas.height);
  const sourceCtx = canvas.getContext("2d");
  if (!sourceCtx) return canvas;

  const srcData = sourceCtx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = srcData.data;

  let avgR = 1;
  let avgG = 1;
  let avgB = 1;

  if (enhance.autoColor) {
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const alpha = pixels[i + 3] / 255;
      if (alpha <= 0) continue;
      sumR += pixels[i] * alpha;
      sumG += pixels[i + 1] * alpha;
      sumB += pixels[i + 2] * alpha;
      count += alpha;
    }
    if (count > 0) {
      avgR = sumR / count;
      avgG = sumG / count;
      avgB = sumB / count;
    }
  }

  const grayAvg = (avgR + avgG + avgB) / 3;
  const wbR = enhance.autoColor ? grayAvg / avgR : 1;
  const wbG = enhance.autoColor ? grayAvg / avgG : 1;
  const wbB = enhance.autoColor ? grayAvg / avgB : 1;

  const contrastFactor = 1 + contrastStrength * 0.55 + detailRecovery * 0.12;
  const saturationFactor = 1 + saturationStrength * 0.65 + detailRecovery * 0.08;
  const exposureOffset = exposureStrength * 35;

  for (let i = 0; i < pixels.length; i += 4) {
    let r = pixels[i] * wbR;
    let g = pixels[i + 1] * wbG;
    let b = pixels[i + 2] * wbB;

    r = (r - 128) * contrastFactor + 128 + exposureOffset;
    g = (g - 128) * contrastFactor + 128 + exposureOffset;
    b = (b - 128) * contrastFactor + 128 + exposureOffset;

    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = luma + (r - luma) * saturationFactor;
    g = luma + (g - luma) * saturationFactor;
    b = luma + (b - luma) * saturationFactor;

    const hsl = applySelectiveColor(rgbToHsl(r, g, b), enhance.colorTune);
    const remap = hslToRgb(hsl.h, hsl.s, hsl.l);

    pixels[i] = remap.r;
    pixels[i + 1] = remap.g;
    pixels[i + 2] = remap.b;
  }

  if (denoiseStrength > 0.001) {
    const base = new Uint8ClampedArray(pixels);
    const w = canvas.width;
    const h = canvas.height;
    const blurMix = denoiseStrength * 0.35;

    const at = (x: number, y: number, c: number) => {
      const cx = clamp(x, 0, w - 1);
      const cy = clamp(y, 0, h - 1);
      return base[(cy * w + cx) * 4 + c];
    };

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const soft =
            at(x, y, c) * 4 +
            at(x - 1, y, c) * 2 +
            at(x + 1, y, c) * 2 +
            at(x, y - 1, c) * 2 +
            at(x, y + 1, c) * 2 +
            at(x - 1, y - 1, c) +
            at(x + 1, y - 1, c) +
            at(x - 1, y + 1, c) +
            at(x + 1, y + 1, c);

          const blurred = soft / 16;
          const original = base[idx + c];
          pixels[idx + c] = clamp(Math.round(original * (1 - blurMix) + blurred * blurMix), 0, 255);
        }
      }
    }
  }

  ctx.putImageData(srcData, 0, 0);
  return out;
}

export async function convertRaster(file: File, opt: RasterConvertOptions) {
  const bmp = await fileToBitmap(file);
  const { canvas } = drawResized(bmp, opt);
  bmp.close?.();

  const enhancedCanvas = applyAiEnhance(canvas, opt.enhance);
  const sharpenTarget = clamp(opt.sharpenAmount + (opt.enhance?.detailRecovery ?? 0) * 0.35, 0, 100);
  const sharpenedCanvas = applySharpen(enhancedCanvas, sharpenTarget);
  const finalCanvas = applyOutputQuality(sharpenedCanvas, opt.quality, opt.out);

  const mime = opt.out === "png" ? "image/png" : opt.out === "jpg" ? "image/jpeg" : "image/webp";
  const baseQ = clamp(opt.quality / 100, 0, 1);
  const q = opt.out === "png" ? undefined : clamp(baseQ + (opt.chromaSubsampling === "444" ? 0.02 : -0.015), 0, 1);

  const blob: Blob = await new Promise((resolve, reject) => {
    finalCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to encode the output file."))), mime, q);
  });

  const base = safeBaseName(file.name);
  const outName = `${base}.${opt.out === "jpg" ? "jpg" : opt.out}`;

  return { blob, outName, width: finalCanvas.width, height: finalCanvas.height };
}
