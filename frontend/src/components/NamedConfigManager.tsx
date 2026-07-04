import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, PlayCircle, Plus, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/api";
import { toast, withToast } from "../lib/toast";
import type { NamedConfig } from "../lib/types";
import { Button, Card, Input, Label, Modal } from "./ui";
import { MarkdownEditor } from "./MarkdownEditor";

/** Named-library manager for a config (master prompt / SRS template). */
export function NamedConfigManager({ endpoint, help, noun }: { endpoint: string; help: string; noun: string }) {
  const [items, setItems] = useState<NamedConfig[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<NamedConfig | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load(selectId?: string | null) {
    const data = await apiGet<{ active: NamedConfig | null; items: NamedConfig[] }>(endpoint);
    setItems(data.items);
    const pick = selectId !== undefined ? selectId : (selectedId ?? data.active?.id ?? data.items[0]?.id ?? null);
    const found = data.items.find((i) => i.id === pick) || data.active || data.items[0] || null;
    if (found) { setSelectedId(found.id); setName(found.name); setContent(found.content); }
    else { setSelectedId(null); setName(""); setContent(""); }
  }
  useEffect(() => { load(); }, [endpoint]);

  function selectItem(it: NamedConfig) {
    setSelectedId(it.id); setName(it.name); setContent(it.content);
  }

  function startNew() {
    setSelectedId(null); setName(""); setContent("");
  }

  async function save() {
    if (!name.trim()) { toast.error("Give it a name first."); return; }
    setBusy(true);
    const req = selectedId
      ? apiPut(`${endpoint}/${selectedId}`, { name, content })
      : apiPost(endpoint, { name, content });
    const r = await withToast(() => req, { success: "Saved.", error: "Save failed" });
    setBusy(false);
    if (r) await load(r.id);
  }

  async function saveAs() {
    if (!name.trim()) { toast.error("Give it a name first."); return; }
    setBusy(true);
    const r = await withToast(() => apiPost(endpoint, { name, content }), { success: "Saved as new.", error: "Save failed" });
    setBusy(false);
    if (r) await load(r.id);
  }

  async function activate(it: NamedConfig) {
    const r = await withToast(() => apiPost(`${endpoint}/${it.id}/activate`), { success: `Activated "${it.name}".`, error: "Activate failed" });
    if (r) load(it.id);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const it = deleteTarget;
    const r = await withToast(() => apiDelete(`${endpoint}/${it.id}`), { success: "Deleted.", error: "Delete failed" });
    setDeleting(false);
    if (r) {
      setDeleteTarget(null);
      load(selectedId === it.id ? null : selectedId);
    }
  }

  function importMd(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setContent(String(reader.result || ""));
      if (!name.trim()) setName(file.name.replace(/\.(md|markdown|txt)$/i, ""));
      toast.success(`Imported ${file.name}.`);
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <Label>{noun} name</Label>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. Odoo ${noun}`} className="max-w-sm" />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" /> Import .md</Button>
          <input ref={fileRef} type="file" accept=".md,.markdown,.txt" className="hidden"
            onChange={(e) => importMd(e.target.files?.[0])} />
        </div>
        <p className="mb-3 text-sm text-slate-500">{help}</p>
        <MarkdownEditor value={content} onChange={setContent} />
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={startNew}><Plus className="h-4 w-4" /> New</Button>
          <Button variant="secondary" onClick={saveAs} disabled={busy}>Save as new</Button>
          <Button onClick={save} disabled={busy}>{selectedId ? "Save" : "Create"}</Button>
        </div>
      </Card>

      <Card className="h-fit p-5">
        <h3 className="mb-3 text-sm font-semibold">Saved {noun.toLowerCase()}s</h3>
        <div className="space-y-2">
          {items.length === 0 && <p className="text-sm text-slate-400">None yet.</p>}
          {items.map((it) => (
            <div key={it.id}
              className={`rounded-lg border px-3 py-2.5 transition ${
                selectedId === it.id ? "border-brand-300 bg-brand-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}>
              <div className="flex items-center justify-between gap-2">
                <button className="text-left text-sm font-medium text-slate-800" onClick={() => selectItem(it)}>
                  {it.name}
                </button>
                {it.is_active && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Active
                  </span>
                )}
              </div>
              {!it.is_active && (
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={() => activate(it)}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 transition hover:bg-brand-100"
                  >
                    <PlayCircle className="h-3.5 w-3.5" /> Activate
                  </button>
                  <button
                    onClick={() => setDeleteTarget(it)}
                    className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete this item?">
        <div className="flex gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <p className="text-sm text-slate-600">
            Delete <span className="font-semibold text-slate-800">"{deleteTarget?.name}"</span>?
            This cannot be undone.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
