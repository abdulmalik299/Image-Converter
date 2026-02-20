import { fileToBitmap, fitWithin } from "./imageDecode";
import { safeBaseName } from "./format";
import type { ColorTuneSettings } from "./settings";
import type { RasterOut } from "./rasterFormats";

export type { RasterOut };

export type RasterConvertOptions = {
  out: RasterOut;
  quality: number;
  keepSize: boolean;
  maxWidth: number;
  maxHeight: number;
  resizeMode: "contain" | "cover";
  jpgBackground: string;
  stripMetadataHint: boolean;
  smoothing: boolean;
  smoothingQuality: "low" | "medium" | "high";
  sharpenAmount: number;
  pngCompression: "balanced" | "quality";
  chromaSubsampling: "420" | "444";
  resampleStrength?: number;
  enhance?: {
    autoColor: boolean;
    contrast: number;
    saturation: number;
    exposure: number;
    denoise: number;
    detailRecovery?: number;
    colorTune?: ColorTuneSettings;
  };
};

type Hsl = { h: number; s: number; l: number };
const COLOR_CENTERS: Array<keyof ColorTuneSettings> = ["red", "orange", "yellow", "green", "cyan", "blue", "magenta"];
const COLOR_HUE_CENTER: Record<keyof ColorTuneSettings, number> = { red: 0, orange: 30, yellow: 60, green: 120, cyan: 180, blue: 240, magenta: 300 };
const clamp = (n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

function createCanvas(w:number,h:number){const c=document.createElement("canvas");c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));const ctx=c.getContext("2d",{alpha:true});if(!ctx) throw new Error("Canvas not supported");return {canvas:c,ctx};}

function drawResized(bmp: ImageBitmap, opt: RasterConvertOptions) {
  const fit = fitWithin(bmp.width, bmp.height, opt.maxWidth, opt.maxHeight);
  const outputW = opt.keepSize ? bmp.width : fit.w;
  const outputH = opt.keepSize ? bmp.height : fit.h;
  const { canvas, ctx } = createCanvas(outputW, outputH);
  if (opt.out === "jpg" || opt.out === "jpeg") { ctx.fillStyle = opt.jpgBackground; ctx.fillRect(0,0,outputW,outputH); }
  ctx.imageSmoothingEnabled = opt.smoothing;
  ctx.imageSmoothingQuality = opt.smoothingQuality;
  ctx.drawImage(bmp,0,0,outputW,outputH);
  return canvas;
}

function rgbToHsl(r:number,g:number,b:number):Hsl{const rn=r/255,gn=g/255,bn=b/255;const max=Math.max(rn,gn,bn),min=Math.min(rn,gn,bn);const d=max-min;let h=0,s=0;const l=(max+min)/2;if(d>0){s=d/(1-Math.abs(2*l-1));if(max===rn) h=60*(((gn-bn)/d)%6);else if(max===gn) h=60*((bn-rn)/d+2);else h=60*((rn-gn)/d+4);}if(h<0)h+=360;return {h,s:clamp(s,0,1),l:clamp(l,0,1)};}
function hslToRgb(h:number,s:number,l:number){const c=(1-Math.abs(2*l-1))*s;const hp=h/60;const x=c*(1-Math.abs((hp%2)-1));let r1=0,g1=0,b1=0;if(hp<1)[r1,g1,b1]=[c,x,0];else if(hp<2)[r1,g1,b1]=[x,c,0];else if(hp<3)[r1,g1,b1]=[0,c,x];else if(hp<4)[r1,g1,b1]=[0,x,c];else if(hp<5)[r1,g1,b1]=[x,0,c];else [r1,g1,b1]=[c,0,x];const m=l-c/2;return {r:clamp(Math.round((r1+m)*255),0,255),g:clamp(Math.round((g1+m)*255),0,255),b:clamp(Math.round((b1+m)*255),0,255)};}

