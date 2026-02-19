import { Card, Badge } from "../components/ui";
import { Accordion } from "../components/Accordion";
import { FORMAT_TIPS } from "../lib/presets";

export function HelpTab() {
  const faq = [
    {
      id: "privacy",
      title: "Do my images upload to a server?",
      body: (
        <>
          <p>No. This website processes images directly in your browser. Your files stay on your device.</p>
          <p className="mt-2">Close the tab and the website loses access to your files. Nothing is stored online.</p>
        </>
      ),
    },
    {
      id: "pngjpg",
      title: "Why did PNG → JPG remove transparency?",
      body: <p>JPG cannot store transparency. Transparent pixels must become a solid background color (white is most common).</p>,
    },
    {
      id: "quality",
      title: "Why do WebP/JPG sometimes look blurry?",
      body: (
        <p>
          WebP/JPG are compressed formats. Low quality values remove detail to reduce size. Try 90–95 for important images, or 85–92
          for normal web usage.
        </p>
      ),
    },
    {
      id: "svgperfect",
      title: "Can raster → SVG be 100% identical?",
      body: (
        <>
          <p>
            Not always. Raster is pixels; SVG is shapes. Tracing pixels into shapes is an estimation. Logos/icons can be very close.
            Photos often become huge SVG files and still won't be identical.
          </p>
          <p className="mt-2">Best results: simple background + high contrast + try Logo presets before Custom tuning.</p>
        </>
      ),
    },
    { id: "batchzip", title: "How do I convert many images and download once?", body: <p>Use the Batch ZIP tab to export one ZIP.</p> },
  ];

  return (
    <div className="space-y-5">
      <Card title="Help & Tips" subtitle="Clear answers to common questions." right={<Badge tone="info">User-first</Badge>}>
        <Accordion items={faq} />
      </Card>

      <Card title="Which format should I choose?" subtitle="A practical guide.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {FORMAT_TIPS.map((f) => (
            <div key={f.id} className="rounded-2xl bg-slate-50 ring-1 ring-slate-200 p-4">
              <div className="text-sm font-semibold text-slate-800">{f.title}</div>

              <div className="mt-3 text-xs text-slate-500">Good for</div>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-600 space-y-1">{f.goodFor.map((x) => <li key={x}>{x}</li>)}</ul>

              <div className="mt-3 text-xs text-slate-500">Avoid for</div>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-600 space-y-1">{f.avoidFor.map((x) => <li key={x}>{x}</li>)}</ul>

              <div className="mt-3 text-xs text-slate-500">Notes</div>
              <ul className="mt-1 list-disc pl-5 text-sm text-slate-600 space-y-1">{f.notes.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Most requested features now included" subtitle="Based on common user requests for image tools.">
        <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
          <li>Higher SVG tracing quality with up to 128 colors.</li>
          <li>Batch conversion with one ZIP download.</li>
          <li>Conversion Finder to guide beginners quickly.</li>
          <li>Private local processing: files stay on your device.</li>
          <li>Cleaner UI labels focused on normal users.</li>
        </ul>
      </Card>
    </div>
  );
}
