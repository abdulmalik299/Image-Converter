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

export async function convertRaster(file: File, opt: RasterConvertOptions) {
  const bmp = await fileToBitmap(file);
  const { canvas } = drawResized(bmp, opt);
  bmp.close?.();

  const finalCanvas = applySharpen(canvas, opt.sharpenAmount);

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
