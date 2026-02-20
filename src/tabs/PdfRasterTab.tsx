import { useMemo, useState } from "react";
import JSZip from "jszip";
import { Button, Card, Field, Input, Select, Slider } from "../components/ui";
import { downloadBlob } from "../lib/download";
import { RASTER_OUTPUTS, type RasterOut } from "../lib/rasterFormats";
import { humanBytes } from "../lib/format";

declare global { interface Window { pdfjsLib?: any } }

const DPI_CHOICES = [150,300,600];

type PageMode = "current"|"range"|"all";

async function loadPdfLib(){
  if(window.pdfjsLib) return window.pdfjsLib;
  await new Promise<void>((resolve,reject)=>{
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.124/pdf.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load PDF library"));
    document.head.appendChild(script);
  });
  if(!window.pdfjsLib) throw new Error("Unable to load PDF library");
  return window.pdfjsLib;
}

function parseRange(input:string,max:number){
  const m=input.match(/(\d+)\s*-\s*(\d+)/); if(!m) return [1];
  const a=Math.max(1,Math.min(max,Number(m[1]))), b=Math.max(1,Math.min(max,Number(m[2])));
  const out:number[]=[]; for(let i=Math.min(a,b); i<=Math.max(a,b); i++) out.push(i); return out;
}

