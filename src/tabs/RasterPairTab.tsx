import { useMemo, useState } from "react";
import { Card, Button, Field, Input, Select, Slider, Divider } from "../components/ui";
import { Dropzone } from "../components/Dropzone";
import { PreviewGrid, PreviewItem } from "../components/PreviewGrid";
import { Toast, ToastState } from "../components/Toast";
import { convertRaster } from "../lib/rasterConvert";
import { downloadBlob } from "../lib/download";
import type { CommonRasterSettings, RasterOut } from "../lib/settings";

function uid() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function patternName(pattern: string, base: string, ext: string) {
  return pattern.replaceAll("{name}", base).replaceAll("{ext}", ext);
}

const RASTER_ACCEPT = [
  "image/png","image/jpeg","image/webp","image/bmp","image/gif","image/avif","image/tiff","image/x-icon"
];

export function RasterPairTab(props: {
  title: string;
  subtitle: string;
  recommended: string[];
  fixedOutChoices: RasterOut[];
  defaultOut: RasterOut;
  settings: CommonRasterSettings;
  setSettings: (up: (p: CommonRasterSettings) => CommonRasterSettings) => void;
}) {
  const { title, subtitle, recommended, fixedOutChoices, defaultOut, settings, setSettings } = props;

  const [items, setItems] = useState<PreviewItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>({ open: false, message: "" });

  const out = useMemo(() => (fixedOutChoices.includes(settings.out) ? settings.out : defaultOut), [fixedOutChoices, settings.out, defaultOut]);

  return (
    <>
      <Toast state={toast} onClose={() => setToast((t) => ({ ...t, open: false }))} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card title={title} subtitle={subtitle}>
            <Dropzone
              accept={RASTER_ACCEPT}
              multiple
              label="Drop your images here"
              helper="Everything stays on your device. Add many files; each one downloads immediately after conversion."
              onFiles={(files) => {
                const next: PreviewItem[] = files.map((f) => ({ id: uid(), file: f, url: URL.createObjectURL(f) }));
                setItems((p) => [...p, ...next].slice(0, 60));
              }}
            />

            <PreviewGrid
              items={items}
              onRemove={(rid) =>
                setItems((p) => {
                  const hit = p.find((x) => x.id === rid);
                  if (hit) URL.revokeObjectURL(hit.url);
                  return p.filter((x) => x.id !== rid);
                })
              }
              extraRight={(rid) => (busyId === rid ? <span className="text-xs text-sky-600">Working…</span> : null)}
            />

            {items.length ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    items.forEach((i) => URL.revokeObjectURL(i.url));
                    setItems([]);
                    setToast({ open: true, message: "Cleared the list.", type: "info" });
                  }}
                >
                  Clear
                </Button>
                <div className="flex-1" />
                <div className="text-xs text-slate-600">{items.length} file(s) ready</div>
              </div>
            ) : null}

            <Divider label="Convert" />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={!items.length || !!busyId}
                onClick={async () => {
                  try {
                    for (const it of items) {
                      setBusyId(it.id);
                      const base = it.file.name.replace(/\.[^.]+$/, "") || "image";
                      const res = await convertRaster(it.file, {
                        out,
                        quality: settings.quality,
                        keepSize: settings.keepSize,
                        maxWidth: settings.maxWidth,
                        maxHeight: settings.maxHeight,
                        jpgBackground: settings.jpgBackground,
                        stripMetadataHint: settings.stripMetadataHint,
                        resizeMode: settings.resizeMode,
                        smoothing: settings.smoothing,
                        smoothingQuality: settings.smoothingQuality,
                        sharpenAmount: settings.sharpenAmount,
                        pngCompression: settings.pngCompression,
                        chromaSubsampling: settings.chromaSubsampling
                      });
                      const name = patternName(settings.fileNamePattern, base, out);
                      downloadBlob(res.blob, name);
                    }
                    setToast({ open: true, message: `Converted ${items.length} file(s).`, type: "ok" });
                  } catch (e: any) {
                    setToast({ open: true, message: e?.message || "Conversion failed.", type: "error" });
                  } finally {
                    setBusyId(null);
                  }
                }}
              >
                Convert & download
              </Button>

              <span className="text-xs text-slate-400">
                Want one ZIP file? Use the <span className="text-slate-700">Batch ZIP</span> tab.
              </span>
            </div>
          </Card>

          <Card title="Recommended uses" subtitle="Short reminders so users don't pick the wrong format.">
            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
              {recommended.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Output settings" subtitle="Simple controls with safe defaults.">
            <div className="space-y-4">
              <Field label="Output format">
                <Select value={out} onChange={(e) => setSettings((p) => ({ ...p, out: e.target.value as RasterOut }))}>
                  {fixedOutChoices.map((c) => (
                    <option key={c} value={c}>
                      {c.toUpperCase()}
                    </option>
                  ))}
                </Select>
              </Field>

              {(out === "jpg" || out === "webp") ? (
                <Field label="Quality" hint={`${settings.quality}%`}>
                  <Slider min={35} max={100} value={settings.quality} onChange={(e) => setSettings((p) => ({ ...p, quality: Number(e.target.value) }))} />
                  <div className="text-xs text-slate-400">Try 90–95 for photos, 85–92 for web.</div>
                </Field>
              ) : (
                <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3 text-xs text-slate-600">
                  PNG is lossless (no quality slider needed).
                </div>
              )}

              <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Resize</div>
                    <div className="text-xs text-slate-400 mt-1">Off = keep original size.</div>
                  </div>
                  <button
                    className="rounded-xl bg-white px-3 py-1.5 text-xs ring-1 ring-slate-200 hover:bg-slate-100"
                    onClick={() => setSettings((p) => ({ ...p, keepSize: !p.keepSize }))}
                  >
                    {settings.keepSize ? "Keep size" : "Resize"}
                  </button>
                </div>

                {!settings.keepSize ? (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Field label="Max width">
                      <Input type="number" min={64} max={12000} value={settings.maxWidth} onChange={(e) => setSettings((p) => ({ ...p, maxWidth: Number(e.target.value) }))} />
                    </Field>
                    <Field label="Max height">
                      <Input type="number" min={64} max={12000} value={settings.maxHeight} onChange={(e) => setSettings((p) => ({ ...p, maxHeight: Number(e.target.value) }))} />
                    </Field>
                    <Field label="Resize mode">
                      <Select value={settings.resizeMode} onChange={(e)=>setSettings((p)=>({ ...p, resizeMode: e.target.value as "contain" | "cover" }))}>
                        <option value="contain">Contain (fit inside)</option>
                        <option value="cover">Cover (fill area, can crop)</option>
                      </Select>
                    </Field>
                    <div className="col-span-2 text-xs text-slate-400">Aspect ratio is preserved automatically.</div>
                  </div>
                ) : null}
              </div>

              {out === "jpg" ? (
                <Field label="JPG background color" hint="Used only if input has transparency">
                  <Input value={settings.jpgBackground} onChange={(e) => setSettings((p) => ({ ...p, jpgBackground: e.target.value }))} placeholder="#ffffff" />
                </Field>
              ) : null}

              

              <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3 space-y-3">
                <div className="text-sm font-semibold text-slate-800">Advanced quality</div>
                <Field label="Resampling">
                  <Select value={settings.smoothing ? settings.smoothingQuality : "off"} onChange={(e)=>setSettings((p)=>({ ...p, smoothing: e.target.value !== "off", smoothingQuality: (e.target.value === "off" ? p.smoothingQuality : e.target.value) as "low" | "medium" | "high" }))}>
                    <option value="off">Nearest / pixelated</option>
                    <option value="low">Low smoothing</option>
                    <option value="medium">Medium smoothing</option>
                    <option value="high">High smoothing</option>
                  </Select>
                </Field>

                <Field label="Sharpen after resize" hint={`${settings.sharpenAmount}%`}>
                  <Slider min={0} max={100} value={settings.sharpenAmount} onChange={(e)=>setSettings((p)=>({ ...p, sharpenAmount: Number(e.target.value) }))} />
                </Field>

                {(settings.out === "jpg" || settings.out === "webp") ? (
                  <Field label="Chroma quality">
                    <Select value={settings.chromaSubsampling} onChange={(e)=>setSettings((p)=>({ ...p, chromaSubsampling: e.target.value as "420" | "444" }))}>
                      <option value="444">4:4:4 (best color fidelity)</option>
                      <option value="420">4:2:0 (smaller file)</option>
                    </Select>
                  </Field>
                ) : null}
              </div>

<Field label="File naming pattern" hint="Use {name} + {ext}">
                <Input value={settings.fileNamePattern} onChange={(e) => setSettings((p) => ({ ...p, fileNamePattern: e.target.value }))} />
              </Field>
            </div>
          </Card>

          <Card title="Why it’s safe" subtitle="What people care about in reviews.">
            <div className="space-y-2 text-sm text-slate-600 leading-relaxed">
              <p><b>Privacy:</b> files never upload.</p>
              <p><b>No watermark:</b> downloads are clean.</p>
              <p><b>Easy:</b> one button converts and downloads.</p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
