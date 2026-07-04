const SRS_STYLES: Record<string, string> = {
  none: "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
  generating: "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  generated: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200",
  stale: "bg-orange-100 text-orange-800 ring-1 ring-orange-200",
};

const SRS_LABELS: Record<string, string> = {
  none: "No SRS",
  generating: "Generating…",
  generated: "SRS ready",
  stale: "Docs changed",
};

const HOST_STYLES: Record<string, string> = {
  not_sent: "bg-slate-100 text-slate-500 ring-1 ring-slate-200",
  synced: "bg-blue-100 text-blue-700 ring-1 ring-blue-200",
  out_of_date: "bg-orange-100 text-orange-800 ring-1 ring-orange-200",
};

const HOST_LABELS: Record<string, string> = {
  not_sent: "Not sent to host",
  synced: "Host synced",
  out_of_date: "Host out-of-date",
};

const PILL = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium";

export function StatusBadge({ status }: { status: string }) {
  return <span className={`${PILL} ${SRS_STYLES[status] || SRS_STYLES.none}`}>{SRS_LABELS[status] || status}</span>;
}

export function HostBadge({ status }: { status: string }) {
  return <span className={`${PILL} ${HOST_STYLES[status] || HOST_STYLES.not_sent}`}>{HOST_LABELS[status] || status}</span>;
}

export function UploadBadge({ count }: { count: number }) {
  if (!count) {
    return <span className={`${PILL} bg-slate-100 text-slate-500 ring-1 ring-slate-200`}>No files uploaded</span>;
  }
  return (
    <span className={`${PILL} bg-violet-100 text-violet-800 ring-1 ring-violet-200`}>
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[10px] font-semibold text-white">
        {count > 99 ? "99+" : count}
      </span>
      {count === 1 ? "file uploaded" : "files uploaded"}
    </span>
  );
}
