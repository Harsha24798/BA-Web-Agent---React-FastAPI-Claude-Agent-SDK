import { useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost, apiPut } from "../lib/api";
import { toast, withToast } from "../lib/toast";
import type { LlmModel, User } from "../lib/types";
import { Layout } from "../components/Layout";
import { Button, Card, Input, Label, Modal, Spinner, Toggle } from "../components/ui";

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800",
    disabled: "bg-red-100 text-red-700",
    pending: "bg-amber-100 text-amber-800",
    rejected: "bg-slate-100 text-slate-500",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status] || styles.rejected}`}>{status}</span>;
}

function extractLink(detail: string): { message: string; link: string | null } {
  const idx = detail.indexOf("Link:");
  if (idx === -1) return { message: detail, link: null };
  return { message: detail.slice(0, idx).trim(), link: detail.slice(idx + 5).trim() };
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [models, setModels] = useState<LlmModel[]>([]);
  const [busy, setBusy] = useState<string | null>(null); // action key in-flight
  const [modelUser, setModelUser] = useState<User | null>(null);
  const [grants, setGrants] = useState<string[]>([]);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", email: "", password: "" });
  const [linkDialog, setLinkDialog] = useState<string | null>(null);

  async function load() { setUsers(await apiGet<User[]>("/users")); }
  useEffect(() => {
    load();
    apiGet<LlmModel[]>("/admin/models").then(setModels);
  }, []);

  async function act(key: string, path: string, ok: string, body?: any) {
    setBusy(key);
    try {
      const r = await apiPost(path, body);
      const { message, link } = extractLink(r?.detail || ok);
      toast.success(message || ok);
      if (link) setLinkDialog(link);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleActive(u: User) {
    const enabling = u.status !== "active";
    await act(`toggle:${u.id}`, `/users/${u.id}/${enabling ? "enable" : "disable"}`,
      enabling ? "Enabled" : "Disabled");
  }

  async function openModels(u: User) {
    setModelUser(u);
    setGrants(await apiGet<string[]>(`/users/${u.id}/models`));
  }

  async function saveModels() {
    if (!modelUser) return;
    await withToast(() => apiPut(`/users/${modelUser.id}/models`, { model_ids: grants }), {
      success: "Model access updated.", error: "Save failed",
    });
    setModelUser(null);
  }

  function openEdit(u: User) {
    setEditForm({ full_name: u.full_name, email: u.email, password: "" });
    setEditUser(u);
  }

  async function saveEdit() {
    if (!editUser) return;
    const body: any = { full_name: editForm.full_name, email: editForm.email };
    if (editForm.password) body.password = editForm.password;
    const r = await withToast(() => apiPatch(`/users/${editUser.id}`, body), {
      success: "User updated.", error: "Update failed",
    });
    if (r) { setEditUser(null); load(); }
  }

  const pending = users.filter((u) => u.status === "pending");
  const others = users.filter((u) => u.status !== "pending");

  return (
    <Layout>
      <h1 className="mb-5 text-xl font-semibold">Users</h1>

      <Card className="mb-6 p-5">
        <h2 className="mb-3 font-semibold">Pending approval ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">No pending requests.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 transition hover:bg-slate-50">
                <div>
                  <p className="text-sm font-medium">{u.full_name}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </div>
                <div className="flex gap-2">
                  <Button disabled={busy !== null} onClick={() => act(`approve:${u.id}`, `/users/${u.id}/approve`, "Approved")}>
                    {busy === `approve:${u.id}` ? <Spinner /> : "Approve"}
                  </Button>
                  <Button variant="secondary" disabled={busy !== null} onClick={() => act(`reject:${u.id}`, `/users/${u.id}/reject`, "Rejected")}>
                    {busy === `reject:${u.id}` ? <Spinner /> : "Reject"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">All users</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="py-2">Name</th><th>Email</th><th>Role</th><th>Status</th><th>Active</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {others.map((u) => (
                <tr key={u.id} className="border-t border-slate-100 transition hover:bg-slate-50">
                  <td className="py-2">{u.full_name}</td>
                  <td className="text-slate-500">{u.email}</td>
                  <td className="capitalize">{u.role}</td>
                  <td><StatusPill status={u.status} /></td>
                  <td>
                    <Toggle checked={u.status === "active"} disabled={busy !== null} onChange={() => toggleActive(u)} />
                  </td>
                  <td className="flex flex-wrap items-center gap-1 py-2">
                    <Button variant="ghost" onClick={() => openEdit(u)}>Edit</Button>
                    <Button variant="ghost" disabled={busy !== null}
                      onClick={() => act(`reset:${u.id}`, `/users/${u.id}/reset-password`, "Reset link sent")}>
                      {busy === `reset:${u.id}` ? <Spinner /> : "Reset PW"}
                    </Button>
                    <Button variant="ghost" disabled={busy !== null}
                      onClick={() => act(`role:${u.id}`, `/users/${u.id}/role`, "Role changed", { role: u.role === "admin" ? "user" : "admin" })}>
                      {u.role === "admin" ? "→ user" : "→ admin"}
                    </Button>
                    <Button variant="ghost" onClick={() => openModels(u)}>Models</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Model access modal */}
      <Modal open={!!modelUser} onClose={() => setModelUser(null)} title={`Model access — ${modelUser?.full_name}`}>
        <p className="mb-3 text-sm text-slate-500">
          Select the models this user may use. If none are selected, the user can use every enabled
          model. Selecting one or more restricts them to only those.
        </p>
        {models.length === 0 && <p className="text-sm text-slate-400">No models exist yet. Add some on the Models page.</p>}
        <div className="space-y-2">
          {models.map((m) => (
            <label key={m.model_id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={grants.includes(m.model_id)}
                onChange={(e) =>
                  setGrants((g) => e.target.checked ? [...g, m.model_id] : g.filter((x) => x !== m.model_id))
                }
              />
              {m.display_name} <span className="text-xs text-slate-400">{m.model_id}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModelUser(null)}>Cancel</Button>
          <Button onClick={saveModels}>Save</Button>
        </div>
      </Modal>

      {/* Edit user modal */}
      <Modal open={!!editUser} onClose={() => setEditUser(null)} title={`Edit user — ${editUser?.full_name}`}>
        <div className="space-y-3">
          <div><Label>Full name</Label><Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} /></div>
          <div><Label>Email</Label><Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></div>
          <div>
            <Label>New password (optional)</Label>
            <Input type="password" value={editForm.password} placeholder="Leave blank to keep current"
              onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Copy-link dialog (shown when SMTP is off and a link is returned) */}
      <Modal open={!!linkDialog} onClose={() => setLinkDialog(null)} title="Set-password link">
        <p className="mb-2 text-sm text-slate-500">
          Email isn't configured, so share this single-use link with the user directly:
        </p>
        <div className="flex gap-2">
          <Input readOnly value={linkDialog || ""} onFocus={(e) => e.currentTarget.select()} />
          <Button onClick={() => { navigator.clipboard.writeText(linkDialog || ""); toast.success("Copied."); }}>Copy</Button>
        </div>
      </Modal>
    </Layout>
  );
}
