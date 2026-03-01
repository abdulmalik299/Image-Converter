import { runAdjustRender, type RenderRequest } from "./adjustRenderPipeline";

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

type RenderResult = { bitmap: ImageBitmap; width: number; height: number };

type PendingRequest = {
  resolve: (value: RenderResult) => void;
  reject: (error?: unknown) => void;
  timeoutId: number;
};

export type RenderErrorInfo = {
  mode: RenderMode;
  source: "worker" | "main";
  message: string;
};

type WorkerRenderMessage = { type: "rendered"; requestId: number; bitmap: ImageBitmap; width: number; height: number };
type WorkerErrorMessage = { type: "error"; requestId: number; message: string; stack?: string };

const RENDER_TIMEOUT_MS = 10000;

export class AdjustRenderClient {
  onRenderError?: (error: RenderErrorInfo) => void;
  private worker: Worker | null = null;
  private requestId = 0;
  private latestRequestId = 0;
  private pending = new Map<number, PendingRequest>();
  private compatibilityMode = false;

  private createWorker() {
    if (this.compatibilityMode) return null;
    try {
      const worker = new Worker(new URL("../workers/adjustRender.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event) => {
        const data = event.data as WorkerRenderMessage | WorkerErrorMessage;
        if (data.type === "error") {
          const entry = this.pending.get(data.requestId);
          if (entry) {
            window.clearTimeout(entry.timeoutId);
            this.pending.delete(data.requestId);
            entry.reject(new Error(data.message));
          }
          this.rejectAllAndReset(new Error(data.message || "Render worker failed"));
          return;
        }
        if (data.type !== "rendered") return;
        const entry = this.pending.get(data.requestId);
        if (!entry) {
          data.bitmap.close();
          return;
        }
        window.clearTimeout(entry.timeoutId);
        this.pending.delete(data.requestId);
        if (data.requestId !== this.latestRequestId) {
          data.bitmap.close();
          entry.reject(new Error("stale-render"));
          return;
        }
        entry.resolve({ bitmap: data.bitmap, width: data.width, height: data.height });
      };
      worker.onerror = (event) => {
        const message = event.message || "Render worker crashed";
        this.rejectAllAndReset(new Error(message));
      };
      worker.onmessageerror = () => {
        this.rejectAllAndReset(new Error("Render worker message error"));
      };
      return worker;
    } catch {
      this.compatibilityMode = true;
      return null;
    }
  }

  private ensureWorker() {
    if (this.worker) return this.worker;
    this.worker = this.createWorker();
    return this.worker;
  }

  private rejectAllAndReset(error: Error) {
    this.onRenderError?.({ mode: "final", source: "worker", message: error.message || "Render worker failed" });
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timeoutId);
      pending.reject(error);
    }
    this.pending.clear();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.compatibilityMode = true;
  }

  private async renderOnMainThread(payload: RenderPayload, requestId: number): Promise<RenderResult> {
    const sourceBitmap = await createImageBitmap(payload.sourceCanvas);
    try {
      const response = await runAdjustRender({
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
      } as RenderRequest);
      if (requestId !== this.latestRequestId) {
        response.bitmap.close();
        throw new Error("stale-render");
      }
      return { bitmap: response.bitmap, width: response.width, height: response.height };
    } finally {
      sourceBitmap.close();
    }
  }

  async render(payload: RenderPayload) {
    const requestId = ++this.requestId;
    this.latestRequestId = requestId;

    for (const [id, pending] of this.pending.entries()) {
      if (id < requestId) {
        window.clearTimeout(pending.timeoutId);
        pending.reject(new Error("superseded"));
        this.pending.delete(id);
      }
    }

    const fallbackToMainThread = async (error: unknown): Promise<RenderResult> => {
      const err = error instanceof Error ? error : new Error("Render worker failed");
      const message = err.message || "Render worker failed";
      this.onRenderError?.({ mode: payload.mode, source: "worker", message });
      if (!this.compatibilityMode) this.compatibilityMode = true;
      if (message === "stale-render" || message === "superseded" || message === "invalidated") {
        throw err;
      }
      try {
        return await this.renderOnMainThread(payload, requestId);
      } catch (mainError) {
        const mainErr = mainError instanceof Error ? mainError : new Error("Render failed");
        this.onRenderError?.({ mode: payload.mode, source: "main", message: mainErr.message || "Render failed" });
        throw mainErr;
      }
    };

    const worker = this.ensureWorker();
    if (!worker) {
      try {
        return await this.renderOnMainThread(payload, requestId);
      } catch (mainError) {
        const mainErr = mainError instanceof Error ? mainError : new Error("Render failed");
        this.onRenderError?.({ mode: payload.mode, source: "main", message: mainErr.message || "Render failed" });
        throw mainErr;
      }
    }

    const sourceBitmap = await createImageBitmap(payload.sourceCanvas);

    return new Promise<RenderResult>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("timeout"));
        this.rejectAllAndReset(new Error("Render timeout"));
      }, RENDER_TIMEOUT_MS);

      this.pending.set(requestId, { resolve, reject, timeoutId });

      try {
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
      } catch (error) {
        window.clearTimeout(timeoutId);
        this.pending.delete(requestId);
        sourceBitmap.close();
        this.rejectAllAndReset(error instanceof Error ? error : new Error("Render worker postMessage failed"));
        reject(error);
      }
    }).catch((error) => fallbackToMainThread(error));
  }

  invalidate() {
    this.latestRequestId = this.requestId + 1;
    for (const [id, pending] of this.pending.entries()) {
      window.clearTimeout(pending.timeoutId);
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

  isCompatibilityMode() {
    return this.compatibilityMode;
  }
}
