import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { apiGet, apiPost } from "../lib/api";
import { fmtDateTime } from "../lib/datetime";
import { toast } from "../lib/toast";
import type { Project, RegenRequestItem } from "../lib/types";
import { Layout } from "../components/Layout";
import { Button, Card, Select, Spinner } from "../components/ui";

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  used: "bg-slate-100 text-slate-500",
};

export default function AdminRequests() {
  const [requests, setRequests] = useState<RegenRequestItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setLoaded(false);
    const qs = new URLSearchParams();
    if (projectId) qs.set("project_id", projectId);
    if (statusFilter) qs.set("status_filter", statusFilter);
    try {
      setRequests(await apiGet<RegenRequestItem[]>(`/admin/regen-requests?${qs.toString()}`));
    } catch (e: any) {
      toast.error(e.message || "Failed to load requests");
      setRequests([]);
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => { load(); }, [projectId, statusFilter]);
  useEffect(() => { apiGet<Project[]>("/projects").then(setProjects).catch(() => {}); }, []);

  async function decide(id: string, action: "approve" | "reject") {
    setBusy(id + action);
    try {
      const r = await apiPost(`/admin/regen-requests/${id}/${action}`);
      toast.success(r?.detail || "Done");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Layout>
      <h1 className="mb-5 text-xl font-semibold">Regenerate access requests</h1>
      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="max-w-xs">
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="max-w-[180px]">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="used">Used</option>
            <option value="">All statuses</option>
          </Select>
        </div>

        {!loaded ? (
          <div className="flex items-center gap-2 p-4 text-slate-500"><Spinner /> Loading…</div>
        ) : requests.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-400">No requests match this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400">
                  <th className="py-2">User</th><th>Project</th><th>Requested</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 transition hover:bg-slate-50">
                    <td className="py-2 font-medium text-slate-800">{r.user_name}</td>
                    <td className="text-slate-600">{r.project_name}</td>
                    <td className="text-xs text-slate-400">{fmtDateTime(r.created_at)}</td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[r.status] || ""}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2">
                      {r.status === "pending" && (
                        <span className="flex items-center gap-2">
                          <Button variant="secondary" className="px-2.5 py-1 text-xs" disabled={busy !== null}
                            onClick={() => decide(r.id, "approve")}>
                            {busy === r.id + "approve" ? <Spinner /> : <Check className="h-3.5 w-3.5 text-green-600" />} Approve
                          </Button>
                          <Button variant="secondary" className="px-2.5 py-1 text-xs" disabled={busy !== null}
                            onClick={() => decide(r.id, "reject")}>
                            {busy === r.id + "reject" ? <Spinner /> : <X className="h-3.5 w-3.5 text-red-600" />} Reject
                          </Button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Layout>
  );
}
