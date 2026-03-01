import { runAdjustRender, type RenderRequest } from "../lib/adjustRenderPipeline";

type RenderErrorResponse = {
  type: "error";
  requestId: number;
  message: string;
  stack?: string;
};

self.onmessage = async (event: MessageEvent<RenderRequest>) => {
  if (event.data.type !== "render") return;
  const request = event.data;
  try {
    const response = await runAdjustRender(request);
    (self as DedicatedWorkerGlobalScope).postMessage(response, [response.bitmap]);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    const response: RenderErrorResponse = {
      type: "error",
      requestId: request.requestId,
      message: err.message || "Render failed",
      stack: err.stack
    };
    (self as DedicatedWorkerGlobalScope).postMessage(response);
  } finally {
    request.sourceBitmap.close();
  }
};
