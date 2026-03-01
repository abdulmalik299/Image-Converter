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
  const postFailure = (error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error));
    const response: RenderErrorResponse = {
      type: "error",
      requestId: request.requestId,
      message: err.message || "Render failed",
      stack: err.stack
    };
    (self as DedicatedWorkerGlobalScope).postMessage(response);
  };

  try {
    const response = await runAdjustRender(request);
    (self as DedicatedWorkerGlobalScope).postMessage(response, [response.bitmap]);
  } catch (error) {
    postFailure(error);
  } finally {
    try {
      request.sourceBitmap.close();
    } catch (closeError) {
      postFailure(closeError);
    }
  }
};
