import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { apiUpload } from "../lib/api";
import { toast } from "../lib/toast";
import { Button, Select } from "./ui";

const CATEGORIES = ["transcript", "invoices", "customer requirement", "other"];
const ACCEPT = ".pdf,.docx,.txt,.md,.xlsx,.csv";

export function FileUpload({ projectId, onUploaded }: { projectId: string; onUploaded: () => void }) {
  const [category, setCategory] = useState("customer requirement");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      await apiUpload(`/projects/${projectId}/documents`, Array.from(files), category);
      toast.success(`Uploaded ${files.length} file(s).`);
      onUploaded();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-500">Category</span>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} className="max-w-xs capitalize">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      </div>
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
        <p className="text-xs text-slate-400">Supported: PDF, DOCX, TXT, MD, XLSX, CSV</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
      </div>
    </div>
  );
}
