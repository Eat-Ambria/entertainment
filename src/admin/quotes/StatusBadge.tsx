/**
 * Quote status pill used in the ledger and quote detail.
 */
import { STATUS_LABEL, type QuoteStatus } from './quoteLedgerApi';

const STYLES: Record<QuoteStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-sky-50 text-sky-700',
  confirmed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-rose-50 text-rose-700',
};

export function StatusBadge({ status }: { status: QuoteStatus }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[status]}`}>{STATUS_LABEL[status]}</span>;
}
