import ImageTracer from "imagetracerjs";
import { safeBaseName } from "./format";

export type VectorPresetKey =
  | "logo_clean"
  | "logo_detailed"
  | "illustration"
  | "photo_soft"
  | "pixel_art"
  | "custom";

export type VectorizeSettings = {
  preset: VectorPresetKey;
  colorCount: number;           // 2..64
  pathOmit: number;             // 0..50
  blurRadius: number;           // 0..5
  lineThreshold: number;        // 0..100
  transparentBackground: boolean;
};

export const defaultVectorize: VectorizeSettings = {
  preset: "logo_clean",
  colorCount: 8,
  pathOmit: 8,
  blurRadius: 0,
  lineThreshold: 15,
  transparentBackground: true
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function presetOptions(preset: VectorPresetKey): Record<string, any> {
  switch (preset) {
    case "logo_clean":
      return { numberofcolors: 6, pathomit: 10, ltres: 15, qtres: 15, blurradius: 0, rightangleenhance: true };
    case "logo_detailed":
      return { numberofcolors: 12, pathomit: 5, ltres: 10, qtres: 10, blurradius: 0, rightangleenhance: true };
    case "illustration":
      return { numberofcolors: 16, pathomit: 6, ltres: 12, qtres: 12, blurradius: 1, rightangleenhance: false };
    case "photo_soft":
      return { numberofcolors: 32, pathomit: 3, ltres: 8, qtres: 8, blurradius: 2, rightangleenhance: false };
    case "pixel_art":
      return { numberofcolors: 10, pathomit: 0, ltres: 25, qtres: 25, blurradius: 0, rightangleenhance: false };
    case "custom":
    default:
      return {};
  }
}

function mergeOptions(s: VectorizeSettings): Record<string, any> {
  const base = presetOptions(s.preset);
  return {
    ...base,
    numberofcolors: clamp(s.colorCount, 2, 64),
    pathomit: clamp(s.pathOmit, 0, 50),
    blurradius: clamp(s.blurRadius, 0, 5),
    ltres: clamp(s.lineThreshold, 0, 100),
    qtres: clamp(s.lineThreshold, 0, 100),
    background: s.transparentBackground ? "transparent" : "#ffffff"
  };
}

async function fileToImageData(file: File): Promise<ImageData> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser does not support Canvas.");
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export async function rasterToSvg(file: File, settings: VectorizeSettings) {
  const imgData = await fileToImageData(file);
  const options = mergeOptions(settings);
  const svg = ImageTracer.imagedataToSVG(imgData, options);
  const outName = `${safeBaseName(file.name)}.svg`;
  return { svgText: svg, outName };
}
