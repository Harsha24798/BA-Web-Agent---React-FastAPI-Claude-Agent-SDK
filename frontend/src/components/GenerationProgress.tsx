import { useEffect, useRef, useState } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { apiBase, authHeaders } from "../lib/api";
import type { RunSummary, TermLine } from "../lib/types";
import { RunSummaryCard } from "./RunSummaryCard";

const PHASES = [
  ["preparing", "Preparing"],
  ["reading_docs", "Reading docs"],
  ["analyzing", "Analyzing"],
  ["drafting_srs", "Drafting SRS"],
  ["rendering_outputs", "Rendering"],
  ["finalizing", "Finalizing"],
];

// Terminal line style per kind.
const LINE: Record<string, { p: string; c: string }> = {
  info: { p: "▸", c: "text-slate-400" },
  tool: { p: "⚙", c: "text-sky-300" },
  mcp: { p: "🔌", c: "text-violet-300" },
  text: { p: "✎", c: "text-slate-300" },
  done: { p: "✓", c: "text-emerald-300" },
  error: { p: "✗", c: "text-red-300" },
};

interface Props {
  projectId: string;
  jobId: string;
  onDone: (status: string) => void;
  onDismiss?: () => void;
}

export function GenerationProgress({ projectId, jobId, onDone, onDismiss }: Props) {
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState("queued");
  const [lines, setLines] = useState<TermLine[]>([]);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [terminal, setTerminal] = useState<null | { status: string; error?: string }>(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const doneRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Live elapsed timer until the run ends.
  useEffect(() => {
    if (terminal) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [terminal]);

  // Auto-scroll the terminal to the newest line.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines]);

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
        try { data = JSON.parse(ev.data); } catch { return; }
        if (data.type === "progress") {
          if (typeof data.percent === "number") setPercent((p) => Math.max(p, data.percent));
          if (data.phase) setPhase(data.phase);
        } else if (data.type === "log") {
          setLines((ls) => [...ls, { kind: data.kind || "info", text: data.text || "", ts: data.ts }]);
        } else if (data.type === "summary") {
          setSummary(data as RunSummary);
        } else if (data.type === "done") {
          if (data.summary) setSummary(data.summary as RunSummary);
          setTerminal({ status: data.status, error: data.error });
          if (data.status === "completed") setPercent(100);
          if (!doneRef.current) { doneRef.current = true; onDone(data.status); }
          ctrl.abort();
        }
      },
      onclose() { if (!doneRef.current) throw new Error("stream closed early"); },
      onerror(err) {
        if (doneRef.current) throw err;
        retries += 1;
        if (retries > MAX_RETRIES) throw err;
        setReconnecting(true);
        return Math.min(1000 * retries, 5000);
      },
    }).catch(() => {
      if (!doneRef.current) setTerminal({ status: "failed", error: "Lost connection to the server." });
    });
    return () => ctrl.abort();
  }, [projectId, jobId]);

  const activeIdx = PHASES.findIndex(([k]) => k === phase);
  const isDone = terminal?.status === "completed";
  const isFail = terminal != null && terminal.status !== "completed";

  return (
    <div className="space-y-3">
      {/* Header: status + timer + dismiss */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {isDone && <span className="flex items-center gap-1 font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Completed</span>}
          {isFail && <span className="flex items-center gap-1 font-medium text-red-600"><XCircle className="h-4 w-4" /> {terminal!.status === "cancelled" ? "Cancelled" : "Failed"}</span>}
          {!terminal && <span className="font-medium capitalize text-slate-700">{reconnecting ? "Reconnecting…" : phase.replace("_", " ")}</span>}
          <span className="text-slate-400">· {elapsed}s</span>
        </div>
        {terminal && onDismiss && (
          <button className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600" onClick={onDismiss}>
            <X className="h-3.5 w-3.5" /> Dismiss
          </button>
        )}
      </div>

      {/* Progress bar (hidden once done) */}
      {!terminal && (
        <>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full bg-brand-500 transition-all duration-500" style={{ width: `${percent}%` }} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PHASES.map(([k, label], i) => (
              <span key={k} className={`rounded-full px-2 py-0.5 text-xs ${
                i < activeIdx ? "bg-green-100 text-green-700"
                : i === activeIdx ? "bg-brand-100 text-brand-700"
                : "bg-slate-100 text-slate-400"}`}>{label}</span>
            ))}
          </div>
        </>
      )}

      {/* Terminal */}
      <div ref={scrollRef}
        className="max-h-72 overflow-y-auto rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed">
        {lines.length === 0 ? (
          <p className="text-slate-500">Waiting for the agent…</p>
        ) : (
          lines.map((l, i) => {
            const s = LINE[l.kind] || LINE.info;
            return (
              <div key={i} className="flex gap-2">
                <span className={s.c}>{s.p}</span>
                <span className={`whitespace-pre-wrap break-words ${s.c}`}>{l.text}</span>
              </div>
            );
          })
        )}
        {isFail && terminal!.error && (
          <div className="mt-1 flex gap-2"><span className="text-red-300">✗</span><span className="text-red-300">{terminal!.error}</span></div>
        )}
      </div>

      {/* Summary */}
      {summary && <RunSummaryCard s={summary} />}
    </div>
  );
}
