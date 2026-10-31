/**
 * Rate History (internal) — three separate ledgers, never overwritten:
 *  1. Vendor purchase rates — one row per element + vendor: old rate → new rate and the
 *     change (↑ red / ↓ green / NEW); "History" opens every purchase (with Void).
 *  2. Master rate changes (old → new, reason).
 *  3. Quote-specific rate overrides (master → quote rate, quote link).
 */
import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormAlert } from '@/components/ui/FormAlert';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { TextField } from '@/components/ui/TextField';
import { toast } from '@/components/ui/toast';
import { usePagination } from '@/lib/usePagination';
import { formatINR } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { formatQty } from '@/lib/numbers';
import { dbErrorMessage } from '@/lib/dbErrors';
import type { RateLogRow, Trend, VendorLatestRow, VendorRateRow } from '../rates/ratesApi';
import { useRateElements, useRateLogs, useVendorLatest, useVendorPairHistory, useVendors, useVoidVendorEntry } from '../rates/useRates';
import { TabButton } from '@/components/ui/TabButton';
import { VendorEntryDialog } from '../rates/VendorEntryDialog';

type Tab = 'vendor' | 'master' | 'override';
const TABS: { key: Tab; label: string }[] = [
  { key: 'vendor', label: 'Vendor purchase rates' },
  { key: 'master', label: 'Master rate changes' },
  { key: 'override', label: 'Quote overrides' },
];

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

function TrendMark({ trend, reason }: { trend: Trend; reason: string | null }) {
  switch (trend) {
    case 'up':
      return <Icon name="arrowUp" size={18} className="text-rose-600" aria-hidden={false} aria-label="Rate went up" role="img" />;
    case 'down':
      return <Icon name="arrowDown" size={18} className="text-emerald-600" aria-hidden={false} aria-label="Rate went down" role="img" />;
    case 'new':
      return <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-bold tracking-wider text-brand-600">NEW</span>;
    case 'void':
      return (
        <span title={reason ?? undefined} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
          VOID
        </span>
      );
    default:
      return <span className="text-slate-300" aria-label="No change">—</span>;
  }
}

