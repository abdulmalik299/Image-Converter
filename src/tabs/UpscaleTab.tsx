import { useEffect, useMemo, useState } from "react";
import { Card, Button, Field, Input, Select, Slider, Divider } from "../components/ui";
import { Dropzone } from "../components/Dropzone";
import { PreviewGrid, PreviewItem } from "../components/PreviewGrid";
import { Toast, ToastState } from "../components/Toast";
import { convertRaster } from "../lib/rasterConvert";
import { downloadBlob } from "../lib/download";
import type { CommonRasterSettings, RasterOut, ColorTuneSettings } from "../lib/settings";
import { detectRasterFormat, FORMAT_QUALITY_PRESETS, SOCIAL_SIZE_PRESETS } from "../lib/presets";
import { fileToBitmap } from "../lib/imageDecode";

function uid() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

const ACCEPT = [
  "image/png", "image/jpeg", "image/webp", "image/bmp", "image/gif", "image/avif", "image/tiff", "image/x-icon"
];

const COLOR_BANDS: Array<{ key: keyof ColorTuneSettings; label: string }> = [
  { key: "red", label: "Reds" },
  { key: "orange", label: "Oranges" },
  { key: "yellow", label: "Yellows" },
  { key: "green", label: "Greens" },
  { key: "cyan", label: "Cyans" },
  { key: "blue", label: "Blues" },
  { key: "magenta", label: "Magentas" }
];

const SAFE_TUNE: ColorTuneSettings = {
  red: { hue: 0, saturation: 0, lightness: 0 },
  orange: { hue: 0, saturation: 0, lightness: 0 },
  yellow: { hue: 0, saturation: 0, lightness: 0 },
  green: { hue: 0, saturation: 0, lightness: 0 },
  cyan: { hue: 0, saturation: 0, lightness: 0 },
  blue: { hue: 0, saturation: 0, lightness: 0 },
  magenta: { hue: 0, saturation: 0, lightness: 0 }
};

function nameByPattern(pattern: string, base: string, ext: string) {
  return pattern.replaceAll("{name}", base).replaceAll("{ext}", ext);
}

