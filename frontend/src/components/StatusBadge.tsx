const SRS_STYLES: Record<string, string> = {
  none: "bg-slate-100 text-slate-600",
  generating: "bg-amber-100 text-amber-700",
  generated: "bg-green-100 text-green-700",
  stale: "bg-orange-100 text-orange-700",
};

const SRS_LABELS: Record<string, string> = {
  none: "No SRS",
  generating: "Generating…",
  generated: "Generated",
  stale: "Docs changed",
};

const HOST_STYLES: Record<string, string> = {
  not_sent: "bg-slate-100 text-slate-500",
  synced: "bg-blue-100 text-blue-700",
  out_of_date: "bg-orange-100 text-orange-700",
};

const HOST_LABELS: Record<string, string> = {
  not_sent: "Not sent to host",
  synced: "Host synced",
  out_of_date: "Host out-of-date",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${SRS_STYLES[status] || SRS_STYLES.none}`}>
      {SRS_LABELS[status] || status}
    </span>
  );
}

export function HostBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${HOST_STYLES[status] || HOST_STYLES.not_sent}`}>
      {HOST_LABELS[status] || status}
    </span>
  );
}
