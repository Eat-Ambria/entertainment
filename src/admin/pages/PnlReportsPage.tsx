/**
 * P&L Reports (internal): cost vs selling per quote.
 * - Cost per element is locked when the quote is saved (fixed unit cost, else the latest
 *   vendor purchase rate). Missing cost is shown as missing — never as zero — and such
 *   quotes are left out of the profit totals.
 * - Additional charges are pass-through (no profit) and shown separately.
 * - Default view: confirmed quotes. Filters: status, event date range, function, package.
 */
import { Fragment, useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEventOptions } from '@/data/eventOptions';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { FormAlert } from '@/components/ui/FormAlert';
import { Pagination } from '@/components/ui/Pagination';
import { usePagination } from '@/lib/usePagination';
import { formatINR } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { formatQty } from '@/lib/numbers';
import { formatPct, profitTone } from '@/lib/pnl';
import { dbErrorMessage } from '@/lib/dbErrors';
import { useLedgerPackages } from '../quotes/useQuoteLedger';
import { STATUS_FILTERS, pnlApi, type PnlFilters, type PnlLine, type StatusFilter } from '../pnl/pnlApi';

const selectCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const labelCls = 'mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500';
const isDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function Kpi({ label, value, sub, tone = 'text-slate-900' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`num mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

const SOURCE_LABEL = { base_rate: 'Cost rate', fixed: 'Fixed cost', vendor: 'Vendor rate' } as const;

function QuoteLines({ quoteId }: { quoteId: string }) {
  const lines = useQuery({ queryKey: ['pnl', 'lines', quoteId], queryFn: () => pnlApi.lines(quoteId) });
  if (lines.isLoading) return <Spinner label="Loading lines…" />;
  if (lines.isError) return <FormAlert>{dbErrorMessage(lines.error)}</FormAlert>;
  const rows: PnlLine[] = lines.data ?? [];
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left font-semibold uppercase tracking-wider text-slate-500">
          <th className="py-2 pr-3">Element</th>
          <th className="px-3 py-2 text-right">Qty</th>
          <th className="px-3 py-2 text-right">Selling rate</th>
          <th className="px-3 py-2 text-right">Cost rate</th>
          <th className="px-3 py-2 text-right">Selling</th>
          <th className="px-3 py-2 text-right">Cost</th>
          <th className="px-3 py-2 text-right">Profit</th>
          <th className="py-2 pl-3 text-right">Margin</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((l) => (
          <tr key={l.id}>
            <td className="py-2 pr-3 text-slate-800">
              {l.element_name}
              {l.package_name && <span className="block text-[11px] text-slate-400">{l.package_name}</span>}
            </td>
            <td className="num px-3 py-2 text-right text-slate-600">{formatQty(l.qty, l.unit)}</td>
            <td className="num px-3 py-2 text-right text-slate-600">{formatINR(l.rate)}</td>
            <td className="num px-3 py-2 text-right">
              {l.unit_cost === null ? (
                <span className="font-medium text-amber-600">Missing</span>
              ) : (
                <>
                  {formatINR(l.unit_cost)}
                  {l.cost_source && <span className="block text-[11px] text-slate-400">{SOURCE_LABEL[l.cost_source]}</span>}
                </>
              )}
            </td>
            <td className="num px-3 py-2 text-right text-slate-800">{formatINR(l.selling)}</td>
            <td className="num px-3 py-2 text-right text-slate-800">{l.cost === null ? '—' : formatINR(l.cost)}</td>
            <td className={`num px-3 py-2 text-right font-medium ${profitTone(l.profit)}`}>{l.profit === null ? '—' : formatINR(l.profit)}</td>
            <td className={`num py-2 pl-3 text-right ${profitTone(l.margin_pct)}`}>{formatPct(l.margin_pct)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function PnlReportsPage() {
  const [params, setParams] = useSearchParams();
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const statusParam = params.get('status') as StatusFilter | null;
  const filters: PnlFilters = {
    status: STATUS_FILTERS.some((s) => s.value === statusParam) ? statusParam! : 'confirmed',
    from: isDate(params.get('from')),
    to: isDate(params.get('to')),
    functionName: params.get('fn'),
    packageId: params.get('pkg'),
  };
  const [open, setOpen] = useState<string | null>(null);

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        next.delete('page');
        return next;
      }),
    [setParams],
  );

  const options = useEventOptions();
  const packages = useLedgerPackages();
  const totals = useQuery({ queryKey: ['pnl', 'totals', filters], queryFn: () => pnlApi.totals(filters), placeholderData: keepPreviousData });
  const list = useQuery({
    queryKey: ['pnl', 'list', filters, page, pageSize],
    queryFn: () => pnlApi.list(filters, page, pageSize),
    placeholderData: keepPreviousData,
  });
  const t = totals.data;
  const rows = list.data?.rows ?? [];

  return (
    <>
      <PageHeader
        title="P&L Reports"
        description="Selling = guest rate × qty. Cost = cost rate × qty (the rate before the multiplier). Costs are locked when a quote is saved."
      />

      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <label className="min-w-0">
            <span className={labelCls}>Status</span>
            <select value={filters.status} onChange={(e) => setParam('status', e.target.value === 'confirmed' ? null : e.target.value)} className={selectCls}>
              {STATUS_FILTERS.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className={labelCls}>Function</span>
            <select value={filters.functionName ?? ''} onChange={(e) => setParam('fn', e.target.value || null)} className={selectCls}>
              <option value="">All functions</option>
              {(options.data?.functions ?? []).map((f) => (
                <option key={f.id} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className={labelCls}>Package</span>
            <select value={filters.packageId ?? ''} onChange={(e) => setParam('pkg', e.target.value || null)} className={selectCls}>
              <option value="">All packages</option>
              {(packages.data ?? []).map((pk) => (
                <option key={pk.id} value={pk.id}>
                  {pk.label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0">
            <span className={labelCls}>Event from</span>
            <input type="date" value={filters.from ?? ''} max={filters.to ?? undefined} onChange={(e) => setParam('from', e.target.value || null)} className={selectCls} />
          </label>
          <label className="min-w-0">
            <span className={labelCls}>Event to</span>
            <input type="date" value={filters.to ?? ''} min={filters.from ?? undefined} onChange={(e) => setParam('to', e.target.value || null)} className={selectCls} />
          </label>
        </div>
        {params.toString() && (
          <button
            type="button"
            onClick={() => setParams({})}
            className="mt-3 rounded-lg px-2 py-1 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            Clear filters
          </button>
        )}
      </div>

      {totals.isError ? (
        <FormAlert>{dbErrorMessage(totals.error)}</FormAlert>
      ) : !t ? (
        <Spinner label="Calculating…" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Selling (elements)" value={formatINR(t.elements_selling)} sub={`${t.complete_quotes} of ${t.quotes} quotes`} />
            <Kpi label="Cost" value={formatINR(t.elements_cost)} sub="Cost rate × qty" />
            <Kpi label="Profit" value={formatINR(t.profit)} tone={profitTone(t.profit)} sub="Selling − cost" />
            <Kpi label="Margin" value={formatPct(t.margin_pct)} tone={profitTone(t.margin_pct)} sub="Profit ÷ selling" />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Additional charges {formatINR(t.charges_total)} are pass-through (no profit) and not included above.
          </p>
          {t.incomplete_quotes > 0 && (
            <div role="status" className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
              <span>
                {t.incomplete_quotes} {t.incomplete_quotes === 1 ? 'quote has' : 'quotes have'} elements without a cost, so{' '}
                {t.incomplete_quotes === 1 ? 'it is' : 'they are'} left out of the totals. This happens when an element was deleted after the
                quote was saved.
              </span>
            </div>
          )}
        </>
      )}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        {list.isError ? (
          <div className="p-6">
            <FormAlert>{dbErrorMessage(list.error)}</FormAlert>
          </div>
        ) : list.isLoading ? (
          <Spinner label="Loading quotes…" />
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState icon="chart" title="No quotes to report" description="Confirmed quotes appear here. Change the status filter to see others." />
          </div>
        ) : (
          <>
            <div className={`overflow-x-auto ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
              <table className="w-full min-w-200 text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="w-8 px-3 py-3" />
                    <th className="px-3 py-3">Quote</th>
                    <th className="px-3 py-3">Event</th>
                    <th className="px-3 py-3 text-right">Selling</th>
                    <th className="px-3 py-3 text-right">Cost</th>
                    <th className="px-3 py-3 text-right">Profit</th>
                    <th className="px-3 py-3 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <Fragment key={r.id}>
                      <tr className="hover:bg-slate-50">
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => setOpen(open === r.id ? null : r.id)}
                            aria-expanded={open === r.id}
                            aria-label={`${open === r.id ? 'Hide' : 'Show'} lines for ${r.quote_no}`}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <Icon name={open === r.id ? 'chevronLeft' : 'chevronRight'} size={16} className={open === r.id ? '-rotate-90' : ''} />
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <Link to={`/admin/quotes/${r.id}`} className="num font-medium text-brand-700 hover:text-brand-900">
                            {r.quote_no}
                          </Link>
                          <p className="text-xs text-slate-500">{r.guest_name}</p>
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {r.event_date ? formatDate(r.event_date) : '—'}
                          <span className="block text-xs text-slate-400">{r.function_name}</span>
                        </td>
                        <td className="num px-3 py-3 text-right font-medium text-slate-900">{formatINR(r.elements_selling)}</td>
                        <td className="num px-3 py-3 text-right">
                          {r.elements_cost === null ? (
                            <span className="text-xs font-medium text-amber-600">
                              Cost missing ({r.missing_cost_lines} {r.missing_cost_lines === 1 ? 'element' : 'elements'})
                            </span>
                          ) : (
                            formatINR(r.elements_cost)
                          )}
                        </td>
                        <td className={`num px-3 py-3 text-right font-semibold ${profitTone(r.profit)}`}>{r.profit === null ? '—' : formatINR(r.profit)}</td>
                        <td className={`num px-3 py-3 text-right ${profitTone(r.margin_pct)}`}>{formatPct(r.margin_pct)}</td>
                      </tr>
                      {open === r.id && (
                        <tr>
                          <td colSpan={7} className="bg-slate-50/70 px-6 py-4">
                            <QuoteLines quoteId={r.id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={list.data?.total ?? 0} onPageChange={setPage} onPageSizeChange={setPageSize} disabled={list.isFetching} />
          </>
        )}
      </div>
    </>
  );
}
