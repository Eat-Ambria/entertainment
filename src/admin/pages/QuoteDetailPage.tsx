/**
 * Quote detail (internal): the saved quotation as the guest sees it, plus actions, history
 * and the quote-specific rate overrides.
 * - Draft quotes can be edited (opens them in the Guest Studio).
 * - Status moves forward only (draft → confirmed, any → cancelled); enforced by the database.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useGuestQuote } from '@/data/quotes';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/toast';
import { dbErrorMessage } from '@/lib/dbErrors';
import { formatINR } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { QuoteDocument } from '@/studio/quote/QuoteDocument';
import { documentFromSaved } from '@/studio/quote/documentData';
import { STATUS_FLOW, STATUS_LABEL, type QuoteStatus } from '../quotes/quoteLedgerApi';
import { StatusBadge } from '../quotes/StatusBadge';
import { useQuoteInternal, useSetQuoteStatus } from '../quotes/useQuoteLedger';
import { useEditQuote } from '@/studio/quote/useEditQuote';

const ACTION_LABEL: Record<QuoteStatus, string> = {
  draft: '',
  sent: 'Mark as sent',
  confirmed: 'Mark confirmed',
  cancelled: 'Cancel quote',
};

const ordinal = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

const SOURCE_LABEL = { manual: 'Entered manually', lms_lead: 'LMS lead', lms_contract: 'LMS contract' } as const;

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

export default function QuoteDetailPage() {
  const { id } = useParams();
  const guest = useGuestQuote(id);
  const internal = useQuoteInternal(id);
  const setStatus = useSetQuoteStatus();
  const [confirm, setConfirm] = useState<QuoteStatus | null>(null);
  const edit = useEditQuote();
  const [confirmReplace, setConfirmReplace] = useState(false);

  if (guest.isLoading || internal.isLoading) return <Spinner label="Loading quote…" />;
  if (!guest.data || !internal.data) {
    return (
      <EmptyState
        icon="alert"
        title="Quote not found"
        action={
          <Link to="/admin/quotes" className="text-sm font-medium text-brand-600">
            Back to Quote Ledger
          </Link>
        }
      />
    );
  }

  const q = internal.data;
  const next = STATUS_FLOW[q.status];

  const editable = q.status === 'draft';

  async function apply(status: QuoteStatus) {
    try {
      await setStatus.mutateAsync({ id: q.id, status });
      toast.success(`${q.quote_no} marked ${STATUS_LABEL[status].toLowerCase()}.`);
      setConfirm(null);
    } catch (err) {
      toast.error(dbErrorMessage(err));
    }
  }

  function startEdit() {
    if (edit.hasOtherDraft(q.id)) setConfirmReplace(true);
    else void edit.open(q.id);
  }

  function historyLabel(h: (typeof q.history)[number]) {
    if (h.action === 'edited') return 'Edited after sending';
    if (h.action === 'sent') return h.sentCount ? `Sent again (${h.sentCount}${ordinal(h.sentCount)} time)` : 'Sent again';
    return `${STATUS_LABEL[h.from as QuoteStatus] ?? h.from} → ${STATUS_LABEL[h.to as QuoteStatus] ?? h.to}`;
  }

  return (
    <div className="space-y-6">
      <Link to="/admin/quotes" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <Icon name="chevronLeft" size={16} /> Quote Ledger
      </Link>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <QuoteDocument data={documentFromSaved(guest.data)} />

        <aside className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="num font-semibold text-slate-900">{q.quote_no}</h2>
              <StatusBadge status={q.status} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {SOURCE_LABEL[q.source]}
              {q.source_ref && ` · ${q.source_ref}`}
            </p>
            {editable && (
              <Button variant="secondary" full className="mt-4" loading={edit.busy} onClick={startEdit}>
                <Icon name="edit" size={16} /> Edit quote
              </Button>
            )}
            {next.length > 0 ? (
              <div className="mt-2 flex flex-col gap-2">
                {next.map((s) => (
                  <Button key={s} variant={s === 'cancelled' ? 'secondary' : 'primary'} onClick={() => setConfirm(s)} full>
                    {ACTION_LABEL[s]}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">This quote is cancelled and can't change any more.</p>
            )}
            {q.status === 'confirmed' && <p className="mt-3 text-xs text-slate-500">Confirmed quotes are locked so the booked price can't change.</p>}
            <Link
              to={`/studio/quotes/${q.id}`}
              className="mt-3 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50"
            >
              <Icon name="present" size={16} /> Open in Guest Studio
            </Link>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Status history</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {q.history.map((h, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="text-slate-700">{historyLabel(h)}</span>
                  <span className="shrink-0 text-xs text-slate-400">{dateTime(h.at)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-2">
                <span className="text-slate-700">Created</span>
                <span className="shrink-0 text-xs text-slate-400">{dateTime(q.created_at)}</span>
              </li>
            </ul>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Rate changes in this quote</h3>
            {q.overrides.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">All elements at their standard rate.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {q.overrides.map((o, i) => (
                  <li key={i}>
                    <p className="font-medium text-slate-800">{o.element_name}</p>
                    <p className="num text-xs text-slate-500">
                      {o.old_rate === null ? '' : `${formatINR(o.old_rate)} → `}
                      {formatINR(o.new_rate)} · {formatDate(o.changed_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {confirmReplace && (
        <ConfirmDialog
          title="Replace the quote you're working on?"
          body="The Guest Studio has another quote in progress. Opening this one replaces it — save that one first if you still need it."
          confirmLabel="Open this quote"
          tone="primary"
          onConfirm={async () => {
            setConfirmReplace(false);
            await edit.open(q.id);
          }}
          onClose={() => setConfirmReplace(false)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={`${ACTION_LABEL[confirm]}?`}
          body={
            confirm === 'cancelled'
              ? 'A cancelled quote is kept in the ledger but can no longer be changed.'
              : `${q.quote_no} will be marked ${STATUS_LABEL[confirm].toLowerCase()}. Its details are then locked.`
          }
          confirmLabel={ACTION_LABEL[confirm]}
          tone={confirm === 'cancelled' ? 'danger' : 'primary'}
          onConfirm={() => apply(confirm)}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
