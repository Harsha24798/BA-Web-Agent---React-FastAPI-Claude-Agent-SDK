import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/api";
import { withToast } from "../lib/toast";
import type { LlmModel } from "../lib/types";
import { Layout } from "../components/Layout";
import { Button, Card, ConfirmDialog, Input, Label, Modal, Toggle } from "../components/ui";

const empty = { model_id: "", display_name: "", description: "", is_enabled: true, is_default: false, sort_order: 0 };

export default function AdminModels() {
  const [models, setModels] = useState<LlmModel[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LlmModel | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<LlmModel | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setModels(await apiGet<LlmModel[]>("/admin/models"));
    setLoaded(true);
  }
  useEffect(() => { load(); }, []);

  async function patch(m: LlmModel, changes: Partial<LlmModel>) {
    await withToast(() => apiPut(`/admin/models/${m.id}`, { ...m, ...changes }), { error: "Update failed" });
    load();
  }

  function openAdd() { setEditing(null); setForm({ ...empty }); setOpen(true); }
  function openEdit(m: LlmModel) {
    setEditing(m);
    setForm({ model_id: m.model_id, display_name: m.display_name, description: m.description,
      is_enabled: m.is_enabled, is_default: m.is_default, sort_order: m.sort_order });
    setOpen(true);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    const req = editing
      ? apiPut(`/admin/models/${editing.id}`, form)
      : apiPost("/admin/models", form);
    const r = await withToast(() => req, { success: editing ? "Model updated." : "Model added.", error: "Save failed" });
    setSaving(false);
    if (r) { setOpen(false); load(); }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const r = await withToast(() => apiDelete(`/admin/models/${toDelete.id}`), { success: "Model removed.", error: "Delete failed" });
    setDeleting(false);
    if (r) { setToDelete(null); load(); }
  }

  return (
    <Layout>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold">LLM Models</h1>
        <Button onClick={openAdd}><Plus className="h-4 w-4" /> Add model</Button>
      </div>
      {loaded && models.length === 0 && (
        <Card className="mb-4 p-4 text-sm text-slate-500">
          No models yet. Add at least one so users can generate SRS documents.
        </Card>
      )}
      <Card className="p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="py-2">Model ID</th><th>Name</th><th>Enabled</th><th>Default</th><th></th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id} className="border-t border-slate-100 transition hover:bg-slate-50">
                <td className="py-2 font-mono text-xs">{m.model_id}</td>
                <td>{m.display_name}</td>
                <td><Toggle checked={m.is_enabled} onChange={(v) => patch(m, { is_enabled: v })} /></td>
                <td><Toggle checked={m.is_default} onChange={(v) => patch(m, { is_default: v })} /></td>
                <td className="flex gap-2 py-2">
                  <button className="text-slate-400 hover:text-brand-600" onClick={() => openEdit(m)}><Pencil className="h-4 w-4" /></button>
                  <button className="text-slate-400 hover:text-red-600" onClick={() => setToDelete(m)}><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit model" : "Add model"}>
        <div className="space-y-3">
          <div><Label>Model ID</Label><Input value={form.model_id} disabled={!!editing}
            onChange={(e) => setForm({ ...form, model_id: e.target.value })} placeholder="claude-..." /></div>
          <div><Label>Display name</Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
          <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2 text-sm"><Toggle checked={form.is_enabled} onChange={(v) => setForm({ ...form, is_enabled: v })} /> Enabled</span>
            <span className="flex items-center gap-2 text-sm"><Toggle checked={form.is_default} onChange={(v) => setForm({ ...form, is_default: v })} /> Default</span>
          </div>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{editing ? "Save" : "Add"}</Button></div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this model?"
        message={<>Remove <span className="font-semibold text-slate-800">{toDelete?.display_name}</span> from the model list? This cannot be undone.</>}
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </Layout>
  );
}
