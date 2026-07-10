import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Clock, Download, FileText, Trash2, Sparkles, RefreshCw } from "lucide-react";
import { apiDelete, apiGet, apiPost, downloadFile } from "../lib/api";
import { toast, withToast } from "../lib/toast";
import type { DocumentItem, GenerationActive, Job, ProjectDetail as PD } from "../lib/types";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { Button, Card, ConfirmDialog, Modal, Spinner } from "../components/ui";
import { HostBadge, StatusBadge, UploadBadge } from "../components/StatusBadge";
import { FileUpload } from "../components/FileUpload";
import { ModelSelect } from "../components/ModelSelect";
import { GenerationProgress } from "../components/GenerationProgress";
import { HostSyncPanel } from "../components/HostSyncPanel";
import { VersionCard } from "../components/VersionCard";

export default function ProjectDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  const [project, setProject] = useState<PD | null>(null);
  const [model, setModel] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [docToDelete, setDocToDelete] = useState<DocumentItem | null>(null);
  const [dlFmt, setDlFmt] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [globalActive, setGlobalActive] = useState<GenerationActive | null>(null);

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

  // Poll the system-wide generation lock so we can block generating while another user runs.
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try { const a = await apiGet<GenerationActive>("/generation/active"); if (!stop) setGlobalActive(a); }
      catch { /* ignore */ }
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  if (!project) {
    return <Layout><div className="flex items-center gap-2 text-slate-500"><Spinner /> Loading…</div></Layout>;
  }

  const hasVersion = project.current_version_no != null;
  const globalBusy = !!globalActive?.busy && globalActive.job_id !== jobId;
  const canGenerate = !hasVersion && !jobId && !globalBusy;
  const canRegenerate = isAdmin && hasVersion && !jobId && !globalBusy;
  const canUserRegen = !isAdmin && hasVersion && !jobId && !globalBusy && project.my_regen_status === "approved";

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
    if (dlFmt) return; // guard double-clicks
    setDlFmt(fmt);
    try {
      await downloadFile(`/projects/${id}/versions/${versionNo}/download/${fmt}`, `srs-v${versionNo}.${fmt}`);
      toast.success(`Downloaded srs-v${versionNo}.${fmt}`);
    } catch (e: any) {
      toast.error(e.message || "Download failed");
    } finally {
      setDlFmt(null);
    }
  }

  async function requestRegen() {
    setRequesting(true);
    await withToast(() => apiPost(`/projects/${id}/regen-request`), {
      success: "Regenerate access requested. An admin will review it.", error: "Request failed",
    });
    setRequesting(false);
    load();
  }

  async function deleteProject() {
    setDeleting(true);
    const r = await withToast(() => apiDelete(`/projects/${id}`), {
      success: "Project deleted.", error: "Delete failed",
    });
    setDeleting(false);
    if (r) nav("/projects");
  }

  const v = project.current_version_no;

  return (
    <Layout>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">
            {project.name}{v != null ? ` - V${v}` : ""}
          </h1>
          <div className="mt-1 flex flex-wrap gap-2">
            <UploadBadge count={project.documents.length} />
            <StatusBadge status={jobId ? "generating" : project.srs_status} />
            <HostBadge status={project.host_sync_status} />
          </div>
        </div>
        {isAdmin && (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}><Trash2 className="h-4 w-4" /> Delete project</Button>
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

              {/* System-wide lock: someone else is generating */}
              {globalBusy && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <span className="font-medium">{globalActive?.user_name || "Another user"}</span> is
                    generating an SRS{globalActive?.project_name ? ` for "${globalActive.project_name}"` : ""} —
                    please wait until it completes.
                  </span>
                </div>
              )}

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

              {/* Non-admin regenerate: request → admin approves (single-use) → regenerate */}
              {!isAdmin && hasVersion && !globalBusy && (
                canUserRegen ? (
                  <Button onClick={() => startGeneration(false)} disabled={starting} className="w-full">
                    <RefreshCw className="h-4 w-4" /> {starting ? "Starting…" : "Regenerate (access granted)"}
                  </Button>
                ) : project.my_regen_status === "pending" ? (
                  <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                    Regenerate access requested — awaiting admin approval.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                      This project already has an SRS (v{v}).
                      {project.my_regen_status === "rejected" && " Your last request was declined."}
                    </p>
                    <Button variant="secondary" onClick={requestRegen} disabled={requesting} className="w-full">
                      <RefreshCw className="h-4 w-4" /> {requesting ? "Requesting…" : "Request regenerate access"}
                    </Button>
                  </div>
                )
              )}
            </div>
          )}

          {hasVersion && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Latest SRS — v{v}</h3>
              <div className="flex flex-wrap gap-2">
                {["md", "json", "docx", "pdf"].map((fmt) => (
                  <Button key={fmt} variant="secondary" disabled={dlFmt !== null}
                    onClick={() => download(v!, fmt)}>
                    {dlFmt === fmt ? <Spinner /> : <Download className="h-4 w-4" />} {fmt.toUpperCase()}
                  </Button>
                ))}
              </div>
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

      {/* Version history — one card per version */}
      {project.versions.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 font-semibold">Version history</h2>
          <div className="space-y-4">
            {project.versions.map((ver) => (
              <VersionCard key={ver.id} projectId={id} projectName={project.name} version={ver} />
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this project?"
        message={<>Delete <span className="font-semibold text-slate-800">{project.name}</span> and all its files, versions, and diagrams? This can't be undone.</>}
        confirmLabel="Delete project"
        busy={deleting}
        onConfirm={deleteProject}
        onCancel={() => setConfirmDelete(false)}
      />

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
