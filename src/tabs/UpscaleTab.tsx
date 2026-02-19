import { useState } from "react";
import { Card, Button, Field, Input, Select, Slider, Divider } from "../components/ui";
import { Dropzone } from "../components/Dropzone";
import { PreviewGrid, PreviewItem } from "../components/PreviewGrid";
import { Toast, ToastState } from "../components/Toast";
import { convertRaster } from "../lib/rasterConvert";
import { downloadBlob } from "../lib/download";
import type { CommonRasterSettings, RasterOut } from "../lib/settings";
import { detectRasterFormat, FORMAT_QUALITY_PRESETS, SOCIAL_SIZE_PRESETS } from "../lib/presets";
import { fileToBitmap } from "../lib/imageDecode";

function uid() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

const ACCEPT = [
  "image/png","image/jpeg","image/webp","image/bmp","image/gif","image/avif","image/tiff","image/x-icon"
];

function nameByPattern(pattern: string, base: string, ext: string) {
  return pattern.replaceAll("{name}", base).replaceAll("{ext}", ext);
}

export function UpscaleTab({ settings, setSettings }: { settings: CommonRasterSettings; setSettings: (up:(p:CommonRasterSettings)=>CommonRasterSettings)=>void }) {
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>({ open:false, message:"" });
  const [scale, setScale] = useState<2|3|4|5>(2);
  const [autoOut, setAutoOut] = useState(true);
  const detected = items[0] ? detectRasterFormat(items[0].file) : null;

  return (
    <>
      <Toast state={toast} onClose={()=>setToast(t=>({ ...t, open:false }))} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card title="AI-style Upscaling (2x–5x)" subtitle="Increase dimensions, recover details, and improve tone with advanced enhancement controls.">
            <Dropzone
              accept={ACCEPT}
              multiple
              label="Drop images to upscale"
              helper="Format is auto-detected from the uploaded file. You can keep same format or force a different format."
              onFiles={(files)=>{
                const next: PreviewItem[] = files.map(f=>({ id:uid(), file:f, url:URL.createObjectURL(f) }));
                setItems(p=>[...p, ...next].slice(0, 60));
                if (files[0] && autoOut) {
                  const fmt = detectRasterFormat(files[0]);
                  setSettings((p)=>({ ...p, out: fmt }));
                }
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

            <Divider label="Upscale" />
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={!items.length || busy} onClick={async ()=>{
                try {
                  setBusy(true);
                  for(const it of items){
                    const bmp = await fileToBitmap(it.file);
                    const res = await convertRaster(it.file, {
                      out: autoOut ? detectRasterFormat(it.file) : settings.out,
                      quality: settings.quality,
                      keepSize: false,
                      maxWidth: bmp.width * scale,
                      maxHeight: bmp.height * scale,
                      resizeMode: "contain",
                      jpgBackground: settings.jpgBackground,
                      stripMetadataHint: settings.stripMetadataHint,
                      smoothing: settings.smoothing,
                      smoothingQuality: settings.smoothingQuality,
                      sharpenAmount: settings.sharpenAmount,
                      pngCompression: settings.pngCompression,
                      chromaSubsampling: settings.chromaSubsampling,
                      enhance: settings.aiEnhance ? {
                        autoColor: settings.autoColor,
                        contrast: settings.aiContrast,
                        saturation: settings.aiSaturation,
                        exposure: settings.aiExposure,
                        denoise: settings.aiDenoise
                      } : undefined
                    });
                    bmp.close?.();
                    const base=it.file.name.replace(/\.[^.]+$/,'') || 'image';
                    const outExt = autoOut ? detectRasterFormat(it.file) : settings.out;
                    downloadBlob(res.blob, nameByPattern(settings.fileNamePattern, `${base}_${scale}x`, outExt));
                  }
                  setToast({ open:true, message:`Upscaled ${items.length} file(s) at ${scale}x.`, type:"ok" });
                } catch (e:any) {
                  setToast({ open:true, message:e?.message || "Upscale failed.", type:"error" });
                } finally {
                  setBusy(false);
                }
              }}>Upscale & download</Button>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Upscale settings" subtitle="Per-format presets + AI enhancement controls.">
            <div className="space-y-4">
              <Field label="Detected format" hint="from first file">
                <Input value={detected ? detected.toUpperCase() : "—"} readOnly />
              </Field>

              <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3">
                <div className="text-sm font-semibold text-slate-800">Output mode</div>
                <div className="mt-2 flex gap-2">
                  <Button variant={autoOut ? "primary" : "ghost"} onClick={()=>setAutoOut(true)}>Auto (same as source)</Button>
                  <Button variant={!autoOut ? "primary" : "ghost"} onClick={()=>setAutoOut(false)}>Manual</Button>
                </div>
              </div>

              {!autoOut ? (
                <Field label="Manual output format">
                  <Select value={settings.out} onChange={(e)=>setSettings(p=>({ ...p, out:e.target.value as RasterOut }))}>
                    <option value="png">PNG</option>
                    <option value="jpg">JPG</option>
                    <option value="webp">WebP</option>
                  </Select>
                </Field>
              ) : null}

              <Field label="Upscale factor" hint={`${scale}x`}>
                <Select value={String(scale)} onChange={(e)=>setScale(Number(e.target.value) as 2|3|4|5)}>
                  <option value="2">2x</option>
                  <option value="3">3x</option>
                  <option value="4">4x</option>
                  <option value="5">5x</option>
                </Select>
              </Field>

              <Field label="Quality" hint={`${settings.quality}%`}>
                <Slider min={70} max={100} value={settings.quality} onChange={(e)=>setSettings(p=>({ ...p, quality:Number(e.target.value) }))} />
              </Field>

              <Field label="Sharpen after upscale" hint={`${settings.sharpenAmount}%`}>
                <Slider min={0} max={100} value={settings.sharpenAmount} onChange={(e)=>setSettings(p=>({ ...p, sharpenAmount:Number(e.target.value) }))} />
              </Field>

              <Field label="Resampling">
                <Select value={settings.smoothing ? settings.smoothingQuality : "off"} onChange={(e)=>setSettings((p)=>({ ...p, smoothing: e.target.value !== "off", smoothingQuality: (e.target.value === "off" ? p.smoothingQuality : e.target.value as "low"|"medium"|"high") }))}>
                  <option value="off">Nearest / pixelated</option>
                  <option value="low">Low smoothing</option>
                  <option value="medium">Medium smoothing</option>
                  <option value="high">High smoothing</option>
                </Select>
              </Field>

              <div className="rounded-2xl bg-violet-50 ring-1 ring-violet-200 p-4 space-y-3">
                <div className="text-sm font-semibold text-violet-900">AI enhancement</div>
                <p className="text-xs text-violet-700">Improves color and detail perception. Results depend on the source quality and cannot guarantee perfect restoration.</p>
                <div className="flex gap-2">
                  <Button variant={settings.aiEnhance ? "primary" : "ghost"} onClick={() => setSettings((s) => ({ ...s, aiEnhance: true }))}>Enabled</Button>
                  <Button variant={!settings.aiEnhance ? "primary" : "ghost"} onClick={() => setSettings((s) => ({ ...s, aiEnhance: false }))}>Disabled</Button>
                </div>
                {settings.aiEnhance ? (
                  <>
                    <div className="flex gap-2">
                      <Button variant={settings.autoColor ? "primary" : "ghost"} onClick={() => setSettings((s) => ({ ...s, autoColor: true }))}>Auto color balance</Button>
                      <Button variant={!settings.autoColor ? "primary" : "ghost"} onClick={() => setSettings((s) => ({ ...s, autoColor: false }))}>Manual color</Button>
                    </div>
                    <Field label="AI contrast" hint={`${settings.aiContrast}%`}>
                      <Slider min={0} max={100} value={settings.aiContrast} onChange={(e)=>setSettings(p=>({ ...p, aiContrast:Number(e.target.value) }))} />
                    </Field>
                    <Field label="AI saturation" hint={`${settings.aiSaturation}%`}>
                      <Slider min={0} max={100} value={settings.aiSaturation} onChange={(e)=>setSettings(p=>({ ...p, aiSaturation:Number(e.target.value) }))} />
                    </Field>
                    <Field label="AI exposure" hint={`${settings.aiExposure}%`}>
                      <Slider min={-100} max={100} value={settings.aiExposure} onChange={(e)=>setSettings(p=>({ ...p, aiExposure:Number(e.target.value) }))} />
                    </Field>
                    <Field label="AI denoise" hint={`${settings.aiDenoise}%`}>
                      <Slider min={0} max={100} value={settings.aiDenoise} onChange={(e)=>setSettings(p=>({ ...p, aiDenoise:Number(e.target.value) }))} />
                    </Field>
                  </>
                ) : null}
              </div>

              <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4">
                <div className="text-sm font-semibold text-slate-900">Format quality presets</div>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {(Object.keys(FORMAT_QUALITY_PRESETS) as RasterOut[]).map((fmt) => {
                    const preset = FORMAT_QUALITY_PRESETS[fmt];
                    return (
                      <button
                        key={fmt}
                        className="rounded-xl bg-white px-3 py-2 text-left ring-1 ring-slate-200 hover:bg-slate-50"
                        onClick={() => setSettings((s) => ({ ...s, out: fmt, quality: preset.quality, smoothing: true, smoothingQuality: preset.smoothingQuality, sharpenAmount: preset.sharpenAmount, chromaSubsampling: preset.chromaSubsampling }))}
                      >
                        <div className="font-semibold text-sm text-slate-900">{preset.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4">
                <div className="text-sm font-semibold text-slate-900">Social presets (target size)</div>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {SOCIAL_SIZE_PRESETS.map((p) => (
                    <button key={p.id} className="rounded-xl bg-white px-3 py-2 text-left ring-1 ring-slate-200 hover:bg-slate-50" onClick={() => setSettings((s) => ({ ...s, keepSize: false, maxWidth: p.w, maxHeight: p.h }))}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-sm text-slate-900">{p.label}</div>
                        <div className="text-xs text-slate-400">{p.w}×{p.h}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
