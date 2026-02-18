export async function fileToBitmap(file: File): Promise<ImageBitmap> {
  const buf = await file.arrayBuffer();
  const blob = new Blob([buf], { type: file.type || "application/octet-stream" });
  return await createImageBitmap(blob);
}

export function fitWithin(w: number, h: number, maxW: number, maxH: number) {
  const scale = Math.min(1, maxW / w, maxH / h);
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
    scale
  };
}
