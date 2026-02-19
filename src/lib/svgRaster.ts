import { safeBaseName } from "./format";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function svgToRaster(file: File, opt: {
  out: "png" | "jpg" | "webp";
  width: number;
  height: number;
  quality: number; // 0..100
  jpgBackground: string;
  smoothing: boolean;
  smoothingQuality: "low" | "medium" | "high";
  sharpenAmount: number;
  chromaSubsampling: "420" | "444";
}) {
  const svgText = await file.text();
  const svgBlob = new Blob([svgText], { type: "image/svg+xml" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load SVG. The file might be invalid."));
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(opt.width));
    canvas.height = Math.max(1, Math.floor(opt.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser does not support Canvas.");

    ctx.imageSmoothingEnabled = opt.smoothing;
    ctx.imageSmoothingQuality = opt.smoothingQuality;

    if (opt.out === "jpg") {
      ctx.fillStyle = opt.jpgBackground;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const mime = opt.out === "png" ? "image/png" : opt.out === "jpg" ? "image/jpeg" : "image/webp";
    const q = opt.out === "png" ? undefined : clamp(opt.quality / 100 + (opt.chromaSubsampling === "444" ? 0.02 : 0), 0, 1);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to encode output."))), mime, q);
    });

    const base = safeBaseName(file.name);
    return { blob, outName: `${base}.${opt.out}` };
  } finally {
    URL.revokeObjectURL(url);
  }
}
