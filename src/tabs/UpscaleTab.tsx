import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { Button, Card, Field, Input, Select, Slider } from "../components/ui";
import { Dropzone } from "../components/Dropzone";
import { Toast, type ToastState } from "../components/Toast";
import { AdjustRenderClient } from "../lib/adjustRenderClient";
import type { CommonRasterSettings } from "../lib/settings";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/bmp", "image/gif", "image/avif", "image/tiff"];
const HSL_RANGES = ["red", "orange", "yellow", "green", "aqua", "blue", "purple", "magenta"] as const;
type HslRange = (typeof HSL_RANGES)[number];
type RGB = { r: number; g: number; b: number };
type CurvePoint = { x: number; y: number };
type CurveChannel = "rgb" | "r" | "g" | "b";

export type EditorState = {
  basicTone: { exposure: number; brightness: number; contrast: number; highlights: number; shadows: number; whites: number; blacks: number };
  toneCurve: Record<CurveChannel, CurvePoint[]>;
  color: { temperature: number; tint: number; vibrance: number; saturation: number; hsl: Record<HslRange, { hue: number; sat: number; lum: number }> };
  grading: { shadows: { hue: number; sat: number; lum: number }; midtones: { hue: number; sat: number; lum: number }; highlights: { hue: number; sat: number; lum: number } };
  detail: { sharpenAmount: number; sharpenRadius: number; sharpenThreshold: number; clarity: number; texture: number; dehaze: number; noiseLuma: number; noiseColor: number };
  geometry: { cropX: number; cropY: number; cropW: number; cropH: number; rotate: number; flipH: boolean; flipV: boolean; resizeW: number; resizeH: number; perspectiveV: number; perspectiveH: number; lensDistortion: number; vignette: number; smoothingQuality: "low" | "medium" | "high" };
  advanced: { gamma: number; channelMixer: { r: RGB; g: RGB; b: RGB }; labMode: boolean; highPass: number; edgePreview: boolean };
  export: { format: "png" | "jpg" | "webp" | "avif"; quality: number; bitDepth: "8-bit"; colorSpace: "sRGB"; resizeOnExport: boolean; width: number; height: number };
};
export type LUT3D = { size: number; table: Float32Array } | null;
type SectionKey = "basicTone"|"toneCurve"|"color"|"grading"|"detail"|"geometry"|"advanced"|"export";

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: "basicTone", label: "Tone" }, { key: "toneCurve", label: "Curve" }, { key: "color", label: "Color" }, { key: "grading", label: "Grading" },
  { key: "detail", label: "Detail" }, { key: "geometry", label: "Geometry" }, { key: "export", label: "Export" }
];

const defaultState: EditorState = { basicTone: { exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 }, toneCurve: { rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }], r: [{ x: 0, y: 0 }, { x: 255, y: 255 }], g: [{ x: 0, y: 0 }, { x: 255, y: 255 }], b: [{ x: 0, y: 0 }, { x: 255, y: 255 }] }, color: { temperature: 0, tint: 0, vibrance: 0, saturation: 0, hsl: Object.fromEntries(HSL_RANGES.map((k) => [k, { hue: 0, sat: 0, lum: 0 }])) as EditorState["color"]["hsl"] }, grading: { shadows: { hue: 220, sat: 0, lum: 0 }, midtones: { hue: 35, sat: 0, lum: 0 }, highlights: { hue: 50, sat: 0, lum: 0 } }, detail: { sharpenAmount: 0, sharpenRadius: 1, sharpenThreshold: 0, clarity: 0, texture: 0, dehaze: 0, noiseLuma: 0, noiseColor: 0 }, geometry: { cropX: 0, cropY: 0, cropW: 100, cropH: 100, rotate: 0, flipH: false, flipV: false, resizeW: 0, resizeH: 0, perspectiveV: 0, perspectiveH: 0, lensDistortion: 0, vignette: 0, smoothingQuality: "high" }, advanced: { gamma: 1, channelMixer: { r: { r: 100, g: 0, b: 0 }, g: { r: 0, g: 100, b: 0 }, b: { r: 0, g: 0, b: 100 } }, labMode: false, highPass: 0, edgePreview: false }, export: { format: "png", quality: 92, bitDepth: "8-bit", colorSpace: "sRGB", resizeOnExport: false, width: 0, height: 0 } };