export function PdfRasterTab(){
  const [file,setFile]=useState<File|null>(null); const [busy,setBusy]=useState(false);
  const [dpi,setDpi]=useState(300); const [customDpi,setCustomDpi]=useState("300"); const [useCustom,setUseCustom]=useState(false);
  const [out,setOut]=useState<RasterOut>("png"); const [quality,setQuality]=useState(95);
  const [transparent,setTransparent]=useState(false); const [pageMode,setPageMode]=useState<PageMode>("current"); const [pageRange,setPageRange]=useState("1-1"); const [currentPage,setCurrentPage]=useState(1);
  const [renderMode,setRenderMode]=useState("normal"); const [superSharp,setSuperSharp]=useState(false);
  const [pages,setPages]=useState(0); const [preview,setPreview]=useState<string>(""); const [estimated,setEstimated]=useState(0); const [warning,setWarning]=useState(""); const [pdfType,setPdfType]=useState("Unknown");

  const finalDpi = useMemo(()=>useCustom?Math.max(72,Number(customDpi)||300):dpi,[useCustom,customDpi,dpi]);

  return <Card title="PDF → Raster" subtitle="Convert PDF pages to high-quality images with full rendering controls.">
    <input type="file" accept="application/pdf" onChange={e=>{const f=e.target.files?.[0]||null; setFile(f); setPreview("");}} className="text-sm"/>
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="DPI selector"><div className="flex gap-2"><Select value={useCustom?"custom":String(dpi)} onChange={(e)=>{if(e.target.value==="custom") setUseCustom(true); else {setUseCustom(false); setDpi(Number(e.target.value));}}}>{DPI_CHOICES.map(d=><option key={d} value={d}>{d}</option>)}<option value="custom">Custom</option></Select>{useCustom?<Input value={customDpi} onChange={e=>setCustomDpi(e.target.value.replace(/[^\d]/g,""))}/>:null}</div></Field>
      <Field label="Output format"><Select value={out} onChange={(e)=>setOut(e.target.value as RasterOut)}>{RASTER_OUTPUTS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</Select></Field>
      <Field label="JPEG/WebP quality" hint={`${quality}`}><Slider min={80} max={100} value={quality} onChange={e=>setQuality(Number(e.target.value))}/></Field>
      <Field label="Transparent background (PNG only)"><input type="checkbox" checked={transparent} onChange={e=>setTransparent(e.target.checked)} /></Field>
      <Field label="Page selection"><Select value={pageMode} onChange={e=>setPageMode(e.target.value as PageMode)}><option value="current">Current page</option><option value="range">Page range</option><option value="all">All pages (ZIP)</option></Select></Field>
      {pageMode==="current"?<Field label="Current page"><Input value={currentPage} type="number" onChange={e=>setCurrentPage(Number(e.target.value)||1)} /></Field>:null}
      {pageMode==="range"?<Field label="Page range"><Input value={pageRange} onChange={e=>setPageRange(e.target.value)} placeholder="1-5" /></Field>:null}
      <Field label="Render mode"><Select value={renderMode} onChange={e=>setRenderMode(e.target.value)}><option value="normal">Normal rendering</option><option value="print">Print-quality rendering</option><option value="text">Text-sharp mode</option><option value="contrast">High-contrast mode</option></Select></Field>
      <Field label="Super-sharp"><input type="checkbox" checked={superSharp} onChange={e=>setSuperSharp(e.target.checked)} /> Render higher then downscale</Field>
    </div>
    <div className="mt-3 text-xs text-slate-600">Live preview, estimated size, memory warning, and vector/scanned auto-detect are applied after loading PDF.</div>
    {warning?<div className="mt-2 text-amber-700 text-sm">⚠️ {warning}</div>:null}
    <div className="mt-2 text-sm">Detected PDF type: <b>{pdfType}</b> · Pages: <b>{pages||"-"}</b> · Estimated output size: <b>{estimated?humanBytes(estimated):"-"}</b></div>
    {preview?<img src={preview} className="mt-3 w-full max-h-[420px] object-contain rounded-xl border"/>:null}
    <div className="mt-4 flex gap-2"><Button disabled={!file||busy} onClick={async()=>{
      try{
        setBusy(true);
        const pdfjs = await loadPdfLib();
        pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.124/pdf.worker.min.js";
        const buf = await file!.arrayBuffer();
        const pdf = await pdfjs.getDocument({data:buf}).promise; setPages(pdf.numPages);
        const selected = pageMode==="all" ? Array.from({length:pdf.numPages},(_,i)=>i+1) : pageMode==="range" ? parseRange(pageRange,pdf.numPages) : [Math.max(1,Math.min(pdf.numPages,currentPage))];
        const zip = new JSZip();
        for(const p of selected){
          const page = await pdf.getPage(p);
          const text = await page.getTextContent(); if(text.items?.length>0) setPdfType("Vector / selectable text"); else setPdfType("Scanned / image PDF");
          const scale = (finalDpi/72) * (superSharp?2:1); const vp = page.getViewport({scale});
          const c=document.createElement("canvas"); c.width=Math.ceil(vp.width); c.height=Math.ceil(vp.height);
          const ctx = c.getContext("2d", {alpha: transparent && out==="png"}); if(!ctx) throw new Error("Canvas unavailable");
          if(!(transparent && out==="png")){ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);} ctx.imageSmoothingEnabled = renderMode!=="text"; ctx.imageSmoothingQuality = renderMode==="print"?"high":"medium";
          await page.render({canvasContext:ctx,viewport:vp}).promise;
          if(renderMode==="contrast"){const img=ctx.getImageData(0,0,c.width,c.height); for(let i=0;i<img.data.length;i+=4){img.data[i]=Math.min(255,img.data[i]*1.1);img.data[i+1]=Math.min(255,img.data[i+1]*1.1);img.data[i+2]=Math.min(255,img.data[i+2]*1.1);} ctx.putImageData(img,0,0);}          
          let outCanvas=c;
          if(superSharp){const d=document.createElement("canvas"); d.width=Math.round(c.width/2); d.height=Math.round(c.height/2); d.getContext("2d")!.drawImage(c,0,0,d.width,d.height); outCanvas=d;}
          const mime = out==="jpg"||out==="jpeg"?"image/jpeg":out==="webp"?"image/webp":"image/png";
          const blob:Blob = await new Promise((resolve,reject)=>outCanvas.toBlob((b)=>b?resolve(b):reject(new Error("Encode failed")), mime, quality/100));
          setEstimated((v)=>v+blob.size);
          if(p===selected[0]) setPreview(URL.createObjectURL(blob));
          const ext = mime==="image/jpeg"?"jpg":mime==="image/webp"?"webp":"png";
          if(selected.length===1) downloadBlob(blob, `${file!.name.replace(/\.pdf$/i,"")}-p${p}.${ext}`); else zip.file(`page-${p}.${ext}`, blob);
        }
        if(selected.length>1){ const zb = await zip.generateAsync({type:"blob", compression:"DEFLATE"}); downloadBlob(zb, `${file!.name.replace(/\.pdf$/i,"")}-pages.zip`);}        
        const mega = (finalDpi/150) * (selected.length||1); if(mega>8) setWarning("High DPI on many pages may consume large memory.");
      } finally {setBusy(false);}    
    }}>Convert PDF</Button></div>
  </Card>;
}
