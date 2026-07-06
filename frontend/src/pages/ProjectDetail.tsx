import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Download, FileText, Trash2, Sparkles, RefreshCw } from "lucide-react";
import { apiDelete, apiGet, apiPost, downloadFile } from "../lib/api";
import { toast, withToast } from "../lib/toast";
import type { DocumentItem, Job, ProjectDetail as PD, RunSummary } from "../lib/types";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { Button, Card, Modal, Spinner } from "../components/ui";
import { HostBadge, StatusBadge, UploadBadge } from "../components/StatusBadge";
import { FileUpload } from "../components/FileUpload";
import { ModelSelect } from "../components/ModelSelect";
import { GenerationProgress } from "../components/GenerationProgress";
import { RunSummaryCard } from "../components/RunSummaryCard";
import { HostSyncPanel } from "../components/HostSyncPanel";

export default function ProjectDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  const [project, setProject] = useState<PD | null>(null);
  const [model, setModel] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [docToDelete, setDocToDelete] = useState<DocumentItem | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [report, setReport] = useState<RunSummary | null>(null);

  async function load() {
    try {
      const p = await apiGet<PD>(`/projects/${id}`);
      setProject(p);
      // Adopt a server-side active job; otherwise keep whatever terminal we're already showing.
      setJobId((cur) => p.active_job_id ?? cur);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  useEffect(() => { load(); }, [id]);

  // Load the saved run report for the current version (shown when no live terminal is up).
  useEffect(() => {
    const v = project?.current_version_no;
    if (!project || v == null) { setReport(null); return; }
    apiGet<{ summary: RunSummary | null }>(`/projects/${id}/versions/${v}/report`)
      .then((r) => setReport(r.summary))
      .catch(() => setReport(null));
  }, [id, project?.current_version_no]);

  if (!project) {
    return <Layout><div className="flex items-center gap-2 text-slate-500"><Spinner /> Loading…</div></Layout>;
  }

  const hasVersion = project.current_version_no != null;
  const canGenerate = !hasVersion && !jobId;
  const canRegenerate = isAdmin && hasVersion && !jobId;

  async function startGeneration(regen: boolean) {
    if (!model) { toast.error("Select a model first"); return; }
    setStarting(true);
    const path = regen ? `/projects/${id}/regenerate` : `/projects/${id}/generate`;
    // No `error` prefix — the server returns a clear, user-facing message (e.g. "API key not
    // connected. Please contact your administrator.") which we surface verbatim.
    const job = await withToast(() => apiPost<Job>(path, { model_id: model }), {
      success: "Generation started…",
    });
    setStarting(false);
    if (job) { setJobId(job.id); }
  }

  async function onDone(status: string) {
    if (status === "completed") toast.success("SRS generated successfully.");
    // Reload for downloads/host-sync, but keep the finished terminal + summary visible until dismissed.
    await load();
  }

  async function confirmRemoveDoc() {
    if (!docToDelete) return;
    await withToast(() => apiDelete(`/projects/${id}/documents/${docToDelete.id}`), {
      success: "Document deleted.", error: "Delete failed",
    });
    setDocToDelete(null);
    load();
  }

  async function download(versionNo: number, fmt: string) {
    setDownloading(true);
    try {
      await downloadFile(`/projects/${id}/versions/${versionNo}/download/${fmt}`, `srs-v${versionNo}.${fmt}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDownloading(false);
    }
  }

  async function deleteProject() {
    if (!confirm("Delete this project and all its files?")) return;
    await withToast(() => apiDelete(`/projects/${id}`), {
      success: "Project deleted.", error: "Delete failed",
    });
    nav("/projects");
  }

  const v = project.current_version_no;

  return (
    <Layout>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <div className="mt-1 flex flex-wrap gap-2">
            <UploadBadge count={project.documents.length} />
            <StatusBadge status={jobId ? "generating" : project.srs_status} />
            <HostBadge status={project.host_sync_status} />
          </div>
        </div>
        {isAdmin && (
          <Button variant="danger" onClick={deleteProject}><Trash2 className="h-4 w-4" /> Delete project</Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Documents */}
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Documents</h2>
          <FileUpload projectId={id} onUploaded={load} />
          <div className="mt-4 space-y-2">
            {project.documents.length === 0 && (
              <p className="text-sm text-slate-400">No documents uploaded yet.</p>
            )}
            {project.documents.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                <div className="flex items-center gap-2 overflow-hidden">
                  <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                  <div className="overflow-hidden">
                    <p className="truncate text-sm">{d.original_filename}</p>
                    <p className="text-xs text-slate-400">{(d.size_bytes / 1024).toFixed(0)} KB</p>
                  </div>
                </div>
                <button className="text-slate-400 hover:text-red-600" onClick={() => setDocToDelete(d)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </Card>

        {/* Generation */}
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Generate SRS</h2>

          {jobId ? (
            <GenerationProgress projectId={id} jobId={jobId} onDone={onDone}
                                onDismiss={() => setJobId(null)} />
          ) : (
            <div className="space-y-4">
              <ModelSelect value={model} onChange={setModel} />
              {canGenerate && (
                <Button onClick={() => startGeneration(false)} disabled={starting} className="w-full">
                  <Sparkles className="h-4 w-4" /> {starting ? "Starting…" : "Generate SRS"}
                </Button>
              )}
              {canRegenerate && (
                <Button onClick={() => startGeneration(true)} disabled={starting} className="w-full">
                  <RefreshCw className="h-4 w-4" /> {starting ? "Starting…" : "Regenerate (new version)"}
                </Button>
              )}
              {hasVersion && !isAdmin && (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                  This project already has an SRS (v{v}). Ask an admin to regenerate.
                </p>
              )}
            </div>
          )}

          {hasVersion && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Latest SRS — v{v}</h3>
              <div className="flex flex-wrap gap-2">
                {["md", "json", "docx", "pdf"].map((fmt) => (
                  <Button key={fmt} variant="secondary" disabled={downloading}
                    onClick={() => download(v!, fmt)}>
                    <Download className="h-4 w-4" /> {fmt.toUpperCase()}
                  </Button>
                ))}
              </div>
              {!jobId && report && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Run report</p>
                  <RunSummaryCard s={report} />
                </div>
              )}
              <div className="mt-4">
                <HostSyncPanel
                  projectId={id}
                  hostStatus={project.host_sync_status}
                  currentVersion={v}
                  onChanged={load}
                />
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Version history */}
      {project.versions.length > 0 && (
        <Card className="mt-6 p-5">
          <h2 className="mb-3 font-semibold">Version history</h2>
          <div className="space-y-2">
            {project.versions.map((ver) => (
              <div key={ver.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="font-medium">v{ver.version_no}</span>
                  <span className="text-xs text-slate-400">{ver.model_id}</span>
                  <span className="text-xs text-slate-400">{new Date(ver.created_at).toLocaleString()}</span>
                  <HostBadge status={ver.host_sync_status} />
                </div>
                <div className="flex gap-1">
                  {["md", "json", "docx", "pdf"].map((fmt) => (
                    <button key={fmt} disabled={downloading}
                      onClick={() => download(ver.version_no, fmt)}
                      className="rounded px-2 py-1 text-xs text-brand-600 hover:bg-brand-50 disabled:opacity-50">
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={!!docToDelete} onClose={() => setDocToDelete(null)} title="Delete this document?">
        <div className="flex gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <p className="text-sm text-slate-600">
            Delete <span className="font-semibold text-slate-800">{docToDelete?.original_filename}</span>?
            The agent will no longer use it. This can't be undone.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDocToDelete(null)}>Cancel</Button>
          <Button variant="danger" onClick={confirmRemoveDoc}>Delete</Button>
        </div>
      </Modal>
    </Layout>
  );
}