function applySelectiveColor(hsl:Hsl, tune?:ColorTuneSettings):Hsl{
  if(!tune) return hsl;
  let hs=0,ss=0,ls=0;
  for(const band of COLOR_CENTERS){const dist=Math.min(Math.abs(hsl.h-COLOR_HUE_CENTER[band]),360-Math.abs(hsl.h-COLOR_HUE_CENTER[band]));const w=clamp(1-dist/55,0,1);if(!w)continue;hs+=tune[band].hue*w;ss+=tune[band].saturation*w;ls+=tune[band].lightness*w;}
  return {h:(hsl.h+hs+360)%360,s:clamp(hsl.s+ss/100,0,1),l:clamp(hsl.l+ls/100,0,1)};
}

function applyAiEnhance(canvas: HTMLCanvasElement, enhance?: RasterConvertOptions["enhance"]) {
  if (!enhance) return canvas;
  const { canvas: out, ctx } = createCanvas(canvas.width, canvas.height);
  const sourceCtx = canvas.getContext("2d");
  if (!sourceCtx) return canvas;
  const img = sourceCtx.getImageData(0,0,canvas.width,canvas.height);
  const d = img.data;
  const contrast=1+clamp(enhance.contrast,0,100)/100*0.6;
  const sat=1+clamp(enhance.saturation,0,100)/100*0.7;
  const exp=clamp(enhance.exposure,-100,100)/100*30;
  for(let i=0;i<d.length;i+=4){
    let r=d[i],g=d[i+1],b=d[i+2];
    r=(r-128)*contrast+128+exp; g=(g-128)*contrast+128+exp; b=(b-128)*contrast+128+exp;
    const luma=0.2126*r+0.7152*g+0.0722*b;
    r=luma+(r-luma)*sat; g=luma+(g-luma)*sat; b=luma+(b-luma)*sat;
    const tuned=applySelectiveColor(rgbToHsl(r,g,b), enhance.colorTune);
    const rem=hslToRgb(tuned.h,tuned.s,tuned.l);
    d[i]=rem.r; d[i+1]=rem.g; d[i+2]=rem.b;
  }
  ctx.putImageData(img,0,0);
  return out;
}

type Encoded = { blob: Blob; ext: string };

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const str = String(fr.result || "");
      resolve(str.split(",")[1] || "");
    };
    fr.onerror = () => reject(new Error("Base64 conversion failed"));
    fr.readAsDataURL(blob);
  });
}

async function encodeCanvas(canvas: HTMLCanvasElement, out: RasterOut, quality: number): Promise<Encoded> {
  if (out === "svg") {
    const png = await encodeCanvas(canvas, "png", quality);
    const b64 = await blobToBase64(png.blob);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}"><image href="data:image/png;base64,${b64}" width="100%" height="100%"/></svg>`;
    return { blob: new Blob([svg], { type: "image/svg+xml" }), ext: "svg" };
  }
  if (out === "raw") {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Raw export failed");
    const data = ctx.getImageData(0,0,canvas.width,canvas.height).data;
    return { blob: new Blob([data], { type: "application/octet-stream" }), ext: "raw" };
  }
  const mime: Record<RasterOut,string> = {
    png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", webp:"image/webp", avif:"image/avif", gif:"image/gif", tiff:"image/tiff", bmp:"image/bmp", jp2:"image/jp2", ico:"image/x-icon", raw:"application/octet-stream", svg:"image/svg+xml"
  };
  const fallback: RasterOut = out === "jp2" || out === "ico" || out === "tiff" || out === "gif" || out === "bmp" ? "png" : out;
  const targetMime = mime[out];
  const q = ["png","bmp","gif","tiff","ico"].includes(out) ? undefined : clamp(quality/100,0,1);
  const makeBlob = (m:string)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob((b)=>b?resolve(b):reject(new Error("Encode failed")),m,q));
  let blob:Blob;
  try { blob = await makeBlob(targetMime); }
  catch { blob = await makeBlob(mime[fallback]); return { blob, ext: fallback }; }
  return { blob, ext: out };
}

export async function convertRaster(file: File, opt: RasterConvertOptions) {
  const bmp = await fileToBitmap(file);
  const baseCanvas = drawResized(bmp, opt);
  bmp.close?.();
  const enhanced = applyAiEnhance(baseCanvas, opt.enhance);
  const encoded = await encodeCanvas(enhanced, opt.out, opt.quality);
  const base = safeBaseName(file.name);
  return { blob: encoded.blob, outName: `${base}.${encoded.ext}`, width: enhanced.width, height: enhanced.height };
}
