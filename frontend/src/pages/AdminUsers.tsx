import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { toast, withToast } from "../lib/toast";
import type { LlmModel, McpServer, User } from "../lib/types";
import { Layout } from "../components/Layout";
import { Button, Card, ConfirmDialog, Input, Label, Modal, Spinner, Toggle } from "../components/ui";

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-800",
    disabled: "bg-red-100 text-red-700",
    pending: "bg-amber-100 text-amber-800",
    rejected: "bg-slate-100 text-slate-500",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status] || styles.rejected}`}>{status}</span>;
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
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [mcpUser, setMcpUser] = useState<User | null>(null);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpGrants, setMcpGrants] = useState<string[]>([]);
  const { user: me } = useAuth();

  // Only enabled models can be granted — disabled ones are hidden from the access picker.
  const enabledModels = models.filter((m) => m.is_enabled);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const r = await withToast(() => apiDelete(`/users/${toDelete.id}`), {
      success: "User deleted.", error: "Delete failed",
    });
    setDeleting(false);
    if (r) { setToDelete(null); load(); }
  }

  async function load() { setUsers(await apiGet<User[]>("/users")); }
  useEffect(() => {
    load();
    apiGet<LlmModel[]>("/admin/models").then(setModels);
  }, []);

  async function act(key: string, path: string, ok: string, body?: any) {
    setBusy(key);
    try {
      const r = await apiPost(path, body);
      toast.success(r?.detail || ok);
      if (r?.link) setLinkDialog(r.link); // shown only when SMTP is off (backend returns it then)
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
    if (!modelUser || saving) return;
    setSaving(true);
    const r = await withToast(() => apiPut(`/users/${modelUser.id}/models`, { model_ids: grants }), {
      success: "Model access updated.", error: "Save failed",
    });
    setSaving(false);
    if (r) setModelUser(null);
  }

  async function openMcp(u: User) {
    setMcpUser(u);
    const [srv, grants] = await Promise.all([
      apiGet<McpServer[]>("/admin/settings/mcp"),
      apiGet<string[]>(`/users/${u.id}/mcp-tools`),
    ]);
    setMcpServers(srv.filter((s) => s.is_enabled));
    setMcpGrants(grants);
  }

  async function saveMcp() {
    if (!mcpUser || saving) return;
    setSaving(true);
    const r = await withToast(() => apiPut(`/users/${mcpUser.id}/mcp-tools`, { tool_refs: mcpGrants }), {
      success: "MCP tool access updated.", error: "Save failed",
    });
    setSaving(false);
    if (r) setMcpUser(null);
  }

  function openEdit(u: User) {
    setEditForm({ full_name: u.full_name, email: u.email, password: "" });
    setEditUser(u);
  }

  async function saveEdit() {
    if (!editUser || saving) return;
    setSaving(true);
    const body: any = { full_name: editForm.full_name, email: editForm.email };
    if (editForm.password) body.password = editForm.password;
    const r = await withToast(() => apiPatch(`/users/${editUser.id}`, body), {
      success: "User updated.", error: "Update failed",
    });
    setSaving(false);
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
                    <Button variant="ghost" onClick={() => openMcp(u)}>MCP</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Model access modal */}
      <Modal open={!!modelUser} onClose={() => setModelUser(null)} title={`Model access — ${modelUser?.full_name}`}>
        <p className="mb-4 text-sm text-slate-500">
          Choose which models this user can generate with. Leave everything unchecked to give access
          to <span className="font-medium text-slate-600">all enabled models</span>; tick specific
          ones to restrict them to just those.
        </p>
        {enabledModels.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-400">
            No enabled models yet. Enable some on the Models page first.
          </p>
        ) : (
          <div className="space-y-2">
            {enabledModels.map((m) => {
              const checked = grants.includes(m.model_id);
              return (
                <label
                  key={m.model_id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition ${
                    checked
                      ? "border-brand-300 bg-brand-50 ring-1 ring-brand-200"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand-500"
                    checked={checked}
                    onChange={(e) =>
                      setGrants((g) => e.target.checked ? [...g, m.model_id] : g.filter((x) => x !== m.model_id))
                    }
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">{m.display_name}</p>
                    <p className="truncate font-mono text-xs text-slate-400">{m.model_id}</p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
        <div className="mt-3 text-xs text-slate-400">
          {grants.length === 0
            ? "Access: all enabled models"
            : `Access restricted to ${grants.length} model${grants.length > 1 ? "s" : ""}`}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setModelUser(null)}>Cancel</Button>
          <Button onClick={saveModels} disabled={saving}>Save</Button>
        </div>
      </Modal>

      {/* MCP tool access modal */}
      <Modal open={!!mcpUser} onClose={() => setMcpUser(null)} title={`MCP access — ${mcpUser?.full_name}`}>
        <p className="mb-4 text-sm text-slate-500">
          Grant this user specific MCP tools. Nothing is granted by default — tick the tools they may use.
        </p>
        {mcpServers.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-400">
            No enabled MCP servers. Add and connect one under Settings first.
          </p>
        ) : (
          <div className="space-y-4">
            {mcpServers.map((srv) => {
              const enabledTools = srv.tools.filter((t) => t.is_enabled);
              const refs = enabledTools.map((t) => `mcp__${srv.slug}__${t.name}`);
              const allChecked = refs.length > 0 && refs.every((r) => mcpGrants.includes(r));
              const someChecked = refs.some((r) => mcpGrants.includes(r));
              const toggleAll = (on: boolean) => setMcpGrants((g) => {
                const set = new Set(g);
                refs.forEach((r) => (on ? set.add(r) : set.delete(r)));
                return [...set];
              });
              return (
              <div key={srv.id}>
                <p className="mb-1 text-sm font-semibold text-slate-700">{srv.name}</p>
                {enabledTools.length === 0 ? (
                  <p className="pl-1 text-xs text-slate-400">
                    {srv.tools.length === 0
                      ? "No tools discovered — run a connection test in Settings."
                      : "No enabled tools — enable some in Settings → MCP → View tools."}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2.5 transition hover:bg-slate-100">
                      <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={allChecked}
                        ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                        onChange={(e) => toggleAll(e.target.checked)} />
                      <p className="text-sm font-medium text-slate-700">
                        All <span className="text-xs font-normal text-slate-400">({enabledTools.length})</span>
                      </p>
                    </label>
                    {enabledTools.map((t) => {
                      const ref = `mcp__${srv.slug}__${t.name}`;
                      const checked = mcpGrants.includes(ref);
                      return (
                        <label key={ref}
                          className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition ${
                            checked ? "border-brand-300 bg-brand-50 ring-1 ring-brand-200" : "border-slate-200 hover:bg-slate-50"
                          }`}>
                          <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={checked}
                            onChange={(e) => setMcpGrants((g) => e.target.checked ? [...g, ref] : g.filter((x) => x !== ref))} />
                          <div className="min-w-0">
                            <p className="truncate font-mono text-sm text-slate-800">{t.name}</p>
                            {t.description && <p className="truncate text-xs text-slate-400">{t.description}</p>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 text-xs text-slate-400">
          {mcpGrants.length === 0 ? "No MCP tools granted" : `${mcpGrants.length} tool${mcpGrants.length > 1 ? "s" : ""} granted`}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setMcpUser(null)}>Cancel</Button>
          <Button onClick={saveMcp} disabled={saving}>Save</Button>
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
          <div className="flex items-center justify-between gap-2 pt-1">
            {editUser && editUser.id !== me?.id ? (
              <Button variant="danger" onClick={() => { const u = editUser; setEditUser(null); setToDelete(u); }}>
                Delete user
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={saving}>Save</Button>
            </div>
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

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this user?"
        message={<>Delete <span className="font-semibold text-slate-800">{toDelete?.full_name}</span> ({toDelete?.email})? Any projects, documents and SRS versions they created are kept and reassigned to you. This cannot be undone.</>}
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </Layout>
  );
}
