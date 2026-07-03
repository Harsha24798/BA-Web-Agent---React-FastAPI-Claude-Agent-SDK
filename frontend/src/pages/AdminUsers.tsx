import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPut } from "../lib/api";
import { toast, withToast } from "../lib/toast";
import type { LlmModel, User } from "../lib/types";
import { Layout } from "../components/Layout";
import { Button, Card, Modal } from "../components/ui";

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [models, setModels] = useState<LlmModel[]>([]);
  const [modelUser, setModelUser] = useState<User | null>(null);
  const [grants, setGrants] = useState<string[]>([]);

  async function load() {
    setUsers(await apiGet<User[]>("/users"));
  }
  useEffect(() => {
    load();
    apiGet<LlmModel[]>("/admin/models").then(setModels);
  }, []);

  async function act(path: string, ok: string, body?: any) {
    const r = await withToast(() => apiPost(path, body), { error: "Action failed" });
    if (r) toast.success(r.detail || ok);
    load();
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
              <div key={u.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{u.full_name}</p>
                  <p className="text-xs text-slate-400">{u.email}</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => act(`/users/${u.id}/approve`, "Approved")}>Approve</Button>
                  <Button variant="secondary" onClick={() => act(`/users/${u.id}/reject`, "Rejected")}>Reject</Button>
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
                <th className="py-2">Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {others.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="py-2">{u.full_name}</td>
                  <td className="text-slate-500">{u.email}</td>
                  <td className="capitalize">{u.role}</td>
                  <td className="capitalize">{u.status}</td>
                  <td className="flex flex-wrap gap-1 py-2">
                    {u.status === "active"
                      ? <Button variant="ghost" onClick={() => act(`/users/${u.id}/disable`, "Disabled")}>Disable</Button>
                      : <Button variant="ghost" onClick={() => act(`/users/${u.id}/enable`, "Enabled")}>Enable</Button>}
                    <Button variant="ghost" onClick={() => act(`/users/${u.id}/reset-password`, "Reset link sent")}>Reset PW</Button>
                    <Button variant="ghost" onClick={() =>
                      act(`/users/${u.id}/role`, "Role changed", { role: u.role === "admin" ? "user" : "admin" })}>
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

      <Modal open={!!modelUser} onClose={() => setModelUser(null)} title={`Model access — ${modelUser?.full_name}`}>
        <p className="mb-3 text-sm text-slate-500">
          Leave all unchecked to allow every enabled model. Check specific models to restrict.
        </p>
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
    </Layout>
  );
}
