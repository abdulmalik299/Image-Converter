import { fileToBitmap, fitWithin } from "./imageDecode";
import { safeBaseName } from "./format";

export type RasterOut = "png" | "jpg" | "webp";

export type RasterConvertOptions = {
  out: RasterOut;
  quality: number;            // 0..100
  keepSize: boolean;
  maxWidth: number;
  maxHeight: number;
  jpgBackground: string;
  stripMetadataHint: boolean;
};

export async function convertRaster(file: File, opt: RasterConvertOptions) {
  const bmp = await fileToBitmap(file);

  const size = opt.keepSize
    ? { w: bmp.width, h: bmp.height, scale: 1 }
    : fitWithin(bmp.width, bmp.height, opt.maxWidth, opt.maxHeight);

  const canvas = document.createElement("canvas");
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser does not support Canvas.");

  if (opt.out === "jpg") {
    ctx.fillStyle = opt.jpgBackground;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();

  const mime = opt.out === "png" ? "image/png" : opt.out === "jpg" ? "image/jpeg" : "image/webp";
  const q = Math.max(0, Math.min(1, opt.quality / 100));

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode the output file."))),
      mime,
      opt.out === "png" ? undefined : q
    );
  });

  const base = safeBaseName(file.name);
  const outName = `${base}.${opt.out === "jpg" ? "jpg" : opt.out}`;

  return { blob, outName, width: canvas.width, height: canvas.height };
}
