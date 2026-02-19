import { fileToBitmap, fitWithin } from "./imageDecode";
import { safeBaseName } from "./format";

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
  enhance?: {
    autoColor: boolean;
    contrast: number;
    saturation: number;
    exposure: number;
    denoise: number;
  };
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
  } else {
    ctx.drawImage(bmp, 0, 0, outputW, outputH);
  }

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

function applyAiEnhance(canvas: HTMLCanvasElement, enhance?: RasterConvertOptions["enhance"]) {
  if (!enhance) return canvas;

  const contrastStrength = clamp(enhance.contrast, 0, 100) / 100;
  const saturationStrength = clamp(enhance.saturation, 0, 100) / 100;
  const exposureStrength = clamp(enhance.exposure, -100, 100) / 100;
  const denoiseStrength = clamp(enhance.denoise, 0, 100) / 100;

  if (contrastStrength <= 0.001 && saturationStrength <= 0.001 && Math.abs(exposureStrength) <= 0.001 && denoiseStrength <= 0.001 && !enhance.autoColor) {
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

  const contrastFactor = 1 + contrastStrength * 0.45;
  const saturationFactor = 1 + saturationStrength * 0.55;
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

    pixels[i] = clamp(Math.round(r), 0, 255);
    pixels[i + 1] = clamp(Math.round(g), 0, 255);
    pixels[i + 2] = clamp(Math.round(b), 0, 255);
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
  const finalCanvas = applySharpen(enhancedCanvas, opt.sharpenAmount);

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
