export function humanBytes(bytes: number) {
  const u = ["B","KB","MB","GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  const d = i === 0 ? 0 : n < 10 ? 2 : 1;
  return `${n.toFixed(d)} ${u[i]}`;
}

export function safeBaseName(name: string) {
  const base = name.replace(/\.[^.]+$/, "");
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "image";
}
