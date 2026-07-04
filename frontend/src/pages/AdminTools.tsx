import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/api";
import { withToast } from "../lib/toast";
import type { AgentTool } from "../lib/types";
import { Layout } from "../components/Layout";
import { Button, Card, Input, Label, Modal, Toggle } from "../components/ui";

const empty = { tool_key: "", display_name: "", description: "", is_enabled: true, sort_order: 0 };

export default function AdminTools() {
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AgentTool | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [saving, setSaving] = useState(false);

  async function load() { setTools(await apiGet<AgentTool[]>("/admin/tools")); }
  useEffect(() => { load(); }, []);

  async function toggle(t: AgentTool, v: boolean) {
    await withToast(() => apiPut(`/admin/tools/${t.id}`, { is_enabled: v }), { error: "Update failed" });
    load();
  }

  function openAdd() { setEditing(null); setForm({ ...empty }); setOpen(true); }
  function openEdit(t: AgentTool) {
    setEditing(t);
    setForm({ tool_key: t.tool_key, display_name: t.display_name, description: t.description,
      is_enabled: t.is_enabled, sort_order: t.sort_order });
    setOpen(true);
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    const req = editing
      ? apiPut(`/admin/tools/${editing.id}`, {
          display_name: form.display_name, description: form.description,
          is_enabled: form.is_enabled, sort_order: form.sort_order })
      : apiPost("/admin/tools", form);
    const r = await withToast(() => req, { success: editing ? "Tool updated." : "Tool added.", error: "Save failed" });
    setSaving(false);
    if (r) { setOpen(false); load(); }
  }

  async function remove(t: AgentTool) {
    if (!confirm(`Remove ${t.display_name}?`)) return;
    await withToast(() => apiDelete(`/admin/tools/${t.id}`), { success: "Removed.", error: "Delete failed" });
    load();
  }

  return (
    <Layout>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tools Access</h1>
        <Button onClick={openAdd}><Plus className="h-4 w-4" /> Add tool</Button>
      </div>
      <p className="mb-4 text-sm text-slate-500">
        Enabled tools are passed to the agent as its allowed tools. At least one read tool
        (Read/Glob/Grep) must stay enabled.
      </p>
      <Card className="p-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="py-2">Tool key</th><th>Name</th><th>Description</th><th>Enabled</th><th></th>
            </tr>
          </thead>
          <tbody>
            {tools.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 transition hover:bg-slate-50">
                <td className="py-2 font-mono text-xs">{t.tool_key}</td>
                <td>{t.display_name}</td>
                <td className="text-slate-500">{t.description}</td>
                <td><Toggle checked={t.is_enabled} onChange={(v) => toggle(t, v)} /></td>
                <td className="flex gap-2 py-2">
                  <button className="text-slate-400 hover:text-brand-600" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></button>
                  <button className="text-slate-400 hover:text-red-600" onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit tool" : "Add tool"}>
        <div className="space-y-3">
          <div><Label>Tool key</Label><Input value={form.tool_key} disabled={!!editing}
            onChange={(e) => setForm({ ...form, tool_key: e.target.value })} placeholder="Read / Glob / mcp__..." /></div>
          <div><Label>Display name</Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
          <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <span className="flex items-center gap-2 text-sm"><Toggle checked={form.is_enabled} onChange={(v) => setForm({ ...form, is_enabled: v })} /> Enabled</span>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{editing ? "Save" : "Add"}</Button></div>
        </div>
      </Modal>
    </Layout>
  );
}