/** "+₹3.00 (+150%)" — red when the price went up, green when it went down. */
function Change({ row }: { row: VendorLatestRow }) {
  if (row.old_rate === null) return <TrendMark trend="new" reason={null} />;
  const diff = row.new_rate - row.old_rate;
  if (diff === 0) return <span className="text-slate-400">No change</span>;
  const pct = row.old_rate > 0 ? ` (${diff > 0 ? '+' : '−'}${Math.abs((diff / row.old_rate) * 100).toFixed(0)}%)` : '';
  return (
    <span className={`num inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${diff > 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
      <TrendMark trend={diff > 0 ? 'up' : 'down'} reason={null} />
      {diff > 0 ? '+' : '−'}
      {formatINR(Math.abs(diff))}
      {pct}
    </span>
  );
}

function LatestRow({ row, open, onToggle, onVoid }: { row: VendorLatestRow; open: boolean; onToggle: () => void; onVoid: (r: VendorRateRow) => void }) {
  return (
    <>
      <tr>
        <td className="px-5 py-3.5">
          <p className="font-medium text-slate-900">{row.element_name}</p>
          {row.unit && <p className="text-xs text-slate-400">per {row.unit}</p>}
        </td>
        <td className="px-5 py-3.5 text-slate-700">{row.vendor_name}</td>
        <td className="num px-5 py-3.5 text-right text-slate-500">
          {row.old_rate === null ? (
            '—'
          ) : (
            <>
              {formatINR(row.old_rate)}
              <span className="block text-xs text-slate-400">{formatDate(row.old_date!)}</span>
            </>
          )}
        </td>
        <td className="num px-5 py-3.5 text-right font-semibold text-slate-900">
          {formatINR(row.new_rate)}
          <span className="block text-xs font-normal text-slate-400">{formatDate(row.new_date)}</span>
        </td>
        <td className="px-5 py-3.5 text-right">
          <Change row={row} />
        </td>
        <td className="px-5 py-3.5 text-right">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
          >
            History ({row.purchases}) <Icon name="chevronRight" size={12} className={`transition ${open ? 'rotate-90' : ''}`} />
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-slate-50/70">
          <td colSpan={6} className="px-5 py-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">All purchases from {row.vendor_name}</p>
            <PairHistory elementId={row.element_id} vendorId={row.vendor_id} vendorName={row.vendor_name} onVoid={onVoid} />
          </td>
        </tr>
      )}
    </>
  );
}

/** Every purchase of one element from one vendor, newest first, with Void. */
function PairHistory({ elementId, vendorId, vendorName, onVoid }: { elementId: string; vendorId: string; vendorName: string; onVoid: (r: VendorRateRow) => void }) {
  const history = useVendorPairHistory(elementId, vendorId, true);
  if (history.isLoading) return <Spinner label="Loading history…" />;
  if (history.isError) return <FormAlert>{dbErrorMessage(history.error)}</FormAlert>;
  const rows = history.data?.rows ?? [];
  return (
    <table className="w-full text-sm" aria-label={`Purchase history from ${vendorName}`}>
      <tbody className="divide-y divide-slate-100">
        {rows.map((r) => (
          <tr key={r.id} className={r.trend === 'void' ? 'text-slate-400 line-through decoration-slate-300' : ''}>
            <td className="py-2 pr-3">
              {formatDate(r.purchase_date)}
              <span className="ml-2 text-xs text-slate-400">by {r.logged_by_name || 'you'}</span>
            </td>
            <td className="num py-2 pr-3 text-right text-slate-600">{formatQty(r.qty, r.unit)}</td>
            <td className="num py-2 pr-3 text-right font-semibold">{formatINR(r.rate_per_unit)}</td>
            <td className="py-2 pr-3 text-right">{r.trend === 'void' && <TrendMark trend="void" reason={r.void_reason} />}</td>
            <td className="py-2 text-right">
              {r.trend !== 'void' && (
                <button
                  type="button"
                  onClick={() => onVoid(r)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-slate-400 no-underline hover:bg-slate-100 hover:text-rose-600"
                  aria-label={`Void ${r.vendor_name} entry of ${formatDate(r.purchase_date)}`}
                >
                  Void
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VendorTab() {
  const [params, setParams] = useSearchParams();
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const elementId = params.get('element');
  const vendorId = params.get('vendor');
  const elements = useRateElements();
  const vendors = useVendors();
  const latest = useVendorLatest({ elementId, vendorId, page, pageSize });
  const [open, setOpen] = useState<string | null>(null);
  const voidEntry = useVoidVendorEntry();
  const [adding, setAdding] = useState(false);
  const [voiding, setVoiding] = useState<VendorRateRow | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidError, setVoidError] = useState<string | null>(null);

  const setParam = useCallback(
    (k: string, v: string | null) =>
      setParams((prev) => {
        const n = new URLSearchParams(prev);
        if (v) n.set(k, v);
        else n.delete(k);
        n.delete('page');
        return n;
      }),
    [setParams],
  );

  async function confirmVoid() {
    if (!voiding) return;
    if (!voidReason.trim()) {
      setVoidError('Give a reason for voiding.');
      return;
    }
    try {
      await voidEntry.mutateAsync({ id: voiding.id, reason: voidReason.trim() });
      toast.success('Entry voided.');
      setVoiding(null);
    } catch (err) {
      setVoidError(dbErrorMessage(err));
    }
  }

  const rows = latest.data?.rows ?? [];
  const startVoid = (r: VendorRateRow) => {
    setVoiding(r);
    setVoidReason('');
    setVoidError(null);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label>
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">Element</span>
            <select value={elementId ?? ''} onChange={(e) => setParam('element', e.target.value || null)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:w-56">
              <option value="">All elements</option>
              {(elements.data ?? []).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500">Vendor</span>
            <select value={vendorId ?? ''} onChange={(e) => setParam('vendor', e.target.value || null)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:w-56">
              <option value="">All vendors</option>
              {(vendors.data ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Icon name="plus" size={18} /> Log purchase rate
        </Button>
      </div>

      {latest.isError ? (
        <div className="p-6">
          <FormAlert>{dbErrorMessage(latest.error)}</FormAlert>
        </div>
      ) : latest.isLoading ? (
        <Spinner label="Loading purchase rates…" />
      ) : rows.length === 0 ? (
        <div className="p-6">
          <EmptyState icon="history" title="No purchase rates yet" description="Log what vendors charge you to track price changes over time." />
        </div>
      ) : (
        <>
          <div className={`overflow-x-auto ${latest.isPlaceholderData ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-200 text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-3">Element</th>
                  <th className="px-5 py-3">Vendor</th>
                  <th className="px-5 py-3 text-right">Old rate</th>
                  <th className="px-5 py-3 text-right">New rate</th>
                  <th className="px-5 py-3 text-right">Change</th>
                  <th className="px-5 py-3">
                    <span className="sr-only">History</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <LatestRow key={r.id} row={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} onVoid={startVoid} />
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={latest.data?.total ?? 0} onPageChange={setPage} onPageSizeChange={setPageSize} disabled={latest.isFetching} />
        </>
      )}

      {adding && <VendorEntryDialog elementId={elementId} onClose={() => setAdding(false)} />}
      {voiding && (
        <Modal
          title="Void this entry?"
          description={`${voiding.vendor_name} · ${formatDate(voiding.purchase_date)} · ${formatINR(voiding.rate_per_unit)}`}
          onClose={() => setVoiding(null)}
          size="sm"
          locked={voidEntry.isPending}
          footer={
            <>
              <Button variant="secondary" onClick={() => setVoiding(null)} disabled={voidEntry.isPending}>
                Keep entry
              </Button>
              <Button variant="danger" onClick={() => void confirmVoid()} loading={voidEntry.isPending}>
                Void entry
              </Button>
            </>
          }
        >
          <p className="mb-3 text-sm text-slate-600">The entry stays in history, marked void, and is left out of price trends.</p>
          <TextField label="Reason" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} error={voidError} placeholder="e.g. Wrong rate typed" />
        </Modal>
      )}
    </div>
  );
}

