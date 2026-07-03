import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Download, FileText, Trash2, Sparkles, RefreshCw } from "lucide-react";
import { apiDelete, apiGet, apiPost, downloadUrl } from "../lib/api";
import { toast, withToast } from "../lib/toast";
import type { Job, ProjectDetail as PD } from "../lib/types";
import { useAuth } from "../auth/AuthContext";
import { Layout } from "../components/Layout";
import { Button, Card, Spinner } from "../components/ui";
import { HostBadge, StatusBadge } from "../components/StatusBadge";
import { FileUpload } from "../components/FileUpload";
import { ModelSelect } from "../components/ModelSelect";
import { GenerationProgress } from "../components/GenerationProgress";
import { HostSyncPanel } from "../components/HostSyncPanel";

export default function ProjectDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const { isAdmin } = useAuth();
  const [project, setProject] = useState<PD | null>(null);
  const [model, setModel] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function load() {
    try {
      const p = await apiGet<PD>(`/projects/${id}`);
      setProject(p);
      setJobId(p.active_job_id);
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  useEffect(() => { load(); }, [id]);

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
    const job = await withToast(() => apiPost<Job>(path, { model_id: model }), {
      success: "Generation started…",
      error: "Could not start",
    });
    setStarting(false);
    if (job) { setJobId(job.id); }
  }

  async function onDone(status: string) {
    if (status === "completed") toast.success("SRS generated successfully.");
    await load();
    setJobId(null);
  }

  async function removeDoc(docId: string) {
    await withToast(() => apiDelete(`/projects/${id}/documents/${docId}`), {
      success: "Document deleted.", error: "Delete failed",
    });
    load();
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
                    <p className="text-xs capitalize text-slate-400">{d.category} · {(d.size_bytes / 1024).toFixed(0)} KB</p>
                  </div>
                </div>
                <button className="text-slate-400 hover:text-red-600" onClick={() => removeDoc(d.id)}>
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
            <GenerationProgress projectId={id} jobId={jobId} onDone={onDone} />
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
                  <a key={fmt} href={downloadUrl(`/projects/${id}/versions/${v}/download/${fmt}`)}>
                    <Button variant="secondary"><Download className="h-4 w-4" /> {fmt.toUpperCase()}</Button>
                  </a>
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
                  <HostBadge status={ver.host_sync_status === "synced" ? "synced" : "not_sent"} />
                </div>
                <div className="flex gap-1">
                  {["md", "json", "docx", "pdf"].map((fmt) => (
                    <a key={fmt} href={downloadUrl(`/projects/${id}/versions/${ver.version_no}/download/${fmt}`)}
                       className="rounded px-2 py-1 text-xs text-brand-600 hover:bg-brand-50">
                      {fmt}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </Layout>
  );
}
