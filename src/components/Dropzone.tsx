import { useMemo, useState } from "react";

export function Dropzone(props: {
  accept: string[];
  multiple?: boolean;
  label: string;
  helper?: string;
  onFiles: (files: File[]) => void;
}) {
  const { accept, multiple = true, onFiles, label, helper } = props;
  const [over, setOver] = useState(false);
  const acceptAttr = useMemo(() => accept.join(","), [accept]);

  return (
    <div
      className={[
        "rounded-2xl border border-dashed p-5 transition",
        over ? "border-sky-300 bg-sky-50" : "border-slate-300 bg-slate-50/70"
      ].join(" ")}
      onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const list = Array.from(e.dataTransfer.files || []);
        if (list.length) onFiles(list);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") (document.getElementById("file-input") as HTMLInputElement | null)?.click();
      }}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-slate-800">{label}</div>
          <div className="text-xs text-slate-600">
            {helper ?? "Drag & drop files here, or click to choose from your device."}
          </div>
          <div className="text-[11px] text-slate-500">Accepted: {accept.join(", ")}{multiple ? " • Multiple files supported" : ""}</div>
        </div>

        <label className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">
          Choose files
          <input
            id="file-input"
            type="file"
            className="hidden"
            accept={acceptAttr}
            multiple={multiple}
            onChange={(e) => {
              const list = e.target.files ? Array.from(e.target.files) : [];
              if (list.length) onFiles(list);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}
