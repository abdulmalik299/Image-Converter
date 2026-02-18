import { useMemo, useState } from "react";
import { Card, Button, Field, Input, Select, Slider, Divider } from "../components/ui";
import { Dropzone } from "../components/Dropzone";
import { PreviewGrid, PreviewItem } from "../components/PreviewGrid";
import { Toast, ToastState } from "../components/Toast";
import { convertRaster } from "../lib/rasterConvert";
import { downloadZip } from "../lib/download";
import type { CommonRasterSettings } from "../lib/settings";
import { humanBytes } from "../lib/format";

function uid() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

const ACCEPT = [
  "image/png","image/jpeg","image/webp","image/bmp","image/gif","image/avif","image/tiff","image/x-icon"
];

function nameByPattern(pattern: string, base: string, ext: string) {
  return pattern.replaceAll("{name}", base).replaceAll("{ext}", ext);
}

export function BatchZipTab({ settings, setSettings }: { settings: CommonRasterSettings; setSettings: (up:(p:CommonRasterSettings)=>CommonRasterSettings)=>void }) {
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>({ open:false, message:"" });

  const totalBytes = useMemo(() => items.reduce((a, b) => a + b.file.size, 0), [items]);

  return (
    <>
      <Toast state={toast} onClose={()=>setToast(t=>({ ...t, open:false }))} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card title="Batch Convert → Download ZIP" subtitle="Convert many files and download one ZIP (very common request).">
            <Dropzone
              accept={ACCEPT}
              multiple
              label="Drop many images here"
              helper="Limit: 200 files per batch (keeps the browser stable)."
              onFiles={(files)=>{
                const next = files.map(f=>({ id:uid(), file:f, url:URL.createObjectURL(f) }));
                setItems(p=>[...p, ...next].slice(0, 200));
              }}
            />
            <PreviewGrid
              items={items.slice(0, 12)}
              onRemove={(rid)=>setItems(p=>{
                const hit=p.find(x=>x.id===rid);
                if(hit) URL.revokeObjectURL(hit.url);
                return p.filter(x=>x.id!==rid);
              })}
            />
            {items.length > 12 ? <div className="mt-2 text-xs text-slate-400">Showing 12 previews. {items.length - 12} more queued.</div> : null}

            <Divider label="Create ZIP" />

            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={!items.length || busy} onClick={async ()=>{
                try{
                  setBusy(true);
                  const out: { name:string; blob:Blob }[] = [];
                  for(const it of items){
                    const base=it.file.name.replace(/\.[^.]+$/,"") || "image";
                    const res=await convertRaster(it.file,{
                      out: settings.out,
                      quality: settings.quality,
                      keepSize: settings.keepSize,
                      maxWidth: settings.maxWidth,
                      maxHeight: settings.maxHeight,
                      jpgBackground: settings.jpgBackground,
                      stripMetadataHint: settings.stripMetadataHint
                    });
                    out.push({ name: nameByPattern(settings.fileNamePattern, base, settings.out), blob: res.blob });
                  }
                  await downloadZip(out, "converted_images.zip");
                  setBusy(false);
                  setToast({ open:true, message:`ZIP created with ${out.length} file(s).`, type:"ok" });
                } catch(e:any){
                  setBusy(false);
                  setToast({ open:true, message:e?.message || "Batch failed.", type:"error" });
                }
              }}>Create ZIP</Button>

              <Button variant="ghost" disabled={!items.length || busy} onClick={()=>{
                items.forEach(i=>URL.revokeObjectURL(i.url));
                setItems([]);
                setToast({ open:true, message:"Cleared batch.", type:"info" });
              }}>Clear</Button>

              <div className="flex-1" />
              <div className="text-xs text-slate-300">{items.length} files • {humanBytes(totalBytes)}</div>
            </div>

            {busy ? (
              <div className="mt-4 rounded-2xl bg-sky-500/10 ring-1 ring-sky-400/20 px-4 py-3 text-sm text-sky-100">
                Working… keep this tab open until the ZIP downloads.
              </div>
            ) : null}
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Batch settings" subtitle="Same controls as raster conversion tabs.">
            <div className="space-y-4">
              <Field label="Output format">
                <Select value={settings.out} onChange={(e)=>setSettings(p=>({ ...p, out:e.target.value as any }))}>
                  <option value="png">PNG</option>
                  <option value="jpg">JPG</option>
                  <option value="webp">WebP</option>
                </Select>
              </Field>

              {(settings.out === "jpg" || settings.out === "webp") ? (
                <Field label="Quality" hint={`${settings.quality}%`}>
                  <Slider min={35} max={100} value={settings.quality} onChange={(e)=>setSettings(p=>({ ...p, quality:Number(e.target.value) }))} />
                </Field>
              ) : null}

              <div className="rounded-xl bg-white/5 ring-1 ring-white/10 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Resize</div>
                    <div className="text-xs text-slate-400 mt-1">Off = keep original size.</div>
                  </div>
                  <button className="rounded-xl bg-white/10 px-3 py-1.5 text-xs ring-1 ring-white/10 hover:bg-white/15"
                    onClick={()=>setSettings(p=>({ ...p, keepSize: !p.keepSize }))}>
                    {settings.keepSize ? "Keep size" : "Resize"}
                  </button>
                </div>

                {!settings.keepSize ? (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="Max width">
                      <Input type="number" min={64} max={12000} value={settings.maxWidth} onChange={(e)=>setSettings(p=>({ ...p, maxWidth:Number(e.target.value) }))} />
                    </Field>
                    <Field label="Max height">
                      <Input type="number" min={64} max={12000} value={settings.maxHeight} onChange={(e)=>setSettings(p=>({ ...p, maxHeight:Number(e.target.value) }))} />
                    </Field>
                    <div className="col-span-2 text-xs text-slate-400">Aspect ratio preserved.</div>
                  </div>
                ) : null}
              </div>

              {settings.out === "jpg" ? (
                <Field label="JPG background">
                  <Input value={settings.jpgBackground} onChange={(e)=>setSettings(p=>({ ...p, jpgBackground:e.target.value }))} />
                </Field>
              ) : null}

              <Field label="File naming pattern" hint="Use {name} + {ext}">
                <Input value={settings.fileNamePattern} onChange={(e)=>setSettings(p=>({ ...p, fileNamePattern:e.target.value }))} />
              </Field>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
