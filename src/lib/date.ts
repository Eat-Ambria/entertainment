/**
 * Date display helpers — "18 Oct 2026" style used across ledgers.
 */
const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function formatDate(value: string | Date): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return dateFmt.format(d);
}

/** Today's date in India as YYYY-MM-DD. */
export function todayIst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}
