export type RasterOut = "png" | "jpg" | "webp";
export type ResizeMode = "contain" | "cover";
export type ChromaSubsampling = "420" | "444";

export type ColorBandAdjust = {
  hue: number;
  saturation: number;
  lightness: number;
};

export type ColorTuneSettings = {
  red: ColorBandAdjust;
  orange: ColorBandAdjust;
  yellow: ColorBandAdjust;
  green: ColorBandAdjust;
  cyan: ColorBandAdjust;
  blue: ColorBandAdjust;
  magenta: ColorBandAdjust;
};

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
  aiEnhance: boolean;
  autoColor: boolean;
  aiContrast: number;
  aiSaturation: number;
  aiExposure: number;
  aiDenoise: number;
  detailRecovery: number;
  resampleStrength: number;
  ultraHdLongEdge: number;
  colorTune: ColorTuneSettings;
};

const neutralBand: ColorBandAdjust = { hue: 0, saturation: 0, lightness: 0 };

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
  chromaSubsampling: "444",
  aiEnhance: true,
  autoColor: true,
  aiContrast: 38,
  aiSaturation: 24,
  aiExposure: 10,
  aiDenoise: 22,
  detailRecovery: 55,
  resampleStrength: 65,
  ultraHdLongEdge: 0,
  colorTune: {
    red: { ...neutralBand },
    orange: { ...neutralBand },
    yellow: { ...neutralBand },
    green: { ...neutralBand },
    cyan: { ...neutralBand },
    blue: { ...neutralBand },
    magenta: { ...neutralBand }
  }
};
