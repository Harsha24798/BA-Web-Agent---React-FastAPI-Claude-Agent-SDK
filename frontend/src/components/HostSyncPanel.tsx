import { useState } from "react";
import { CloudUpload, RefreshCw } from "lucide-react";
import { apiPost } from "../lib/api";
import { withToast } from "../lib/toast";
import { Button } from "./ui";
import { HostBadge } from "./StatusBadge";

interface Props {
  projectId: string;
  hostStatus: string;
  currentVersion: number | null;
  onChanged: () => void;
}

export function HostSyncPanel({ projectId, hostStatus, currentVersion, onChanged }: Props) {
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!currentVersion) return;
    setBusy(true);
    await withToast(() => apiPost(`/projects/${projectId}/srs/${currentVersion}/send-host`), {
      success: "Sent to host storage.",
      error: "Send failed",
    });
    setBusy(false);
    onChanged();
  }

  async function sync() {
    setBusy(true);
    await withToast(() => apiPost(`/projects/${projectId}/sync-host`), {
      success: "Host storage is up to date.",
      error: "Sync failed",
    });
    setBusy(false);
    onChanged();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <HostBadge status={hostStatus} />
      {hostStatus === "not_sent" && (
        <Button onClick={send} disabled={busy || !currentVersion}>
          <CloudUpload className="h-4 w-4" /> Send to Host Storage
        </Button>
      )}
      {hostStatus === "out_of_date" && (
        <Button onClick={sync} disabled={busy}>
          <RefreshCw className="h-4 w-4" /> Sync host storage
        </Button>
      )}
      {hostStatus === "synced" && (
        <Button variant="secondary" onClick={sync} disabled={busy}>
          <RefreshCw className="h-4 w-4" /> Re-sync
        </Button>
      )}
    </div>
  );
}
