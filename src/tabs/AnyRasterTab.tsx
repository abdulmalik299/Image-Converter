import { useState } from "react";
import { Card, Button, Field, Input, Select, Slider, Divider } from "../components/ui";
import { Dropzone } from "../components/Dropzone";
import { PreviewGrid, PreviewItem } from "../components/PreviewGrid";
import { Toast, ToastState } from "../components/Toast";
import { convertRaster } from "../lib/rasterConvert";
import { downloadBlob } from "../lib/download";
import type { CommonRasterSettings } from "../lib/settings";

function uid() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

const ACCEPT = [
  "image/png","image/jpeg","image/webp","image/bmp","image/gif","image/avif","image/tiff","image/x-icon"
];

function nameByPattern(pattern: string, base: string, ext: string) {
  return pattern.replaceAll("{name}", base).replaceAll("{ext}", ext);
}

export function AnyRasterTab({ settings, setSettings }: { settings: CommonRasterSettings; setSettings: (up:(p:CommonRasterSettings)=>CommonRasterSettings)=>void }) {
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>({ open:false, message:"" });

  return (
    <>
      <Toast state={toast} onClose={()=>setToast(t=>({ ...t, open:false }))} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card title="Any Raster → Raster" subtitle="One place to convert PNG/JPG/WebP/BMP/GIF/AVIF/TIFF/ICO (browser-dependent).">
            <Dropzone
              accept={ACCEPT}
              multiple
              label="Drop images here"
              helper="If one file fails, it may be a format your browser can't decode. Try Chrome/Edge."
              onFiles={(files)=>{
                const next: PreviewItem[] = files.map(f=>({ id:uid(), file:f, url:URL.createObjectURL(f) }));
                setItems(p=>[...p, ...next].slice(0, 80));
              }}
            />
            <PreviewGrid
              items={items}
              onRemove={(rid)=>setItems(p=>{
                const hit=p.find(x=>x.id===rid);
                if(hit) URL.revokeObjectURL(hit.url);
                return p.filter(x=>x.id!==rid);
              })}
            />

            <Divider label="Convert" />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={!items.length || busy}
                onClick={async ()=>{
                  try{
                    setBusy(true);
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
                      downloadBlob(res.blob, nameByPattern(settings.fileNamePattern, base, settings.out));
                    }
                    setToast({ open:true, message:`Converted ${items.length} file(s).`, type:"ok" });
                  } catch(e:any){
                    setToast({ open:true, message:e?.message || "Conversion failed.", type:"error" });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Convert & download
              </Button>

              <Button variant="ghost" disabled={!items.length || busy} onClick={()=>{
                items.forEach(i=>URL.revokeObjectURL(i.url));
                setItems([]);
                setToast({ open:true, message:"Cleared.", type:"info" });
              }}>Clear</Button>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Output settings" subtitle="Simple controls.">
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
                    <div className="text-xs text-slate-400 mt-1">Off = keep original dimensions.</div>
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
                    <div className="col-span-2 text-xs text-slate-400">Aspect ratio is preserved.</div>
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
