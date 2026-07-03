import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/api";
import { withToast } from "../lib/toast";
import type { AgentTool } from "../lib/types";
import { Layout } from "../components/Layout";
import { Button, Card, Input, Label, Modal } from "../components/ui";

const empty = { tool_key: "", display_name: "", description: "", is_enabled: true, sort_order: 0 };

export default function AdminTools() {
  const [tools, setTools] = useState<AgentTool[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...empty });

  async function load() { setTools(await apiGet<AgentTool[]>("/admin/tools")); }
  useEffect(() => { load(); }, []);

  async function toggle(t: AgentTool) {
    await withToast(() => apiPut(`/admin/tools/${t.id}`, { is_enabled: !t.is_enabled }), { error: "Update failed" });
    load();
  }

  async function add() {
    const r = await withToast(() => apiPost("/admin/tools", form), { success: "Tool added.", error: "Add failed" });
    if (r) { setOpen(false); setForm({ ...empty }); load(); }
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
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add tool</Button>
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
              <tr key={t.id} className="border-t border-slate-100">
                <td className="py-2 font-mono text-xs">{t.tool_key}</td>
                <td>{t.display_name}</td>
                <td className="text-slate-500">{t.description}</td>
                <td><input type="checkbox" checked={t.is_enabled} onChange={() => toggle(t)} /></td>
                <td><button className="text-slate-400 hover:text-red-600" onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Add tool">
        <div className="space-y-3">
          <div><Label>Tool key</Label><Input value={form.tool_key} onChange={(e) => setForm({ ...form, tool_key: e.target.value })} placeholder="Read / Glob / mcp__..." /></div>
          <div><Label>Display name</Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
          <div><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={add}>Add</Button></div>
        </div>
      </Modal>
    </Layout>
  );
}
