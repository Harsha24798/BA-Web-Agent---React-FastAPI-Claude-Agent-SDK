import { Clock, Coins, Cpu, Hash, Wrench } from "lucide-react";
import type { RunSummary } from "../lib/types";

function fmtTime(ms: number | null): string {
  if (ms == null) return "—";
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}
function fmtCost(c: number | null): string {
  return c == null ? "n/a" : `$${c.toFixed(4)}`;
}
function fmtNum(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString();
}

function Stat({ icon, label, value, strong }: { icon: React.ReactNode; label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <span className="text-slate-400">{icon}</span>
      <div>
        <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
        <p className={`text-sm ${strong ? "font-semibold text-slate-800" : "text-slate-700"}`}>{value}</p>
      </div>
    </div>
  );
}

export function RunSummaryCard({ s }: { s: RunSummary }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <Stat icon={<Clock className="h-4 w-4" />} label="Time" value={fmtTime(s.duration_ms)} />
      <Stat icon={<Coins className="h-4 w-4" />} label="Cost" value={fmtCost(s.total_cost_usd)} strong />
      <Stat icon={<Hash className="h-4 w-4" />} label="Tokens" value={`${fmtNum(s.input_tokens)} / ${fmtNum(s.output_tokens)}`} />
      <Stat icon={<Wrench className="h-4 w-4" />} label="Tool calls" value={fmtNum(s.tool_calls)} />
      <Stat icon={<Cpu className="h-4 w-4" />} label="Model" value={s.model || "—"} />
    </div>
  );
}
