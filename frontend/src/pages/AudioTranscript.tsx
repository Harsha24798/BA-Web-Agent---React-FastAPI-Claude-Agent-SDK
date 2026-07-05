import { useRef, useState } from "react";
import { FileAudio, Sparkles, UploadCloud, X } from "lucide-react";
import { toast } from "../lib/toast";
import { Layout } from "../components/Layout";
import { Button, Card, Label, Select } from "../components/ui";

const ACCEPT = ".mp3,audio/mpeg";
const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "si", label: "Sinhala" },
];

export default function AudioTranscript() {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("en");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".mp3")) {
      toast.error("Please choose an MP3 audio file.");
      return;
    }
    setFile(f);
  }

  function convert() {
    if (!file) { toast.error("Choose an MP3 file first."); return; }
    toast.success("Coming soon! Audio-to-transcript is under development.");
  }

  return (
    <Layout>
      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-xl font-semibold">Audio → Transcript</h1>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
          Coming soon
        </span>
      </div>
      <p className="mb-5 text-sm text-slate-500">
        Upload a meeting recording (MP3) and we'll convert it into a text transcript you can feed into
        a project. This feature is under development.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upload */}
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Audio file</h2>
          {file ? (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <div className="flex items-center gap-2 overflow-hidden">
                <FileAudio className="h-5 w-5 shrink-0 text-brand-500" />
                <div className="overflow-hidden">
                  <p className="truncate text-sm font-medium text-slate-800">{file.name}</p>
                  <p className="text-xs text-slate-400">{(file.size / (1024 * 1024)).toFixed(1)} MB</p>
                </div>
              </div>
              <button className="text-slate-400 hover:text-red-600" onClick={() => setFile(null)} aria-label="Remove">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition ${
                drag ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}
            >
              <UploadCloud className="h-8 w-8 text-slate-400" />
              <p className="text-sm text-slate-600">Drag & drop an MP3 here, or</p>
              <Button variant="secondary" onClick={() => inputRef.current?.click()}>Choose file</Button>
              <p className="text-xs text-slate-400">MP3 audio only</p>
              <input ref={inputRef} type="file" accept={ACCEPT} className="hidden"
                onChange={(e) => pick(e.target.files)} />
            </div>
          )}
        </Card>

        {/* Convert */}
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Convert</h2>
          <div className="space-y-4">
            <div>
              <Label>Audio language</Label>
              <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>{l.label}</option>
                ))}
              </Select>
            </div>
            <Button onClick={convert} className="w-full">
              <Sparkles className="h-4 w-4" /> Convert to transcript
            </Button>
            <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
              Once ready, the transcript will be produced in the selected language and can be attached
              to a project like any other document.
            </p>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
