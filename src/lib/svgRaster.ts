import { safeBaseName } from "./format";

export async function svgToRaster(file: File, opt: {
  out: "png" | "jpg" | "webp";
  width: number;
  height: number;
  quality: number; // 0..100
  jpgBackground: string;
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

    if (opt.out === "jpg") {
      ctx.fillStyle = opt.jpgBackground;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const mime = opt.out === "png" ? "image/png" : opt.out === "jpg" ? "image/jpeg" : "image/webp";
    const q = Math.max(0, Math.min(1, opt.quality / 100));

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to encode output."))), mime, opt.out === "png" ? undefined : q);
    });

    const base = safeBaseName(file.name);
    return { blob, outName: `${base}.${opt.out}` };
  } finally {
    URL.revokeObjectURL(url);
  }
}
