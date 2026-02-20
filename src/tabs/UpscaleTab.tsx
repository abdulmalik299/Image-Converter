import { useMemo, useState } from "react";
import { Card, Button, Field, Input, Select, Slider } from "../components/ui";
import { Dropzone } from "../components/Dropzone";
import { Toast, type ToastState } from "../components/Toast";
import { downloadBlob } from "../lib/download";
import { convertRaster } from "../lib/rasterConvert";
import type { CommonRasterSettings } from "../lib/settings";
import { RASTER_OUTPUTS } from "../lib/rasterFormats";
import { fileToBitmap } from "../lib/imageDecode";

const ACCEPT = ["image/png","image/jpeg","image/webp","image/bmp","image/gif","image/avif","image/tiff","image/x-icon"];

function uid(){ return `${Date.now()}-${Math.random()}`; }

type Item={id:string;file:File;url:string};

export function UpscaleTab({ settings, setSettings }: { settings: CommonRasterSettings; setSettings: (up:(p:CommonRasterSettings)=>CommonRasterSettings)=>void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>({open:false,message:""});
  const [mode, setMode] = useState<"single"|"collage">("single");
  const [cropX, setCropX] = useState(0); const [cropY, setCropY] = useState(0); const [cropW, setCropW] = useState(100); const [cropH, setCropH] = useState(100);
  const [cellW, setCellW] = useState(1024); const [cellH,setCellH]=useState(1024); const [cols,setCols]=useState(2);

  const preview = items[0]?.url;
  const canConvert = items.length > 0;
  const estOut = useMemo(()=> `${settings.out.toUpperCase()} • Q${settings.quality}`, [settings]);

  const preprocessSingle = async (file: File) => {
    const bmp = await fileToBitmap(file);
    const sx = Math.round((cropX / 100) * bmp.width);
    const sy = Math.round((cropY / 100) * bmp.height);
    const sw = Math.max(1, Math.round((cropW / 100) * bmp.width));
    const sh = Math.max(1, Math.round((cropH / 100) * bmp.height));
    const canvas = document.createElement("canvas"); canvas.width = sw; canvas.height = sh;
    const ctx = canvas.getContext("2d"); if(!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
    bmp.close?.();
    const blob = await new Promise<Blob>((resolve,reject)=>canvas.toBlob((b)=>b?resolve(b):reject(new Error("Failed crop")),"image/png"));
    return new File([blob], `edited-${file.name}`, {type:"image/png"});
  };

  const preprocessCollage = async () => {
    const rows = Math.ceil(items.length / cols);
    const canvas = document.createElement("canvas");
    canvas.width = cols * cellW; canvas.height = rows * cellH;
    const ctx = canvas.getContext("2d"); if(!ctx) throw new Error("Canvas unavailable");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,canvas.width,canvas.height);
    for (let i=0;i<items.length;i++){
      const bmp = await fileToBitmap(items[i].file);
      const r = Math.floor(i/cols), c=i%cols;
      const fit = Math.min(cellW / bmp.width, cellH / bmp.height);
      const dw = bmp.width * fit, dh = bmp.height * fit;
      const dx = c*cellW + (cellW - dw)/2; const dy = r*cellH + (cellH - dh)/2;
      ctx.drawImage(bmp, dx, dy, dw, dh); bmp.close?.();
    }
    const blob = await new Promise<Blob>((resolve,reject)=>canvas.toBlob((b)=>b?resolve(b):reject(new Error("Collage fail")),"image/png"));
    return new File([blob], "collage.png", {type:"image/png"});
  };

  return <>
    <Toast state={toast} onClose={()=>setToast(t=>({...t,open:false}))} />
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-5">
        <Card title="Adjustments" subtitle="Modern photo editing: crop, collage, and HSL color edits.">
          <Dropzone accept={ACCEPT} multiple label="Drop images" helper="For collage, drop multiple images." onFiles={(files)=>setItems((p)=>[...p,...files.map((f)=>({id:uid(),file:f,url:URL.createObjectURL(f)}))].slice(0,100))} />
          {preview ? <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"><img src={preview} className="w-full max-h-[480px] object-contain rounded-xl"/></div> : null}
          <div className="mt-4 flex gap-2"><Button variant={mode==="single"?"primary":"ghost"} onClick={()=>setMode("single")}>✂️ Crop & Edit</Button><Button variant={mode==="collage"?"primary":"ghost"} onClick={()=>setMode("collage")}>🧩 Collage</Button></div>
          {mode==="single" ? <div className="mt-4 grid grid-cols-2 gap-3">
            <Field label="Crop X %"><Slider min={0} max={90} value={cropX} onChange={e=>setCropX(Number(e.target.value))} /></Field>
            <Field label="Crop Y %"><Slider min={0} max={90} value={cropY} onChange={e=>setCropY(Number(e.target.value))} /></Field>
            <Field label="Crop Width %"><Slider min={10} max={100} value={cropW} onChange={e=>setCropW(Number(e.target.value))} /></Field>
            <Field label="Crop Height %"><Slider min={10} max={100} value={cropH} onChange={e=>setCropH(Number(e.target.value))} /></Field>
          </div> : <div className="mt-4 grid grid-cols-3 gap-3"><Field label="Columns"><Input type="number" min={1} max={8} value={cols} onChange={e=>setCols(Number(e.target.value)||1)}/></Field><Field label="Cell width"><Input type="number" min={128} value={cellW} onChange={e=>setCellW(Number(e.target.value)||1024)}/></Field><Field label="Cell height"><Input type="number" min={128} value={cellH} onChange={e=>setCellH(Number(e.target.value)||1024)}/></Field></div>}

          <div className="mt-4 flex gap-2">
            <Button disabled={!canConvert || busy} onClick={async()=>{try{setBusy(true); const src = mode==="collage" ? await preprocessCollage() : await preprocessSingle(items[0].file); const res = await convertRaster(src,{ out: settings.out, quality: settings.quality, keepSize:true, maxWidth: settings.maxWidth, maxHeight: settings.maxHeight, resizeMode:"contain", jpgBackground: settings.jpgBackground, stripMetadataHint:true, smoothing:true, smoothingQuality:"high", sharpenAmount: settings.sharpenAmount, pngCompression:"quality", chromaSubsampling: settings.chromaSubsampling, enhance:{autoColor:false,contrast:settings.aiContrast,saturation:settings.aiSaturation,exposure:settings.aiExposure,denoise:settings.aiDenoise,detailRecovery:settings.detailRecovery,colorTune:settings.colorTune}}); downloadBlob(res.blob, res.outName); setToast({open:true,message:"Edited image exported.",type:"ok"}); } catch(e:any){setToast({open:true,message:e?.message||"Failed",type:"error"});} finally{setBusy(false);}}}>Export adjusted image</Button>
            <Button variant="ghost" onClick={()=>{items.forEach(i=>URL.revokeObjectURL(i.url)); setItems([]);}}>Clear</Button>
          </div>
        </Card>
      </div>
      <div className="space-y-5">
        <Card title="⚙️ Editing settings" subtitle={estOut}>
          <div className="space-y-4">
            <Field label="🖼️ Output format"><Select value={settings.out} onChange={(e)=>setSettings(p=>({...p,out:e.target.value as any}))}>{RASTER_OUTPUTS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</Select></Field>
            <Field label="🎚️ Quality" hint={`${settings.quality}%`}><Slider min={80} max={100} value={settings.quality} onChange={e=>setSettings(p=>({...p,quality:Number(e.target.value)}))}/></Field>
            <Field label="🌈 Reds hue" hint={`${settings.colorTune.red.hue}`}><Slider min={-50} max={50} value={settings.colorTune.red.hue} onChange={(e)=>setSettings(p=>({...p,colorTune:{...p.colorTune,red:{...p.colorTune.red,hue:Number(e.target.value)}}}))}/></Field>
            <Field label="🌈 Greens saturation" hint={`${settings.colorTune.green.saturation}`}><Slider min={-50} max={50} value={settings.colorTune.green.saturation} onChange={(e)=>setSettings(p=>({...p,colorTune:{...p.colorTune,green:{...p.colorTune.green,saturation:Number(e.target.value)}}}))}/></Field>
            <Field label="🌈 Blues lightness" hint={`${settings.colorTune.blue.lightness}`}><Slider min={-50} max={50} value={settings.colorTune.blue.lightness} onChange={(e)=>setSettings(p=>({...p,colorTune:{...p.colorTune,blue:{...p.colorTune.blue,lightness:Number(e.target.value)}}}))}/></Field>
            <Field label="☀️ Exposure" hint={`${settings.aiExposure}`}><Slider min={-100} max={100} value={settings.aiExposure} onChange={(e)=>setSettings(p=>({...p,aiExposure:Number(e.target.value)}))}/></Field>
            <Field label="🎨 Saturation" hint={`${settings.aiSaturation}`}><Slider min={0} max={100} value={settings.aiSaturation} onChange={(e)=>setSettings(p=>({...p,aiSaturation:Number(e.target.value)}))}/></Field>
            <Field label="🧼 Denoise" hint={`${settings.aiDenoise}`}><Slider min={0} max={100} value={settings.aiDenoise} onChange={(e)=>setSettings(p=>({...p,aiDenoise:Number(e.target.value)}))}/></Field>
          </div>
        </Card>
      </div>
    </div>
  </>;
}
