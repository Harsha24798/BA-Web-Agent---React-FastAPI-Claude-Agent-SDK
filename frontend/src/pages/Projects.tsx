import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { apiGet, apiPost } from "../lib/api";
import { fmtDate } from "../lib/datetime";
import { toast } from "../lib/toast";
import type { Project } from "../lib/types";
import { Layout } from "../components/Layout";
import { Button, Card, Input, Label, Modal, Spinner } from "../components/ui";
import { HostBadge, StatusBadge, UploadBadge } from "../components/StatusBadge";

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setProjects(await apiGet<Project[]>("/projects"));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => { load(); }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await apiPost("/projects", { name });
      toast.success("Project created.");
      setOpen(false);
      setName("");
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout>
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Projects</h1>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New Project</Button>
      </div>

      {!loaded ? (
        <Card className="flex items-center justify-center gap-2 p-10 text-slate-500">
          <Spinner /> Loading…
        </Card>
      ) : projects.length === 0 ? (
        <Card className="p-10 text-center text-slate-500">
          No projects yet. Create one to get started.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`}>
              <Card className="h-full p-5 transition hover:shadow-md">
                <h3 className="mb-1 font-semibold text-slate-800">{p.name}</h3>
                <p className="mb-3 text-xs text-slate-400">
                  Created {fmtDate(p.created_at)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <UploadBadge count={p.document_count} />
                  <StatusBadge status={p.srs_status} />
                  <HostBadge status={p.host_sync_status} />
                  {p.current_version_no && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                      v{p.current_version_no}
                    </span>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New project">
        <form onSubmit={create} className="space-y-4">
          <div>
            <Label>Project name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create"}</Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
