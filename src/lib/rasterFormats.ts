export type RasterOut =
  | "png"
  | "jpg"
  | "jpeg"
  | "webp"
  | "avif"
  | "gif"
  | "tiff"
  | "bmp"
  | "raw"
  | "jp2"
  | "ico"
  | "svg";

export const RASTER_OUTPUTS: Array<{ value: RasterOut; label: string; mimeHint: string }> = [
  { value: "png", label: "PNG", mimeHint: "image/png" },
  { value: "jpg", label: "JPG", mimeHint: "image/jpeg" },
  { value: "jpeg", label: "JPEG", mimeHint: "image/jpeg" },
  { value: "webp", label: "WebP", mimeHint: "image/webp" },
  { value: "avif", label: "AVIF", mimeHint: "image/avif" },
  { value: "gif", label: "GIF", mimeHint: "image/gif" },
  { value: "tiff", label: "TIFF", mimeHint: "image/tiff" },
  { value: "bmp", label: "BMP", mimeHint: "image/bmp" },
  { value: "raw", label: "RAW", mimeHint: "application/octet-stream" },
  { value: "jp2", label: "JPEG 2000", mimeHint: "image/jp2" },
  { value: "ico", label: "Icon (.ico)", mimeHint: "image/x-icon" },
  { value: "svg", label: "SVG", mimeHint: "image/svg+xml" }
];

export const JPEG_LIKE: RasterOut[] = ["jpg", "jpeg", "webp", "avif", "jp2"];
