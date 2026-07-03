import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/api";
import { withToast } from "../lib/toast";
import type { LlmModel } from "../lib/types";
import { Layout } from "../components/Layout";
import { Button, Card, Input, Label, Modal } from "../components/ui";

const empty = { model_id: "", display_name: "", description: "", is_enabled: true, is_default: false, sort_order: 0 };

export default function AdminModels() {
  const [models, setModels] = useState<LlmModel[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });

  async function load() { setModels(await apiGet<LlmModel[]>("/admin/models")); }
  useEffect(() => { load(); }, []);

  async function toggle(m: LlmModel, field: "is_enabled" | "is_default") {
    await withToast(() => apiPut(`/admin/models/${m.id}`, { ...m, [field]: !m[field] }), { error: "Update failed" });
    load();
  }

  async function add() {
    const r = await withToast(() => apiPost("/admin/models", form), { success: "Model added.", error: "Add failed" });
    if (r) { setOpen(false); setForm({ ...empty }); load(); }
  }

  async function remove(m: LlmModel) {
    if (!confirm(`Remove ${m.display_name}?`)) return;
    await withToast(() => apiDelete(`/admin/models/${m.id}`), { success: "Removed.", error: "Delete failed" });
    load();
  }

  return (
    <Layout>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold">LLM Models</h1>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add model</Button>
      </div>
      <Card className="p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="py-2">Model ID</th><th>Name</th><th>Enabled</th><th>Default</th><th></th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id} className="border-t border-slate-100">
                <td className="py-2 font-mono text-xs">{m.model_id}</td>
                <td>{m.display_name}</td>
                <td><input type="checkbox" checked={m.is_enabled} onChange={() => toggle(m, "is_enabled")} /></td>
                <td><input type="checkbox" checked={m.is_default} onChange={() => toggle(m, "is_default")} /></td>
                <td><button className="text-slate-400 hover:text-red-600" onClick={() => remove(m)}><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add model">
        <div className="space-y-3">
          <div><Label>Model ID</Label><Input value={form.model_id} onChange={(e) => setForm({ ...form, model_id: e.target.value })} placeholder="claude-..." /></div>
          <div><Label>Display name</Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
          <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={add}>Add</Button></div>
        </div>
      </Modal>
    </Layout>
  );
}