function useHistory<T>(initial: T) {
  const [past, setPast] = useState<T[]>([]);
  const [present, setPresent] = useState<T>(initial);
  const [future, setFuture] = useState<T[]>([]);
  const commit = useCallback((next: T) => { setPast((p) => [...p.slice(-30), present]); setPresent(next); setFuture([]); }, [present]);
  const undo = () => setPast((p) => (p.length ? (setFuture((f) => [present, ...f]), setPresent(p[p.length - 1]), p.slice(0, -1)) : p));
  const redo = () => setFuture((f) => (f.length ? (setPast((p) => [...p, present]), setPresent(f[0]), f.slice(1)) : f));
  return { past, present, future, commit, undo, redo };
}

function SectionIcon({ kind }: { kind: SectionKey }) { return <span className="text-lg">{{ basicTone: "◐", toneCurve: "⌁", color: "◉", grading: "◍", detail: "✦", geometry: "▣", advanced: "⚙", export: "⇩" }[kind]}</span>; }

function BottomToolBar({ selected, onSelect }: { selected: SectionKey; onSelect: (k: SectionKey) => void }) {
  return <div className="grid grid-cols-7 gap-2 border-t border-slate-800 bg-slate-950/95 p-2">{SECTIONS.map((s) => <button key={s.key} onClick={() => onSelect(s.key)} className={`h-11 rounded-full border ${selected === s.key ? "border-sky-400 ring-1 ring-sky-300 text-sky-200 opacity-100" : "border-slate-700 text-slate-200 opacity-45"}`} aria-label={s.label}><SectionIcon kind={s.key} /></button>)}</div>;
}

function ToolPanel({ tool, state, patch }: { tool: SectionKey; state: EditorState; patch: (u: (p: EditorState) => EditorState) => void }) {
  if (tool === "basicTone") return <div className="space-y-2">{Object.entries(state.basicTone).map(([k, v]) => <Field key={k} label={k} hint={String(v)}><Slider min={k === "exposure" ? -5 : -100} max={k === "exposure" ? 5 : 100} step={k === "exposure" ? 0.1 : 1} value={v} onChange={(e) => patch((p) => ({ ...p, basicTone: { ...p.basicTone, [k]: Number(e.target.value) } }))} /></Field>)}</div>;
  if (tool === "detail") return <div className="space-y-2">{Object.entries(state.detail).map(([k, v]) => <Field key={k} label={k} hint={String(v)}><Slider min={k === "sharpenRadius" ? 1 : 0} max={100} value={v} onChange={(e) => patch((p) => ({ ...p, detail: { ...p.detail, [k]: Number(e.target.value) } }))} /></Field>)}</div>;
  if (tool === "color") return <div className="space-y-2"><Field label="Temperature" hint={String(state.color.temperature)}><Slider min={-100} max={100} value={state.color.temperature} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, temperature: Number(e.target.value) } }))} /></Field><Field label="Tint" hint={String(state.color.tint)}><Slider min={-100} max={100} value={state.color.tint} onChange={(e) => patch((p) => ({ ...p, color: { ...p.color, tint: Number(e.target.value) } }))} /></Field></div>;
  if (tool === "grading") return <div className="space-y-2">{(["shadows", "midtones", "highlights"] as const).map((row) => <div key={row} className="rounded-xl border border-slate-700 p-2"><p className="mb-1 text-xs uppercase text-slate-400">{row}</p><Field label="Hue" hint={String(state.grading[row].hue)}><Slider min={0} max={360} value={state.grading[row].hue} onChange={(e) => patch((p) => ({ ...p, grading: { ...p.grading, [row]: { ...p.grading[row], hue: Number(e.target.value) } } }))} /></Field></div>)}</div>;
  if (tool === "geometry") return <div className="space-y-2"><Field label="Rotate" hint={String(state.geometry.rotate)}><Slider min={-180} max={180} value={state.geometry.rotate} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, rotate: Number(e.target.value) } }))} /></Field><Field label="Crop width" hint={String(state.geometry.cropW)}><Slider min={1} max={100} value={state.geometry.cropW} onChange={(e) => patch((p) => ({ ...p, geometry: { ...p.geometry, cropW: Number(e.target.value) } }))} /></Field></div>;
  if (tool === "export") return <div className="space-y-2"><Field label="Format"><Select value={state.export.format} onChange={(e) => patch((p) => ({ ...p, export: { ...p.export, format: e.target.value as EditorState["export"]["format"] } }))}><option value="png">PNG</option><option value="jpg">JPG</option><option value="webp">WebP</option><option value="avif">AVIF</option></Select></Field><Field label="Quality" hint={String(state.export.quality)}><Slider min={1} max={100} value={state.export.quality} onChange={(e) => patch((p) => ({ ...p, export: { ...p.export, quality: Number(e.target.value) } }))} /></Field></div>;
  return <div className="space-y-2"><Field label="Gamma" hint={state.advanced.gamma.toFixed(2)}><Slider min={0.2} max={3} step={0.01} value={state.advanced.gamma} onChange={(e) => patch((p) => ({ ...p, advanced: { ...p.advanced, gamma: Number(e.target.value) } }))} /></Field></div>;
}

