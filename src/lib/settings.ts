export type RasterOut = "png" | "jpg" | "webp";

export type CommonRasterSettings = {
  out: RasterOut;
  quality: number;
  keepSize: boolean;
  maxWidth: number;
  maxHeight: number;
  jpgBackground: string;
  fileNamePattern: string; // {name}.{ext}
  stripMetadataHint: boolean;
};

export const defaultRasterSettings: CommonRasterSettings = {
  out: "png",
  quality: 92,
  keepSize: true,
  maxWidth: 2048,
  maxHeight: 2048,
  jpgBackground: "#ffffff",
  fileNamePattern: "{name}.{ext}",
  stripMetadataHint: true
};