export function UpscaleTab({ settings, setSettings }: { settings: CommonRasterSettings; setSettings: (up: (p: CommonRasterSettings) => CommonRasterSettings) => void }) {
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>({ open: false, message: "" });
  const [scale, setScale] = useState(1);
  const [targetWidthInput, setTargetWidthInput] = useState("");
  const [targetHeightInput, setTargetHeightInput] = useState("");
  const [settingsTab, setSettingsTab] = useState<"size" | "quality" | "ai">("size");
  const [autoOut, setAutoOut] = useState(true);
  const [compareBusy, setCompareBusy] = useState(false);
  const [compareUrl, setCompareUrl] = useState<string | null>(null);
  const [compareMeta, setCompareMeta] = useState<string>("");
  const detected = items[0] ? detectRasterFormat(items[0].file) : null;
  const firstItem = items[0];

  const safeColorTune = settings.colorTune ?? SAFE_TUNE;
  const detailRecovery = settings.detailRecovery ?? 55;
  const resampleStrength = settings.resampleStrength ?? 65;
  const ultraHdLongEdge = settings.ultraHdLongEdge ?? 0;

  useEffect(() => {
    return () => {
      if (compareUrl) URL.revokeObjectURL(compareUrl);
    };
  }, [compareUrl]);

  const computeTargetSize = async (file: File) => {
    const bmp = await fileToBitmap(file);
    const requestedWidth = Number(targetWidthInput);
    const requestedHeight = Number(targetHeightInput);

    if (requestedWidth > 0 && requestedHeight > 0) {
      bmp.close?.();
      return { width: Math.round(requestedWidth), height: Math.round(requestedHeight) };
    }

    if (requestedWidth > 0 || requestedHeight > 0) {
      const ratio = bmp.width / bmp.height;
      const width = requestedWidth > 0 ? requestedWidth : Math.round(requestedHeight * ratio);
      const height = requestedHeight > 0 ? requestedHeight : Math.round(requestedWidth / ratio);
      bmp.close?.();
      return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
    }

    const baseScaleW = Math.max(1, bmp.width * scale);
    const baseScaleH = Math.max(1, bmp.height * scale);
    const longEdge = Math.max(baseScaleW, baseScaleH);
    const wantsUltra = ultraHdLongEdge >= 1920;
    const targetScale = wantsUltra ? Math.max(1, ultraHdLongEdge / longEdge) : 1;
    const width = Math.max(1, Math.round(baseScaleW * targetScale));
    const height = Math.max(1, Math.round(baseScaleH * targetScale));
    bmp.close?.();
    return { width, height };
  };

  const runUpscale = async (file: File) => {
    const out = autoOut ? detectRasterFormat(file) : settings.out;
    const target = await computeTargetSize(file);
    return convertRaster(file, {
      out,
      quality: settings.quality,
      keepSize: false,
      maxWidth: target.width,
      maxHeight: target.height,
      resizeMode: "contain",
      jpgBackground: settings.jpgBackground,
      stripMetadataHint: settings.stripMetadataHint,
      smoothing: settings.smoothing,
      smoothingQuality: settings.smoothingQuality,
      sharpenAmount: settings.sharpenAmount,
      pngCompression: settings.pngCompression,
      chromaSubsampling: settings.chromaSubsampling,
      resampleStrength,
      enhance: {
        autoColor: settings.aiEnhance ? settings.autoColor : false,
        contrast: settings.aiEnhance ? settings.aiContrast : 0,
        saturation: settings.aiEnhance ? settings.aiSaturation : 0,
        exposure: settings.aiEnhance ? settings.aiExposure : 0,
        denoise: settings.aiEnhance ? settings.aiDenoise : 0,
        detailRecovery,
        colorTune: settings.aiEnhance ? safeColorTune : undefined
      }
    });
  };

  const renderCompare = async () => {
    if (!firstItem) return;
    setCompareBusy(true);
    try {
      const res = await runUpscale(firstItem.file);
      if (compareUrl) URL.revokeObjectURL(compareUrl);
      const url = URL.createObjectURL(res.blob);
      setCompareUrl(url);
      setCompareMeta(`${res.width} × ${res.height}`);
    } finally {
      setCompareBusy(false);
    }
  };

  useEffect(() => {
    if (!firstItem) {
      if (compareUrl) URL.revokeObjectURL(compareUrl);
      setCompareUrl(null);
      setCompareMeta("");
      return;
    }
    renderCompare().catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstItem?.id, scale, settings.quality, settings.sharpenAmount, settings.aiEnhance, settings.aiContrast, settings.aiSaturation, settings.aiExposure, settings.aiDenoise, settings.autoColor, settings.smoothing, settings.smoothingQuality, settings.out, autoOut, detailRecovery, resampleStrength, ultraHdLongEdge, targetWidthInput, targetHeightInput]);

  const selectedPreset = useMemo(() => autoOut ? null : settings.out, [autoOut, settings.out]);

  return (
    <>
      <Toast state={toast} onClose={() => setToast((t) => ({ ...t, open: false }))} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          <Card title="AI-style Upscaling (2x–12x)" subtitle="Ultra quality pipeline with strong resampling, detail recovery, selective HSL tuning, and instant before/after preview.">
            <Dropzone
              accept={ACCEPT}
              multiple
              label="Drop images to upscale"
              helper="Format is auto-detected from the uploaded file. You can keep same format or force a different format."
              onFiles={(files) => {
                const next: PreviewItem[] = files.map((f) => ({ id: uid(), file: f, url: URL.createObjectURL(f) }));
                setItems((p) => [...p, ...next].slice(0, 60));
                if (files[0] && autoOut) {
                  const fmt = detectRasterFormat(files[0]);
                  setSettings((p) => ({ ...p, out: fmt }));
                }
              }}
            />

            <PreviewGrid
              items={items}
              onRemove={(rid) => setItems((p) => {
                const hit = p.find((x) => x.id === rid);
                if (hit) URL.revokeObjectURL(hit.url);
                return p.filter((x) => x.id !== rid);
              })}
            />

            {firstItem ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-800">Before / After viewer (first image)</div>
                  <Button variant="ghost" onClick={() => renderCompare()} disabled={compareBusy}>{compareBusy ? "Rendering..." : "Refresh preview"}</Button>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="px-3 py-2 text-xs font-semibold text-slate-600">Original</div>
                    <div className="aspect-[4/3] flex items-center justify-center bg-slate-100">
                      <img src={firstItem.url} alt="Original upload" className="max-h-full max-w-full object-contain" />
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="px-3 py-2 text-xs font-semibold text-slate-600">Enhanced result {compareMeta ? `• ${compareMeta}` : ""}</div>
                    <div className="aspect-[4/3] flex items-center justify-center bg-slate-100">
                      {compareUrl ? <img src={compareUrl} alt="Upscaled preview" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-slate-500">Generating preview…</span>}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <Divider label="Upscale" />
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={!items.length || busy} onClick={async () => {
                try {
                  setBusy(true);
                  for (const it of items) {
                    const res = await runUpscale(it.file);
                    const base = it.file.name.replace(/\.[^.]+$/, "") || "image";
                    const outExt = autoOut ? detectRasterFormat(it.file) : settings.out;
                    downloadBlob(res.blob, nameByPattern(settings.fileNamePattern, `${base}_${scale}x`, outExt));
                  }
                  setToast({ open: true, message: `Upscaled ${items.length} file(s) with Ultra mode.`, type: "ok" });
                } catch (e: any) {
                  setToast({ open: true, message: e?.message || "Upscale failed.", type: "error" });
                } finally {
                  setBusy(false);
                }
              }}>Upscale & download</Button>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Upscale settings" subtitle="Power level 100 controls for difficult low-quality images.">
            <div className="space-y-4">
              <Field label="Detected format" hint="from first file">
                <Input value={detected ? detected.toUpperCase() : "—"} readOnly />
              </Field>

              <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200">
                <Button variant={settingsTab === "size" ? "primary" : "ghost"} onClick={() => setSettingsTab("size")}>Size</Button>
                <Button variant={settingsTab === "quality" ? "primary" : "ghost"} onClick={() => setSettingsTab("quality")}>Quality</Button>
                <Button variant={settingsTab === "ai" ? "primary" : "ghost"} onClick={() => setSettingsTab("ai")}>AI / Color</Button>
              </div>

              {settingsTab === "size" ? (
                <div className="space-y-4">
                  <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3">
                    <div className="text-sm font-semibold text-slate-800">Output mode</div>
                    <div className="mt-2 flex gap-2">
                      <Button variant={autoOut ? "primary" : "ghost"} onClick={() => setAutoOut(true)}>Auto (same as source)</Button>
                      <Button variant={!autoOut ? "primary" : "ghost"} onClick={() => setAutoOut(false)}>Manual format</Button>
                    </div>
                  </div>

                  {!autoOut ? (
                    <Field label="Output format">
                      <Select value={settings.out} onChange={(e) => setSettings((p) => ({ ...p, out: e.target.value as RasterOut }))}>
                        <option value="png">PNG</option>
                        <option value="jpg">JPG</option>
                        <option value="webp">WebP</option>
                      </Select>
                    </Field>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Target width (px)">
                      <Input value={targetWidthInput} onChange={(e) => setTargetWidthInput(e.target.value.replace(/[^\d]/g, ""))} placeholder="optional" inputMode="numeric" />
                    </Field>
                    <Field label="Target height (px)">
                      <Input value={targetHeightInput} onChange={(e) => setTargetHeightInput(e.target.value.replace(/[^\d]/g, ""))} placeholder="optional" inputMode="numeric" />
                    </Field>
                  </div>
                  <p className="text-xs text-slate-500">If width and height are empty, output uses original size × upscale factor. If one value is given, the other side is auto-calculated.</p>

                  <Field label="Upscale factor" hint={`${scale}x`}>
                    <Slider min={1} max={12} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
                  </Field>

                  <Field label="Ultra HD long edge" hint={ultraHdLongEdge >= 1920 ? `${ultraHdLongEdge}px` : "Off"}>
                    <Slider min={0} max={7680} step={240} value={ultraHdLongEdge} onChange={(e) => setSettings((p) => ({ ...p, ultraHdLongEdge: Number(e.target.value) }))} />
                  </Field>

                  <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4">
                    <div className="text-sm font-semibold text-slate-900">Social presets (target size)</div>
                    <div className="mt-2 grid grid-cols-1 gap-2">
                      {SOCIAL_SIZE_PRESETS.map((p) => (
                        <button key={p.id} className="rounded-xl bg-white px-3 py-2 text-left ring-1 ring-slate-200 hover:bg-slate-50" onClick={() => {
                          setTargetWidthInput(String(p.w));
                          setTargetHeightInput(String(p.h));
                        }}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-semibold text-sm text-slate-900">{p.label}</div>
                            <div className="text-xs text-slate-400">{p.w}×{p.h}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {settingsTab === "quality" ? (
                <div className="space-y-4">
                  <Field label="Quality" hint={`${settings.quality}%`}>
                    <Slider min={60} max={100} value={settings.quality} onChange={(e) => setSettings((p) => ({ ...p, quality: Number(e.target.value) }))} />
                  </Field>

                  <Field label="Detail recovery" hint={`${detailRecovery}%`}>
                    <Slider min={0} max={100} value={detailRecovery} onChange={(e) => setSettings((p) => ({ ...p, detailRecovery: Number(e.target.value) }))} />
                  </Field>

                  <Field label="Sharpen after upscale" hint={`${settings.sharpenAmount}%`}>
                    <Slider min={0} max={100} value={settings.sharpenAmount} onChange={(e) => setSettings((p) => ({ ...p, sharpenAmount: Number(e.target.value) }))} />
                  </Field>

                  <Field label="Resampling mode">
                    <Select value={settings.smoothing ? settings.smoothingQuality : "off"} onChange={(e) => setSettings((p) => ({ ...p, smoothing: e.target.value !== "off", smoothingQuality: (e.target.value === "off" ? p.smoothingQuality : e.target.value as "low" | "medium" | "high") }))}>
                      <option value="off">Nearest / pixelated</option>
                      <option value="low">Crisp</option>
                      <option value="medium">Balanced</option>
                      <option value="high">Ultra smooth</option>
                    </Select>
                  </Field>

                  <Field label="Resampling strength" hint={`${resampleStrength}%`}>
                    <Slider min={0} max={100} value={resampleStrength} onChange={(e) => setSettings((p) => ({ ...p, resampleStrength: Number(e.target.value) }))} />
                  </Field>

                  <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4">
                    <div className="text-sm font-semibold text-slate-900">Format quality presets</div>
                    <div className="mt-2 grid grid-cols-1 gap-2">
                      {(Object.keys(FORMAT_QUALITY_PRESETS) as RasterOut[]).map((fmt) => {
                        const preset = FORMAT_QUALITY_PRESETS[fmt];
                        const active = selectedPreset === fmt;
                        return (
                          <button
                            key={fmt}
                            className={`rounded-xl px-3 py-2 text-left ring-1 transition ${active ? "bg-sky-50 ring-sky-300" : "bg-white ring-slate-200 hover:bg-slate-50"}`}
                            onClick={() => {
                              setAutoOut(false);
                              setSettings((s) => ({ ...s, out: fmt, quality: preset.quality, smoothing: true, smoothingQuality: preset.smoothingQuality, sharpenAmount: preset.sharpenAmount, chromaSubsampling: preset.chromaSubsampling }));
                            }}
                          >
                            <div className="font-semibold text-sm text-slate-900">{preset.label}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}

              {settingsTab === "ai" ? (
                <div className="space-y-4">
                  <div className="rounded-2xl bg-violet-50 ring-1 ring-violet-200 p-4 space-y-3">
                    <div className="text-sm font-semibold text-violet-900">AI enhancement</div>
                    <p className="text-xs text-violet-700">Advanced modern workflow: denoise + contrast micro-boost + selective color correction + detail reconstruction.</p>
                    <div className="flex gap-2">
                      <Button variant={settings.aiEnhance ? "primary" : "ghost"} onClick={() => setSettings((s) => ({ ...s, aiEnhance: true }))}>Enabled</Button>
                      <Button variant={!settings.aiEnhance ? "primary" : "ghost"} onClick={() => setSettings((s) => ({ ...s, aiEnhance: false }))}>Disabled</Button>
                    </div>
                    <div className="flex gap-2">
                      <Button variant={settings.autoColor ? "primary" : "ghost"} onClick={() => setSettings((s) => ({ ...s, autoColor: true }))}>Auto color balance</Button>
                      <Button variant={!settings.autoColor ? "primary" : "ghost"} onClick={() => setSettings((s) => ({ ...s, autoColor: false }))}>Manual color</Button>
                    </div>
                    <Field label="AI contrast" hint={`${settings.aiContrast}%`}>
                      <Slider min={0} max={100} value={settings.aiContrast} onChange={(e) => setSettings((p) => ({ ...p, aiContrast: Number(e.target.value) }))} />
                    </Field>
                    <Field label="AI saturation" hint={`${settings.aiSaturation}%`}>
                      <Slider min={0} max={100} value={settings.aiSaturation} onChange={(e) => setSettings((p) => ({ ...p, aiSaturation: Number(e.target.value) }))} />
                    </Field>
                    <Field label="AI exposure" hint={`${settings.aiExposure}%`}>
                      <Slider min={-100} max={100} value={settings.aiExposure} onChange={(e) => setSettings((p) => ({ ...p, aiExposure: Number(e.target.value) }))} />
                    </Field>
                    <Field label="AI denoise" hint={`${settings.aiDenoise}%`}>
                      <Slider min={0} max={100} value={settings.aiDenoise} onChange={(e) => setSettings((p) => ({ ...p, aiDenoise: Number(e.target.value) }))} />
                    </Field>
                  </div>

                  <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4">
                    <div className="text-sm font-semibold text-slate-900">Selective HSL color controls (7 bands)</div>
                    <div className="mt-3 space-y-4">
                      {COLOR_BANDS.map((band) => (
                        <div key={band.key} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="text-xs font-semibold text-slate-700">{band.label}</div>
                          <Field label="Hue" hint={`${safeColorTune[band.key].hue}`}>
                            <Slider min={-40} max={40} value={safeColorTune[band.key].hue} onChange={(e) => setSettings((s) => ({ ...s, colorTune: { ...safeColorTune, [band.key]: { ...safeColorTune[band.key], hue: Number(e.target.value) } } }))} />
                          </Field>
                          <Field label="Saturation" hint={`${safeColorTune[band.key].saturation}`}>
                            <Slider min={-50} max={50} value={safeColorTune[band.key].saturation} onChange={(e) => setSettings((s) => ({ ...s, colorTune: { ...safeColorTune, [band.key]: { ...safeColorTune[band.key], saturation: Number(e.target.value) } } }))} />
                          </Field>
                          <Field label="Lightness" hint={`${safeColorTune[band.key].lightness}`}>
                            <Slider min={-50} max={50} value={safeColorTune[band.key].lightness} onChange={(e) => setSettings((s) => ({ ...s, colorTune: { ...safeColorTune, [band.key]: { ...safeColorTune[band.key], lightness: Number(e.target.value) } } }))} />
                          </Field>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