function DesktopAdjustmentsLayout({
  previewRef, children, controls
}: { previewRef: RefObject<HTMLCanvasElement>; children: React.ReactNode; controls: React.ReactNode }) {
  return <div className="hidden lg:grid lg:grid-cols-[minmax(0,1fr)_420px] gap-4 h-[calc(100vh-10rem)] overflow-hidden"><div className="sticky top-4 h-full">{children}<canvas ref={previewRef} className="mt-3 max-h-[66vh] w-full rounded-xl border border-slate-700 bg-slate-900 object-contain" /></div><div className="h-full overflow-y-auto pr-1">{controls}</div></div>;
}

function MobileAdjustmentsEditor({
  open, onClose, previewRef, state, patch, tool, setTool, onReset, onExport, fullBusy
}: { open: boolean; onClose: () => void; previewRef: RefObject<HTMLCanvasElement>; state: EditorState; patch: (u: (p: EditorState) => EditorState) => void; tool: SectionKey; setTool: (t: SectionKey) => void; onReset: () => void; onExport: () => void; fullBusy: boolean }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex h-screen flex-col overflow-hidden bg-slate-950 text-white" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
    <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2"><Button variant="ghost" className="!bg-transparent" onClick={onClose}>Back</Button><p className="font-semibold">Adjustments</p><Button variant="ghost" onClick={onReset}>Reset All</Button></div>
    <div className="flex-1 overflow-hidden p-2">
      <div className="flex h-[45%] flex-col rounded-xl border border-slate-800 bg-slate-900 p-2">
        <div className="mb-2 flex gap-2"><Button variant="ghost">Fit</Button><Button variant="ghost">100%</Button><Button variant="ghost">-</Button><Button variant="ghost">+</Button></div>
        <div className="flex-1 overflow-hidden"><canvas ref={previewRef} className="h-full w-full rounded-lg object-contain" /></div>
      </div>
      <div className="mt-2 flex h-[calc(55%-0.5rem)] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90">
        <div className="flex-1 overflow-y-auto p-3"><ToolPanel tool={tool} state={state} patch={patch} /></div>
        <BottomToolBar selected={tool} onSelect={setTool} />
      </div>
    </div>
    {fullBusy ? <div className="pointer-events-none absolute right-3 top-14 rounded bg-slate-800/80 px-2 py-1 text-xs">Updating…</div> : null}
    {tool === "export" ? <button className="sr-only" onClick={onExport}>Export</button> : null}
  </div>;
}