function LogTab({ type }: { type: 'master_rate' | 'quote_override' }) {
  const logs = useRateLogs(type, true);
  const rows: RateLogRow[] = logs.data?.pages.flat() ?? [];
  const isOverride = type === 'quote_override';

  if (logs.isError) return <FormAlert>{dbErrorMessage(logs.error)}</FormAlert>;
  if (logs.isLoading) return <Spinner label="Loading history…" />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon="history"
        title={isOverride ? 'No quote overrides yet' : 'No rate changes yet'}
        description={isOverride ? 'When a rate is changed inside a quote, it is recorded here.' : 'Changes to element default rates are recorded here.'}
      />
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-160 text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-5 py-3">When</th>
              <th className="px-5 py-3">Element</th>
              <th className="px-5 py-3 text-right">{isOverride ? 'Standard rate' : 'Previous'}</th>
              <th className="px-5 py-3 text-right">{isOverride ? 'Quote rate' : 'New'}</th>
              <th className="px-5 py-3">{isOverride ? 'Quote' : 'Reason'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-5 py-3 text-slate-500">{dateTime(r.changed_at)}</td>
                <td className="px-5 py-3 font-medium text-slate-900">{r.element_name}</td>
                <td className="num px-5 py-3 text-right text-slate-500">{r.old_rate === null ? '—' : formatINR(r.old_rate)}</td>
                <td className="num px-5 py-3 text-right font-semibold text-slate-900">{formatINR(r.new_rate)}</td>
                <td className="px-5 py-3 text-slate-600">
                  {isOverride ? (
                    r.quote_id ? (
                      <Link to={`/admin/quotes/${r.quote_id}`} className="num font-medium text-brand-700 hover:text-brand-900">
                        {r.quote_no ?? 'Open quote'}
                      </Link>
                    ) : (
                      '—'
                    )
                  ) : (
                    (r.reason ?? <span className="text-slate-300">—</span>)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {logs.hasNextPage && (
        <div className="flex justify-center border-t border-slate-200 p-3">
          <Button variant="secondary" loading={logs.isFetchingNextPage} onClick={() => void logs.fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}

export default function RateHistoryPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'vendor') as Tab;

  return (
    <>
      <PageHeader
        title="Rate History"
        description="Every rate change is kept — nothing here is ever overwritten. Vendor purchase rates are your own records; they are not used in quotes or P&L."
      />
      <div role="tablist" aria-label="Rate history" className="mb-5 inline-flex flex-wrap rounded-lg bg-slate-100 p-1 text-sm">
        {TABS.map((t) => (
          <TabButton key={t.key} selected={tab === t.key} onClick={() => setParams(t.key === 'vendor' ? {} : { tab: t.key })}>
            {t.label}
          </TabButton>
        ))}
      </div>
      {tab === 'vendor' && <VendorTab />}
      {tab === 'master' && <LogTab key="master" type="master_rate" />}
      {tab === 'override' && <LogTab key="override" type="quote_override" />}
    </>
  );
}
