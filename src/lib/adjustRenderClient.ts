import type { EditorState, LUT3D } from "../tabs/UpscaleTab";

type RenderMode = "preview" | "full";

type RenderRequest = {
  id: number;
  state: EditorState;
  mode: RenderMode;
  lut3d: LUT3D;
};

type RenderResponse = {
  type: "result";
  id: number;
  bitmap: ImageBitmap;
};

export class AdjustRenderClient {
  private worker: Worker;
  private requestId = 0;
  private activeId = 0;
  private pending = new Map<number, (bitmap: ImageBitmap) => void>();

  constructor() {
    this.worker = new Worker(new URL("../workers/adjustWorker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (event: MessageEvent<RenderResponse>) => {
      if (event.data.type !== "result") return;
      if (event.data.id < this.activeId) {
        event.data.bitmap.close();
        return;
      }
      const resolve = this.pending.get(event.data.id);
      if (!resolve) return;
      this.pending.delete(event.data.id);
      resolve(event.data.bitmap);
    };
  }

  async setSource(file: File) {
    const bitmap = await createImageBitmap(file);
    this.worker.postMessage({ type: "setSource", bitmap }, [bitmap]);
  }

  render(state: EditorState, mode: RenderMode, lut3d: LUT3D) {
    const id = ++this.requestId;
    this.activeId = id;
    this.worker.postMessage({ type: "render", id, state, mode, lut3d: lut3d ? { size: lut3d.size, table: lut3d.table } : null });
    return new Promise<ImageBitmap>((resolve) => {
      this.pending.set(id, resolve);
    });
  }

  dispose() {
    this.pending.clear();
    this.worker.terminate();
  }
}
