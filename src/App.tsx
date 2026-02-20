import { useMemo } from "react";
import { AppShell } from "./components/ui";
import { FlowBackground } from "./components/FlowBackground";
import { TabBar } from "./components/TabBar";
import type { TabKey } from "./tabs/tabs";
import { useLocal } from "./lib/useLocal";
import { defaultRasterSettings, type CommonRasterSettings } from "./lib/settings";

import { RasterPairTab } from "./tabs/RasterPairTab";
import { AnyRasterTab } from "./tabs/AnyRasterTab";
import { RasterToSvgTab } from "./tabs/RasterToSvgTab";
import { SvgToRasterTab } from "./tabs/SvgToRasterTab";
import { BatchZipTab } from "./tabs/BatchZipTab";
import { ConversionFinderTab } from "./tabs/ConversionFinderTab";
import { HelpTab } from "./tabs/HelpTab";
import { UpscaleTab } from "./tabs/UpscaleTab";
import { PdfRasterTab } from "./tabs/PdfRasterTab";

export default function App() {
  const [tab, setTab] = useLocal<TabKey>("ic.tab", "png-jpg");
  const [raster, setRaster] = useLocal<CommonRasterSettings>("ic.raster", defaultRasterSettings);

  const page = useMemo(() => {
    switch (tab) {
      case "png-jpg":
        return (
          <RasterPairTab
            title="PNG ↔ JPG"
            subtitle="Convert PNG to JPG (choose background), or JPG to PNG (graphics)."
            recommended={[
              "Use PNG for logos, UI, text, or transparency.",
              "Use JPG for photos when you want smaller size.",
              "When exporting to JPG from PNG: pick a background color."
            ]}
            fixedOutChoices={["png", "jpg"]}
            defaultOut="jpg"
            settings={raster}
            setSettings={(up) => setRaster((p) => up(p))}
          />
        );
      case "png-webp":
        return (
          <RasterPairTab
            title="PNG ↔ WebP"
            subtitle="WebP is modern and often smaller. Great for web performance."
            recommended={[
              "WebP is usually smaller than PNG while looking similar.",
              "Use PNG when you need crisp text and maximum compatibility.",
              "PNG and WebP can both support transparency."
            ]}
            fixedOutChoices={["png", "webp"]}
            defaultOut="webp"
            settings={raster}
            setSettings={(up) => setRaster((p) => up(p))}
          />
        );
      case "jpg-webp":
        return (
          <RasterPairTab
            title="JPG ↔ WebP"
            subtitle="Photo-focused conversion with a quality slider."
            recommended={[
              "WebP can reduce JPG size significantly at similar quality.",
              "For high quality photos, try 92–95.",
              "If you see blur: increase quality."
            ]}
            fixedOutChoices={["jpg", "webp"]}
            defaultOut="webp"
            settings={raster}
            setSettings={(up) => setRaster((p) => up(p))}
          />
        );
      case "any-raster":
        return <AnyRasterTab settings={raster} setSettings={(up)=>setRaster((p)=>up(p))} />;
      case "raster-svg":
        return <RasterToSvgTab />;
      case "svg-raster":
        return <SvgToRasterTab settings={raster} setSettings={(up)=>setRaster((p)=>up(p))} />;
      case "batch":
        return <BatchZipTab settings={raster} setSettings={(up)=>setRaster((p)=>up(p))} />;
      case "finder":
        return <ConversionFinderTab />;
      case "upscale":
        return <UpscaleTab settings={raster} setSettings={(up)=>setRaster((p)=>up(p))} />;
      case "pdf-raster":
        return <PdfRasterTab />;
      case "help":
        return <HelpTab />;
      default:
        return null;
    }
  }, [tab, raster, setRaster]);

  return (
    <>
      <FlowBackground />
      <AppShell>
        <TabBar value={tab} onChange={setTab} />
        <div className="mt-5">{page}</div>
      </AppShell>
    </>
  );
}
