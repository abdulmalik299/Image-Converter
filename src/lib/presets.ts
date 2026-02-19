export type SizePreset = { id: string; label: string; w: number; h: number; note: string };

export const SOCIAL_SIZE_PRESETS: SizePreset[] = [
  { id: "ig_square", label: "Instagram Post (Square)", w: 1080, h: 1080, note: "Most common IG post size." },
  { id: "ig_portrait", label: "Instagram Post (Portrait)", w: 1080, h: 1350, note: "More screen space in feed." },
  { id: "tiktok", label: "TikTok / Reels (Vertical)", w: 1080, h: 1920, note: "Full-screen vertical content." },
  { id: "yt_thumb", label: "YouTube Thumbnail", w: 1280, h: 720, note: "Standard YouTube thumbnail." },
  { id: "fb_cover", label: "Facebook Cover", w: 820, h: 312, note: "Desktop cover size." },
  { id: "web_hero", label: "Website Hero", w: 1920, h: 1080, note: "Common hero/banner size." },
];

export type FormatTip = { id: string; title: string; goodFor: string[]; avoidFor: string[]; notes: string[] };

export const FORMAT_TIPS: FormatTip[] = [
  {
    id: "png",
    title: "PNG",
    goodFor: ["Logos", "Text/UI", "Transparency", "Screenshots"],
    avoidFor: ["Large photo libraries (can be big)"],
    notes: ["Lossless", "Transparency supported", "Often bigger than JPG/WebP for photos"],
  },
  {
    id: "jpg",
    title: "JPG",
    goodFor: ["Photos", "Gradients", "Small-ish file sizes"],
    avoidFor: ["Transparency", "Hard-edge text/logos (can show artifacts)"],
    notes: ["Lossy", "No transparency", "Use 85–95 quality for most needs"],
  },
  {
    id: "webp",
    title: "WebP",
    goodFor: ["Web performance", "Photos", "Transparent graphics"],
    avoidFor: ["Very old software that doesn't support WebP"],
    notes: ["Modern format", "Often smaller at similar quality", "Can be lossless or lossy"],
  },
  {
    id: "svg",
    title: "SVG",
    goodFor: ["Logos", "Icons", "Illustrations", "Infinite scaling"],
    avoidFor: ["Photographs (can become huge when traced)"],
    notes: ["Vector shapes not pixels", "Raster→SVG is tracing/estimation"],
  },
];

export type RasterFormat = "png" | "jpg" | "webp";

export function detectRasterFormat(file: File): RasterFormat {
  const t = (file.type || "").toLowerCase();
  if (t.includes("png")) return "png";
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  if (t.includes("webp")) return "webp";

  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpg";
  if (name.endsWith(".webp")) return "webp";
  return "png";
}

export const FORMAT_QUALITY_PRESETS: Record<RasterFormat, { label: string; quality: number; smoothingQuality: "medium" | "high"; sharpenAmount: number; chromaSubsampling: "420" | "444" }> = {
  png: { label: "PNG master", quality: 100, smoothingQuality: "high", sharpenAmount: 15, chromaSubsampling: "444" },
  jpg: { label: "JPG photo max", quality: 100, smoothingQuality: "high", sharpenAmount: 18, chromaSubsampling: "444" },
  webp: { label: "WebP HQ", quality: 100, smoothingQuality: "high", sharpenAmount: 16, chromaSubsampling: "444" }
};
