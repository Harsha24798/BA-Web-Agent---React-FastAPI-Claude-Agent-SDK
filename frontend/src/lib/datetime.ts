// Backend timestamps are UTC but are often serialized without a timezone marker
// (e.g. "2026-07-10T05:11:09"). The browser would otherwise read those as LOCAL time,
// showing every time off by the viewer's UTC offset. Treat a tz-less string as UTC.
function asUtc(iso: string): Date {
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso);
  return new Date(hasTz ? iso : `${iso}Z`);
}

/** Localized date + time (e.g. "7/10/2026, 10:41:09 AM"). */
export function fmtDateTime(iso: string): string {
  return asUtc(iso).toLocaleString();
}

/** Localized date only (e.g. "7/10/2026"). */
export function fmtDate(iso: string): string {
  return asUtc(iso).toLocaleDateString();
}
