import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { apiUpload } from "../lib/api";
import { toast } from "../lib/toast";
import { Button } from "./ui";

const ACCEPT = ".pdf,.docx,.txt,.md,.xlsx,.csv";

export function FileUpload({ projectId, onUploaded }: { projectId: string; onUploaded: () => void }) {
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      await apiUpload(`/projects/${projectId}/documents`, Array.from(files), "other");
      toast.success(`Uploaded ${files.length} file${files.length > 1 ? "s" : ""}.`);
      onUploaded();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition ${
        drag ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50"
      }`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
    >
      <UploadCloud className="h-8 w-8 text-slate-400" />
      <p className="text-sm text-slate-600">Drag & drop files here, or</p>
      <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy}>
        {busy ? "Uploading…" : "Choose files"}
      </Button>
      <p className="text-xs text-slate-400">Multiple files supported · PDF, DOCX, TXT, MD, XLSX, CSV</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
    </div>
  );
}
