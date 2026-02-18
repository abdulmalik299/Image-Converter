import { useMemo, useState } from "react";
import { Card, Button, Field, Select, Slider, Divider, Badge } from "../components/ui";
import { Dropzone } from "../components/Dropzone";
import { PreviewGrid, PreviewItem } from "../components/PreviewGrid";
import { Toast, ToastState } from "../components/Toast";
import { downloadBlob, downloadZip } from "../lib/download";
import { rasterToSvg, defaultVectorize, VectorizeSettings, VectorPresetKey } from "../lib/vectorize";

function uid() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

const ACCEPT = ["image/png","image/jpeg","image/webp","image/bmp","image/gif","image/avif","image/tiff"];

const PRESET_LABELS: Record<VectorPresetKey,string> = {
  logo_clean: "Logo (clean) — sharp, few colors",
  logo_detailed: "Logo (detailed) — more detail, still crisp",
  illustration: "Illustration — balanced colors",
  photo_soft: "Photo (soft) — big SVG, best-effort",
  pixel_art: "Pixel art — keeps blocky edges",
  custom: "Custom — you control everything"
};

export function RasterToSvgTab() {
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>({ open: false, message: "" });

  const [settings, setSettings] = useState<VectorizeSettings>(() => {
    try {
      const raw = localStorage.getItem("ic.vec.settings");
      return raw ? (JSON.parse(raw) as VectorizeSettings) : defaultVectorize;
    } catch {
      return defaultVectorize;
    }
  });

  const update = (patch: Partial<VectorizeSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    localStorage.setItem("ic.vec.settings", JSON.stringify(next));
  };

  const warning = useMemo(() => {
    if (settings.preset === "photo_soft") return "Photos can create very large SVG files. For web use, WebP/JPG is usually better.";
    return null;
  }, [settings.preset]);

  return (
    <>
      <Toast state={toast} onClose={() => setToast((t)=>({ ...t, open:false }))} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card
            title="PNG/JPG/WebP → SVG (advanced)"
            subtitle="Best for logos, icons, and illustrations. Photos work, but can become heavy."
            right={<Badge tone="warn">Tracing pixels</Badge>}
          >
            <Dropzone
              accept={ACCEPT}
              multiple
              label="Drop raster images here"
              helper="Clean, high-contrast logos vectorize best. Photos are a best-effort conversion."
              onFiles={(files) => {
                const next: PreviewItem[] = files.map((f)=>({ id:uid(), file:f, url:URL.createObjectURL(f) }));
                setItems((p)=>[...p, ...next].slice(0, 30));
              }}
            />

            <PreviewGrid
              items={items}
              onRemove={(rid)=>setItems((p)=>{ 
                const hit=p.find(x=>x.id===rid); 
                if(hit) URL.revokeObjectURL(hit.url);
                return p.filter(x=>x.id!==rid);
              })}
              extraRight={(rid)=>busy===rid ? <span className="text-xs text-sky-200">Tracing…</span> : null}
            />

            {warning ? (
              <div className="mt-4 rounded-2xl bg-amber-500/10 ring-1 ring-amber-400/20 px-4 py-3 text-sm text-amber-100">
                {warning}
              </div>
            ) : null}

            <Divider label="Create SVG" />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={!items.length || !!busy}
                onClick={async ()=>{
                  try{
                    const out: { name:string; blob:Blob }[] = [];
                    for(const it of items){
                      setBusy(it.id);
                      const res = await rasterToSvg(it.file, settings);
                      out.push({ name: res.outName, blob: new Blob([res.svgText], { type:"image/svg+xml" }) });
                    }
                    setBusy(null);

                    if(out.length === 1) downloadBlob(out[0].blob, out[0].name);
                    else await downloadZip(out, "vectorized_svgs.zip");

                    setToast({ open:true, message:`Created ${out.length} SVG file(s).`, type:"ok" });
                  } catch(e:any){
                    setBusy(null);
                    setToast({ open:true, message:e?.message || "Vectorization failed.", type:"error" });
                  }
                }}
              >
                Vectorize & download {items.length > 1 ? "ZIP" : ""}
              </Button>

              <Button variant="ghost" disabled={!items.length || !!busy} onClick={()=>{
                items.forEach(i=>URL.revokeObjectURL(i.url));
                setItems([]);
                setToast({ open:true, message:"Cleared.", type:"info" });
              }}>Clear</Button>
            </div>
          </Card>

          <Card title="How to get the closest SVG" subtitle="Honest explanation in simple language.">
            <div className="space-y-3 text-sm text-slate-300 leading-relaxed">
              <p>
                SVG stores <b>shapes</b>, raster images store <b>pixels</b>. When you convert raster → SVG, the tool must guess shapes from pixels.
                That’s why results vary.
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><b>Logos</b>: usually very close (often 90%+ visually).</li>
                <li><b>Photos</b>: can become huge; still not identical.</li>
                <li>More colors = closer look, bigger SVG.</li>
                <li>More simplify = smaller SVG, less detail.</li>
              </ul>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Vector settings" subtitle="Preset first. Only adjust if needed.">
            <div className="space-y-4">
              <Field label="Preset">
                <Select value={settings.preset} onChange={(e)=>update({ preset: e.target.value as any })}>
                  {Object.entries(PRESET_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </Field>

              <Field label="Colors" hint={`${settings.colorCount}`}>
                <Slider min={2} max={64} value={settings.colorCount} onChange={(e)=>update({ colorCount:Number(e.target.value) })} />
              </Field>

              <Field label="Simplify (path omit)" hint={`${settings.pathOmit}`}>
                <Slider min={0} max={50} value={settings.pathOmit} onChange={(e)=>update({ pathOmit:Number(e.target.value) })} />
              </Field>

              <Field label="Smoothness (blur radius)" hint={`${settings.blurRadius}`}>
                <Slider min={0} max={5} value={settings.blurRadius} onChange={(e)=>update({ blurRadius:Number(e.target.value) })} />
              </Field>

              <Field label="Edge sensitivity (line threshold)" hint={`${settings.lineThreshold}`}>
                <Slider min={0} max={100} value={settings.lineThreshold} onChange={(e)=>update({ lineThreshold:Number(e.target.value) })} />
              </Field>

              <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">Background</div>
                    <div className="text-xs text-slate-400 mt-1">Transparent is common for logos.</div>
                  </div>
                  <button
                    className="rounded-xl bg-white/10 px-3 py-1.5 text-xs ring-1 ring-white/10 hover:bg-white/15"
                    onClick={()=>update({ transparentBackground: !settings.transparentBackground })}
                  >
                    {settings.transparentBackground ? "Transparent" : "Solid"}
                  </button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
