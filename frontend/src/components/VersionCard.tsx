import { useEffect, useState } from "react";
import { Download, FileArchive } from "lucide-react";
import { apiGet, downloadFile } from "../lib/api";
import { toast } from "../lib/toast";
import type { RunSummary, SrsVersion } from "../lib/types";
import { Button, Card, Spinner } from "./ui";
import { HostBadge } from "./StatusBadge";
import { RunSummaryCard } from "./RunSummaryCard";
import { VersionDiagramList } from "./DiagramsCard";

const FORMATS = ["md", "json", "docx", "pdf"];

export function VersionCard({ projectId, projectName, version }: {
  projectId: string; projectName: string; version: SrsVersion;
}) {
  const n = version.version_no;
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null); // which button is downloading

  useEffect(() => {
    apiGet<{ summary: RunSummary | null }>(`/projects/${projectId}/versions/${n}/report`)
      .then((r) => setSummary(r.summary))
      .catch(() => setSummary(null));
  }, [projectId, n]);

  async function grab(key: string, path: string, filename: string) {
    if (busyKey) return; // guard against accidental double-clicks
    setBusyKey(key);
    try {
      await downloadFile(path, filename);
      toast.success(`Downloaded ${filename}`);
    } catch (e: any) {
      toast.error(e.message || "Download failed");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Card className="p-5 transition hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-800">{projectName} - V{n}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
            {version.generated_by_name && (
              <><span>by <span className="font-medium text-slate-500">{version.generated_by_name}</span></span><span>·</span></>
            )}
            <span className="font-mono">{version.model_id}</span>
            <span>·</span>
            <span>{new Date(version.created_at).toLocaleString()}</span>
            <HostBadge status={version.host_sync_status} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FORMATS.map((fmt) => (
            <Button key={fmt} variant="secondary" disabled={!!busyKey} className="px-3 py-1.5 text-xs"
              onClick={() => grab(fmt, `/projects/${projectId}/versions/${n}/download/${fmt}`, `srs-v${n}.${fmt}`)}>
              {busyKey === fmt ? <Spinner /> : <Download className="h-3.5 w-3.5" />} {fmt.toUpperCase()}
            </Button>
          ))}
          <Button disabled={!!busyKey} className="px-3 py-1.5 text-xs"
            onClick={() => grab("zip", `/projects/${projectId}/versions/${n}/bundle.zip`,
              `${projectName.replace(/[^A-Za-z0-9._-]+/g, "-")}-V${n}.zip`)}>
            {busyKey === "zip" ? <Spinner /> : <FileArchive className="h-3.5 w-3.5" />} Download ZIP
          </Button>
        </div>
      </div>

      {summary && <div className="mt-4"><RunSummaryCard s={summary} /></div>}

      <VersionDiagramList projectId={projectId} versionNo={n} />
    </Card>
  );
}
