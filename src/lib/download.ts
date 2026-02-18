import JSZip from "jszip";

export function downloadBlob(blob: Blob, fileName: string) {
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadZip(files: { name: string; blob: Blob }[], zipName: string) {
  const zip = new JSZip();
  for (const f of files) zip.file(f.name, f.blob);
  const out = await zip.generateAsync({ type: "blob" });
  downloadBlob(out, zipName);
}
