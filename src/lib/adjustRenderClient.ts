export type RenderMode = "interactive" | "final" | "export";

type RenderPayload = {
  mode: RenderMode;
  sourceCanvas: HTMLCanvasElement;
  originalWidth: number;
  originalHeight: number;
  showLiveCropOverlayOnly: boolean;
  interactiveMaxDimension: number;
  finalScale: number;
  settings: unknown;
  lut3d: { size: number; table: Float32Array } | null;
};

type PendingRequest = {
  resolve: (value: { bitmap: ImageBitmap; width: number; height: number }) => void;
  reject: (error?: unknown) => void;
};

export class AdjustRenderClient {
  private worker: Worker | null = null;
  private requestId = 0;
  private latestRequestId = 0;
  private pending = new Map<number, PendingRequest>();

  private ensureWorker() {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("../workers/adjustRender.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      const data = event.data as { type: string; requestId: number; bitmap: ImageBitmap; width: number; height: number };
      if (data.type !== "rendered") return;
      const entry = this.pending.get(data.requestId);
      if (!entry) {
        data.bitmap.close();
        return;
      }
      this.pending.delete(data.requestId);
      if (data.requestId !== this.latestRequestId) {
        data.bitmap.close();
        entry.reject(new Error("stale-render"));
        return;
      }
      entry.resolve({ bitmap: data.bitmap, width: data.width, height: data.height });
    };
    this.worker = worker;
    return worker;
  }

  async render(payload: RenderPayload) {
    const worker = this.ensureWorker();
    const sourceBitmap = await createImageBitmap(payload.sourceCanvas);
    const requestId = ++this.requestId;
    this.latestRequestId = requestId;

    for (const [id, pending] of this.pending.entries()) {
      if (id < requestId) {
        pending.reject(new Error("superseded"));
        this.pending.delete(id);
      }
    }

    return new Promise<{ bitmap: ImageBitmap; width: number; height: number }>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      worker.postMessage({
        type: "render",
        requestId,
        mode: payload.mode,
        sourceBitmap,
        sourceWidth: payload.sourceCanvas.width,
        sourceHeight: payload.sourceCanvas.height,
        originalWidth: payload.originalWidth,
        originalHeight: payload.originalHeight,
        showLiveCropOverlayOnly: payload.showLiveCropOverlayOnly,
        interactiveMaxDimension: payload.interactiveMaxDimension,
        finalScale: payload.finalScale,
        settings: payload.settings,
        lut3d: payload.lut3d
      }, [sourceBitmap]);
    });
  }

  invalidate() {
    this.latestRequestId = this.requestId + 1;
    for (const [id, pending] of this.pending.entries()) {
      pending.reject(new Error("invalidated"));
      this.pending.delete(id);
    }
  }

  stop() {
    this.invalidate();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
