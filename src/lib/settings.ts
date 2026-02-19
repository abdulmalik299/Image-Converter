export type RasterOut = "png" | "jpg" | "webp";
export type ResizeMode = "contain" | "cover";
export type ChromaSubsampling = "420" | "444";

export type CommonRasterSettings = {
  out: RasterOut;
  quality: number;
  keepSize: boolean;
  maxWidth: number;
  maxHeight: number;
  resizeMode: ResizeMode;
  jpgBackground: string;
  fileNamePattern: string; // {name}.{ext}
  stripMetadataHint: boolean;
  smoothing: boolean;
  smoothingQuality: "low" | "medium" | "high";
  sharpenAmount: number; // 0..100
  pngCompression: "balanced" | "quality";
  chromaSubsampling: ChromaSubsampling;
};

export const defaultRasterSettings: CommonRasterSettings = {
  out: "png",
  quality: 100,
  keepSize: true,
  maxWidth: 2048,
  maxHeight: 2048,
  resizeMode: "contain",
  jpgBackground: "#ffffff",
  fileNamePattern: "{name}.{ext}",
  stripMetadataHint: true,
  smoothing: true,
  smoothingQuality: "high",
  sharpenAmount: 15,
  pngCompression: "quality",
  chromaSubsampling: "444"
};
