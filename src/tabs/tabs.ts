export type TabKey =
  | "png-jpg"
  | "png-webp"
  | "jpg-webp"
  | "any-raster"
  | "raster-svg"
  | "svg-raster"
  | "batch"
  | "help";

export const TABS: { key: TabKey; label: string; desc: string }[] = [
  { key: "png-jpg", label: "PNG ↔ JPG", desc: "Transparency + background, best for photos/graphics" },
  { key: "png-webp", label: "PNG ↔ WebP", desc: "Modern web format, smaller files" },
  { key: "jpg-webp", label: "JPG ↔ WebP", desc: "Photo compression, quality control" },
  { key: "any-raster", label: "Any Raster → Raster", desc: "One place for PNG/JPG/WebP/BMP/GIF/AVIF…" },
  { key: "raster-svg", label: "PNG/JPG/WebP → SVG", desc: "Advanced vectorization (logos & illustrations)" },
  { key: "svg-raster", label: "SVG → PNG/JPG/WebP", desc: "Crisp export at exact size" },
  { key: "batch", label: "Batch ZIP", desc: "Convert many files and download a ZIP" },
  { key: "help", label: "Help & Tips", desc: "FAQ, best settings, why results vary" }
];
