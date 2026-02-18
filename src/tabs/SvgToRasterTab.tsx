import { useState } from "react";
import { Card, Button, Field, Input, Select, Slider, Divider } from "../components/ui";
import { Dropzone } from "../components/Dropzone";
import { PreviewGrid, PreviewItem } from "../components/PreviewGrid";
import { Toast, ToastState } from "../components/Toast";
import { svgToRaster } from "../lib/svgRaster";
import { downloadBlob, downloadZip } from "../lib/download";
import type { CommonRasterSettings } from "../lib/settings";
import { SOCIAL_SIZE_PRESETS } from "../lib/presets";

function uid() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
const ACCEPT = ["image/svg+xml"];

export function SvgToRasterTab({ settings, setSettings }: { settings: CommonRasterSettings; setSettings: (up:(p:CommonRasterSettings)=>CommonRasterSettings)=>void }) {
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>({ open:false, message:"" });

  return (
    <>
      <Toast state={toast} onClose={()=>setToast(t=>({ ...t, open:false }))} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card title="SVG → PNG/JPG/WebP" subtitle="Export crisp raster images at exactly the size you choose.">
            <Dropzone
              accept={ACCEPT}
              multiple
              label="Drop SVG files here"
              helper="If you need very sharp output, increase export size (e.g. 2048×2048)."
              onFiles={(files)=>{
                const next: PreviewItem[] = files.map(f=>({ id:uid(), file:f, url:URL.createObjectURL(f), note:"SVG input" }));
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

            <Divider label="Export" />
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={!items.length || busy} onClick={async ()=>{
                try{
                  setBusy(true);
                  const out: { name:string; blob:Blob }[] = [];
                  for(const it of items){
                    const res = await svgToRaster(it.file, {
                      out: settings.out,
                      width: settings.maxWidth,
                      height: settings.maxHeight,
                      quality: settings.quality,
                      jpgBackground: settings.jpgBackground
                    });
                    out.push({ name: res.outName, blob: res.blob });
                  }
                  setBusy(false);
                  if(out.length === 1) downloadBlob(out[0].blob, out[0].name);
                  else await downloadZip(out, "svg_exports.zip");
                  setToast({ open:true, message:`Exported ${out.length} file(s).`, type:"ok" });
                } catch(e:any){
                  setBusy(false);
                  setToast({ open:true, message:e?.message || "Export failed.", type:"error" });
                }
              }}>Export & download {items.length > 1 ? "ZIP" : ""}</Button>

              <Button variant="ghost" disabled={!items.length || busy} onClick={()=>{
                items.forEach(i=>URL.revokeObjectURL(i.url));
                setItems([]);
                setToast({ open:true, message:"Cleared.", type:"info" });
              }}>Clear</Button>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Export settings" subtitle="Choose format + output size.">
            <div className="space-y-4">
              <Field label="Output format">
                <Select value={settings.out} onChange={(e)=>setSettings(p=>({ ...p, out: e.target.value as any }))}>
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

              <Field label="Export width">
                <Input type="number" min={64} max={12000} value={settings.maxWidth} onChange={(e)=>setSettings(p=>({ ...p, maxWidth:Number(e.target.value) }))} />
              </Field>

              <Field label="Export height">
                <Input type="number" min={64} max={12000} value={settings.maxHeight} onChange={(e)=>setSettings(p=>({ ...p, maxHeight:Number(e.target.value) }))} />
              </Field>

              {settings.out === "jpg" ? (
                <Field label="JPG background">
                  <Input value={settings.jpgBackground} onChange={(e)=>setSettings(p=>({ ...p, jpgBackground:e.target.value }))} />
                </Field>
              ) : null}

<div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
  <div className="text-sm font-semibold text-slate-100">Quick size presets</div>
  <div className="mt-2 grid grid-cols-1 gap-2">
    {SOCIAL_SIZE_PRESETS.map((p) => (
      <button
        key={p.id}
        className="rounded-xl bg-white/5 px-3 py-2 text-left ring-1 ring-white/10 hover:bg-white/10"
        onClick={() => setSettings((s) => ({ ...s, maxWidth: p.w, maxHeight: p.h }))}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="font-semibold text-sm text-slate-100">{p.label}</div>
          <div className="text-xs text-slate-400">{p.w}×{p.h}</div>
        </div>
        <div className="text-xs text-slate-400 mt-1">{p.note}</div>
      </button>
    ))}
  </div>
</div>

              <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4 text-xs text-slate-300 leading-relaxed">
                <div className="font-semibold text-slate-100 mb-1">Popular sizes</div>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Instagram: 1080×1080</li>
                  <li>TikTok/Reels: 1080×1920</li>
                  <li>YouTube thumbnail: 1280×720</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
