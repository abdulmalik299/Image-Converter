export type TabKey =
  | "png-jpg"
  | "png-webp"
  | "jpg-webp"
  | "any-raster"
  | "raster-svg"
  | "svg-raster"
  | "batch"
  | "finder"
  | "help";

export const TABS: { key: TabKey; label: string; desc: string; icon: string }[] = [
  { key: "png-jpg", label: "PNG ↔ JPG", desc: "Simple photo/graphics conversion", icon: "🖼️" },
  { key: "png-webp", label: "PNG ↔ WebP", desc: "Smaller files for websites", icon: "🌐" },
  { key: "jpg-webp", label: "JPG ↔ WebP", desc: "Photo compression with quality control", icon: "📷" },
  { key: "any-raster", label: "Any Raster → Raster", desc: "Convert between many common image formats", icon: "🔄" },
  { key: "raster-svg", label: "Raster → SVG", desc: "Turn logos and artwork into vector files", icon: "✨" },
  { key: "svg-raster", label: "SVG → Raster", desc: "Export SVG at exact image sizes", icon: "📐" },
  { key: "batch", label: "Batch ZIP", desc: "Convert many files and download once", icon: "📦" },
  { key: "finder", label: "Conversion Finder", desc: "Tell us from/to and get the best path", icon: "🧭" },
  { key: "help", label: "Help & Tips", desc: "Friendly answers and quality suggestions", icon: "💡" }
];
