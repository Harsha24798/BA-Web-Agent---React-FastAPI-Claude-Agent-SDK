import { useEffect, useRef, useState } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { CheckCircle2, XCircle } from "lucide-react";
import { apiBase, authHeaders } from "../lib/api";

const PHASES = [
  ["preparing", "Preparing"],
  ["reading_docs", "Reading docs"],
  ["analyzing", "Analyzing"],
  ["drafting_srs", "Drafting SRS"],
  ["rendering_outputs", "Rendering"],
  ["finalizing", "Finalizing"],
];

interface Props {
  projectId: string;
  jobId: string;
  onDone: (status: string) => void;
}

export function GenerationProgress({ projectId, jobId, onDone }: Props) {
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState("queued");
  const [activity, setActivity] = useState("Starting…");
  const [terminal, setTerminal] = useState<null | { status: string; error?: string }>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    const ctrl = new AbortController();
    doneRef.current = false;
    let retries = 0;
    const MAX_RETRIES = 8;

    fetchEventSource(`${apiBase}/projects/${projectId}/jobs/${jobId}/stream`, {
      headers: { ...authHeaders() },
      signal: ctrl.signal,
      openWhenHidden: true,
      onopen: async () => { setReconnecting(false); retries = 0; },
      onmessage(ev) {
        if (!ev.data) return;
        let data: any;
        try {
          data = JSON.parse(ev.data);
        } catch {
          return; // one malformed frame shouldn't tear down the whole stream
        }
        if (data.type === "progress") {
          if (typeof data.percent === "number") setPercent((p) => Math.max(p, data.percent));
          if (data.phase) setPhase(data.phase);
          if (data.current_activity) setActivity(data.current_activity);
        } else if (data.type === "done") {
          setTerminal({ status: data.status, error: data.error });
          if (data.status === "completed") setPercent(100);
          if (!doneRef.current) {
            doneRef.current = true;
            onDone(data.status);
          }
          ctrl.abort();
        }
      },
      onclose() {
        // Server closed without a terminal event — retry unless we already finished.
        if (!doneRef.current) throw new Error("stream closed early");
      },
      onerror(err) {
        if (doneRef.current) throw err; // stop retrying, we're done
        retries += 1;
        if (retries > MAX_RETRIES) throw err; // give up after sustained failures
        setReconnecting(true);
        return Math.min(1000 * retries, 5000); // backoff; library reconnects
      },
    }).catch(() => {
      // Only surface a hard failure if the job never reached a terminal state.
      if (!doneRef.current) {
        setTerminal({ status: "failed", error: "Lost connection to the server." });
      }
    });
    return () => ctrl.abort();
  }, [projectId, jobId]);

  const activeIdx = PHASES.findIndex(([k]) => k === phase);

  if (terminal?.status === "completed") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-green-50 p-4 text-green-700">
        <CheckCircle2 className="h-5 w-5" /> SRS generated successfully.
      </div>
    );
  }
  if (terminal && terminal.status !== "completed") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-red-700">
        <XCircle className="h-5 w-5" />
        {terminal.status === "cancelled" ? "Generation cancelled." : `Generation failed: ${terminal.error}`}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium capitalize text-slate-700">{phase.replace("_", " ")}</span>
        <span className="text-slate-500">{percent}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className="h-full bg-brand-500 transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {PHASES.map(([k, label], i) => (
          <span
            key={k}
            className={`rounded-full px-2 py-0.5 text-xs ${
              i < activeIdx ? "bg-green-100 text-green-700"
              : i === activeIdx ? "bg-brand-100 text-brand-700"
              : "bg-slate-100 text-slate-400"
            }`}
          >
            {label}
          </span>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        {reconnecting ? "Reconnecting to the server…" : activity}
      </p>
    </div>
  );
}
