import { useMemo, useState } from "react";
import JSZip from "jszip";
import { Button, Card, Field, Input, Select, Slider } from "../components/ui";
import { downloadBlob } from "../lib/download";
import { RASTER_OUTPUTS, type RasterOut } from "../lib/rasterFormats";
import { humanBytes } from "../lib/format";

declare global { interface Window { pdfjsLib?: any } }

const DPI_CHOICES = [150, 300, 600];
type PageMode = "current" | "range" | "all";

async function loadPdfLib() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.124/pdf.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Unable to load PDF library"));
    document.head.appendChild(script);
  });
  if (!window.pdfjsLib) throw new Error("Unable to load PDF library");
  return window.pdfjsLib;
}

function parseRange(input: string, max: number) {
  const out = new Set<number>();
  const chunks = input.split(",").map((s) => s.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const range = chunk.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const a = Math.max(1, Math.min(max, Number(range[1])));
      const b = Math.max(1, Math.min(max, Number(range[2])));
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) out.add(i);
      continue;
    }
    const single = Number(chunk);
    if (Number.isFinite(single)) out.add(Math.max(1, Math.min(max, single)));
  }
  return out.size ? [...out].sort((a, b) => a - b) : [1];
}

export function PdfRasterTab() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [dpi, setDpi] = useState(300);
  const [customDpi, setCustomDpi] = useState("300");
  const [useCustom, setUseCustom] = useState(false);

  const [out, setOut] = useState<RasterOut>("png");
  const [quality, setQuality] = useState(95);
  const [transparent, setTransparent] = useState(false);
  const [pageMode, setPageMode] = useState<PageMode>("current");
  const [pageRange, setPageRange] = useState("1-1");
  const [currentPage, setCurrentPage] = useState(1);
  const [renderMode, setRenderMode] = useState("normal");
  const [superSharp, setSuperSharp] = useState(false);

  const [pages, setPages] = useState(0);
  const [preview, setPreview] = useState<string>("");
  const [estimated, setEstimated] = useState(0);
  const [warning, setWarning] = useState("");
  const [pdfType, setPdfType] = useState("Unknown");

  const finalDpi = useMemo(() => (useCustom ? Math.max(72, Number(customDpi) || 300) : dpi), [useCustom, customDpi, dpi]);

  async function inspectPdf(nextFile: File) {
    const pdfjs = await loadPdfLib();
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.124/pdf.worker.min.js";
    const buf = await nextFile.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: buf }).promise;
    setPages(pdf.numPages);
    setCurrentPage((p) => Math.max(1, Math.min(pdf.numPages, p)));
    const firstPage = await pdf.getPage(1);
    const text = await firstPage.getTextContent();
    setPdfType(text.items?.length > 0 ? "Vector / selectable text" : "Scanned / image PDF");
  }

  return <Card title="PDF → Raster" subtitle="Convert PDF pages to high-quality images with full rendering controls.">
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-900/55">
      <label className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-700">
        Choose PDF
        <input
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={async (e) => {
            const picked = e.target.files?.[0] || null;
            setFile(picked);
            setPreview("");
            setEstimated(0);
            setWarning("");
            setPdfType("Unknown");
            setPages(0);
            setError("");
            if (!picked) return;
            try {
              await inspectPdf(picked);
            } catch (err: any) {
              setError(err?.message || "Unable to open this PDF file.");
            }
          }}
        />
      </label>
      <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
        {file ? `Selected: ${file.name} (${humanBytes(file.size)})` : "Select a PDF to enable page controls and conversion."}
      </div>
    </div>

    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
      <Field label="DPI selector"><div className="flex gap-2"><Select value={useCustom ? "custom" : String(dpi)} onChange={(e) => { if (e.target.value === "custom") setUseCustom(true); else { setUseCustom(false); setDpi(Number(e.target.value)); } }}>{DPI_CHOICES.map((d) => <option key={d} value={d}>{d}</option>)}<option value="custom">Custom</option></Select>{useCustom ? <Input value={customDpi} onChange={(e) => setCustomDpi(e.target.value.replace(/[^\d]/g, ""))} /> : null}</div></Field>
      <Field label="Output format"><Select value={out} onChange={(e) => setOut(e.target.value as RasterOut)}>{RASTER_OUTPUTS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</Select></Field>
      <Field label="JPEG/WebP quality" hint={`${quality}`}><Slider min={80} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} /></Field>
      <Field label="Transparent background (PNG only)"><input type="checkbox" checked={transparent} disabled={out !== "png"} onChange={(e) => setTransparent(e.target.checked)} /> {out !== "png" ? <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">Only available for PNG output.</span> : null}</Field>
      <Field label="Page selection"><Select value={pageMode} onChange={(e) => setPageMode(e.target.value as PageMode)}><option value="current">Current page</option><option value="range">Page range</option><option value="all">All pages (ZIP)</option></Select></Field>
      {pageMode === "current" ? <Field label="Current page"><Input value={currentPage} type="number" min={1} max={pages || undefined} onChange={(e) => setCurrentPage(Number(e.target.value) || 1)} /></Field> : null}
      {pageMode === "range" ? <Field label="Page range"><Input value={pageRange} onChange={(e) => setPageRange(e.target.value)} placeholder="1-5,8,10-12" /></Field> : null}
      <Field label="Render mode"><Select value={renderMode} onChange={(e) => setRenderMode(e.target.value)}><option value="normal">Normal rendering</option><option value="print">Print-quality rendering</option><option value="text">Text-sharp mode</option><option value="contrast">High-contrast mode</option></Select></Field>
      <Field label="Super-sharp"><input type="checkbox" checked={superSharp} onChange={(e) => setSuperSharp(e.target.checked)} /> Render higher then downscale</Field>
    </div>

    <div className="mt-3 text-xs text-slate-600 dark:text-slate-300">Live preview, estimated size, memory warning, and vector/scanned auto-detect are applied after loading PDF.</div>
    {warning ? <div className="mt-2 text-sm text-amber-700 dark:text-amber-300">⚠️ {warning}</div> : null}
    {error ? <div className="mt-2 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}
    <div className="mt-2 text-sm text-slate-700 dark:text-slate-200">Detected PDF type: <b>{pdfType}</b> · Pages: <b>{pages || "-"}</b> · Estimated output size: <b>{estimated ? humanBytes(estimated) : "-"}</b></div>
    {preview ? <img src={preview} className="mt-3 max-h-[420px] w-full rounded-xl border border-slate-200 object-contain dark:border-slate-700" /> : null}

    <div className="mt-4 flex gap-2">
      <Button
        disabled={!file || busy}
        onClick={async () => {
          if (!file) return;
          let previewUrl = "";
          try {
            setBusy(true);
            setError("");
            setWarning("");
            setEstimated(0);
            if (preview) URL.revokeObjectURL(preview);
            setPreview("");

            const pdfjs = await loadPdfLib();
            pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.124/pdf.worker.min.js";
            const buf = await file.arrayBuffer();
            const pdf = await pdfjs.getDocument({ data: buf }).promise;
            setPages(pdf.numPages);

            const selected = pageMode === "all"
              ? Array.from({ length: pdf.numPages }, (_, i) => i + 1)
              : pageMode === "range"
              ? parseRange(pageRange, pdf.numPages)
              : [Math.max(1, Math.min(pdf.numPages, currentPage))];

            const zip = new JSZip();
            let totalEstimated = 0;

            for (const p of selected) {
              const page = await pdf.getPage(p);
              if (p === selected[0]) {
                const text = await page.getTextContent();
                setPdfType(text.items?.length > 0 ? "Vector / selectable text" : "Scanned / image PDF");
              }

              const scale = (finalDpi / 72) * (superSharp ? 2 : 1);
              const vp = page.getViewport({ scale });
              const c = document.createElement("canvas");
              c.width = Math.ceil(vp.width);
              c.height = Math.ceil(vp.height);
              const ctx = c.getContext("2d", { alpha: transparent && out === "png" });
              if (!ctx) throw new Error("Canvas unavailable");

              if (!(transparent && out === "png")) {
                ctx.fillStyle = "#fff";
                ctx.fillRect(0, 0, c.width, c.height);
              }
              ctx.imageSmoothingEnabled = renderMode !== "text";
              ctx.imageSmoothingQuality = renderMode === "print" ? "high" : "medium";

              await page.render({ canvasContext: ctx, viewport: vp }).promise;

              if (renderMode === "contrast") {
                const img = ctx.getImageData(0, 0, c.width, c.height);
                for (let i = 0; i < img.data.length; i += 4) {
                  img.data[i] = Math.min(255, img.data[i] * 1.1);
                  img.data[i + 1] = Math.min(255, img.data[i + 1] * 1.1);
                  img.data[i + 2] = Math.min(255, img.data[i + 2] * 1.1);
                }
                ctx.putImageData(img, 0, 0);
              }

              let outCanvas = c;
              if (superSharp) {
                const d = document.createElement("canvas");
                d.width = Math.round(c.width / 2);
                d.height = Math.round(c.height / 2);
                const dctx = d.getContext("2d");
                if (!dctx) throw new Error("Canvas unavailable");
                dctx.imageSmoothingEnabled = true;
                dctx.imageSmoothingQuality = "high";
                dctx.drawImage(c, 0, 0, d.width, d.height);
                outCanvas = d;
              }

              const mime = out === "jpg" || out === "jpeg" ? "image/jpeg" : out === "webp" ? "image/webp" : "image/png";
              const blob: Blob = await new Promise((resolve, reject) => outCanvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Encode failed"))), mime, quality / 100));

              totalEstimated += blob.size;
              setEstimated(totalEstimated);

              if (p === selected[0]) {
                previewUrl = URL.createObjectURL(blob);
                setPreview(previewUrl);
              }

              const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
              if (selected.length === 1) {
                downloadBlob(blob, `${file.name.replace(/\.pdf$/i, "")}-p${p}.${ext}`);
              } else {
                zip.file(`page-${p}.${ext}`, blob);
              }
            }

            if (selected.length > 1) {
              const zb = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
              downloadBlob(zb, `${file.name.replace(/\.pdf$/i, "")}-pages.zip`);
            }

            const mega = (finalDpi / 150) * (selected.length || 1);
            if (mega > 8) setWarning("High DPI on many pages may consume large memory.");
          } catch (err: any) {
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            setPreview("");
            setError(err?.message || "PDF conversion failed.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Converting…" : "Convert PDF"}
      </Button>
    </div>
  </Card>;
}