export function UpscaleTab({ setSettings, active }: { settings: CommonRasterSettings; setSettings: (up: (p: CommonRasterSettings) => CommonRasterSettings) => void; active: boolean }) {
  const [toast, setToast] = useState<ToastState>({ open: false, message: "" });
  const [file, setFile] = useState<File | null>(null);
  const [lut3d, setLut3d] = useState<LUT3D>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tool, setTool] = useState<SectionKey>("basicTone");
  const [showBefore, setShowBefore] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const [fullBusy, setFullBusy] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const renderClientRef = useRef<AdjustRenderClient | null>(null);
  const rafRef = useRef<number | null>(null);

  const { present: state, commit, undo, redo, past, future } = useHistory(defaultState);
  const patch = useCallback((updater: (prev: EditorState) => EditorState) => commit(updater(state)), [commit, state]);

  useEffect(() => { renderClientRef.current = new AdjustRenderClient(); return () => renderClientRef.current?.dispose(); }, []);
  useEffect(() => { if (!active) { renderClientRef.current?.dispose(); renderClientRef.current = null; } else if (!renderClientRef.current) { renderClientRef.current = new AdjustRenderClient(); } }, [active]);

  useEffect(() => { const m = window.matchMedia("(max-width: 899px)"); const sync = () => setIsMobile(m.matches); sync(); m.addEventListener("change", sync); return () => m.removeEventListener("change", sync); }, []);
  useEffect(() => { if (!isMobile) setMobileOpen(false); }, [isMobile]);

  const renderFrame = useCallback((mode: "preview"|"full") => {
    if (!active || !file || !previewCanvasRef.current || !renderClientRef.current || showBefore) return;
    if (mode === "full") setFullBusy(true);
    renderClientRef.current.render(state, mode, lut3d).then((bitmap) => {
      const c = previewCanvasRef.current;
      if (!c) return;
      c.width = bitmap.width; c.height = bitmap.height;
      c.getContext("2d")?.drawImage(bitmap, 0, 0);
      bitmap.close();
      setFullBusy(false);
    });
  }, [active, file, lut3d, showBefore, state]);

  useEffect(() => {
    if (!file || !active) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => renderFrame(isInteracting ? "preview" : "full"));
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [state, renderFrame, isInteracting, file, active]);

  const loadImage = async (f: File) => {
    setFile(f);
    await renderClientRef.current?.setSource(f);
    const bm = await createImageBitmap(f);
    patch((p) => ({ ...p, geometry: { ...p.geometry, resizeW: bm.width, resizeH: bm.height }, export: { ...p.export, width: bm.width, height: bm.height } }));
    bm.close();
  };

  const parseCube = async (cube: File) => {
    const text = await cube.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).filter((l) => !l.startsWith("#"));
    const size = Number(lines.find((l) => l.startsWith("LUT_3D_SIZE"))?.split(/\s+/)[1]);
    const values = lines.filter((l) => /^[-\d.]+\s+[-\d.]+\s+[-\d.]+$/.test(l)).flatMap((l) => l.split(/\s+/).map(Number));
    if (!size || values.length < size * size * size * 3) throw new Error("invalid cube");
    setLut3d({ size, table: new Float32Array(values.slice(0, size * size * size * 3)) });
  };

  const exportImage = async () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), state.export.format === "jpg" ? "image/jpeg" : `image/${state.export.format}`, state.export.quality / 100));
    if (!blob) return;
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `edited.${state.export.format}`; a.click(); URL.revokeObjectURL(url);
    setSettings((p) => ({ ...p, quality: state.export.quality, out: state.export.format === "jpg" ? "jpeg" : state.export.format as never }));
  };

  const mainControls = <div className="space-y-3" onPointerDownCapture={() => setIsInteracting(true)} onPointerUpCapture={() => setIsInteracting(false)} onPointerCancelCapture={() => setIsInteracting(false)}>
    <Card title="Workflow" right={<Button variant="ghost" onClick={() => commit(defaultState)}>Reset All</Button>}><div className="flex gap-2"><Button variant="ghost" disabled={!past.length} onClick={undo}>Undo</Button><Button variant="ghost" disabled={!future.length} onClick={redo}>Redo</Button></div></Card>
    {SECTIONS.map((s) => <Card key={s.key} title={s.label}><ToolPanel tool={s.key} state={state} patch={patch} /></Card>)}
    <Card title="Advanced"><ToolPanel tool="advanced" state={state} patch={patch} /><Field label="3D LUT (.cube)"><Input type="file" accept=".cube" onChange={(e) => { const f = e.target.files?.[0]; if (f) parseCube(f).catch(() => setToast({ open: true, type: "error", message: "Invalid LUT" })); }} /></Field></Card>
    <Button className="w-full" onClick={exportImage} disabled={!file}>Export</Button>
  </div>;

  return <>
    <Toast state={toast} onClose={() => setToast((t) => ({ ...t, open: false }))} />
    <DesktopAdjustmentsLayout previewRef={previewCanvasRef} controls={mainControls}>
      <Card title="Adjustments" subtitle="Fast preview, full quality on release">
        <Dropzone accept={ACCEPT} label="Drop image" helper="All processing stays on your device." onFiles={(files) => files[0] && loadImage(files[0])} />
        <div className="mt-3 flex flex-wrap gap-2"><Button variant={showBefore ? "primary" : "ghost"} onClick={() => setShowBefore((v) => !v)}>Before</Button>{isMobile ? <Button variant="ghost" onClick={() => setMobileOpen(true)}>Open mobile editor</Button> : null}</div>
      </Card>
    </DesktopAdjustmentsLayout>

    {isMobile && !mobileOpen ? <Card title="Adjustments" subtitle="Mobile editor"><Dropzone accept={ACCEPT} label="Drop image" helper="Tap open editor after loading." onFiles={(files) => files[0] && loadImage(files[0])} /><div className="mt-3"><Button className="w-full" onClick={() => setMobileOpen(true)} disabled={!file}>Open editor</Button></div></Card> : null}

    <MobileAdjustmentsEditor open={isMobile && mobileOpen} onClose={() => setMobileOpen(false)} previewRef={previewCanvasRef} state={state} patch={patch} tool={tool} setTool={setTool} onReset={() => commit(defaultState)} onExport={exportImage} fullBusy={fullBusy} />
  </>;
}
