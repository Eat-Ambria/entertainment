/**
 * Quote Ledger: every saved quotation, newest first. Search (quote no / guest / phone),
 * filters (status, function, package, created date range) and server-side pagination,
 * all kept in the URL. On phones the filters fold behind a "Filters" button.
 */
import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { useEventOptions } from '@/data/eventOptions';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { FormAlert } from '@/components/ui/FormAlert';
import { Button } from '@/components/ui/Button';
import { usePagination } from '@/lib/usePagination';
import { useUrlSearch } from '@/lib/useUrlSearch';
import { formatINR } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { dbErrorMessage } from '@/lib/dbErrors';
import { STUDIO_NEW_QUOTE } from '@/studio/steps';
import { STATUS_LABEL, type QuoteStatus } from '../quotes/quoteLedgerApi';
import { StatusBadge } from '../quotes/StatusBadge';
import { HERO_BTN } from '../heroButton';
import { useLedger, useLedgerPackages } from '../quotes/useQuoteLedger';

const STATUSES = (Object.keys(STATUS_LABEL) as QuoteStatus[]).filter((s) => s !== 'sent');
const isStatus = (v: string | null): v is QuoteStatus => (STATUSES as string[]).includes(v ?? '');
const isDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

const selectCls = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const labelCls = 'mb-1 block text-xs font-medium uppercase tracking-wider text-slate-500';

/** "Royal + Classic" / "Premium + Standard" (saved joined) → one line per package with its tier. */
function packageLines(names: string | null, tiers: string | null): { name: string; tier: string | null }[] {
  const n = (names ?? '').split(' + ').filter(Boolean);
  const t = (tiers ?? '').split(' + ');
  return n.map((name, i) => ({ name, tier: t.length === n.length ? (t[i] ?? null) : null }));
}

export default function QuoteLedgerPage() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const status = isStatus(params.get('status')) ? (params.get('status') as QuoteStatus) : null;
  const functionName = params.get('fn');
  const packageId = params.get('pkg');
  const from = isDate(params.get('from'));
  const to = isDate(params.get('to'));
  const { input: searchInput, setInput: setSearchInput, value: urlSearch, reset: resetSearch } = useUrlSearch();

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
  const list = useLedger({ search: urlSearch, status, functionName, packageId, from, to, page, pageSize });
  const rows = list.data?.rows ?? [];
  const filtered = Boolean(urlSearch || status || functionName || packageId || from || to);
  const activeFilters = [status, functionName, packageId, from, to].filter(Boolean).length;
  const [showFilters, setShowFilters] = useState(false);
  const createdBy = profile?.full_name || 'You';

  return (
    <>
      <PageHeader
        title="Quote Ledger"
        actions={
          <Link to={STUDIO_NEW_QUOTE} className={HERO_BTN}>
            <Icon name="plus" size={18} /> New quote
          </Link>
        }
      />

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-3 border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search quotes</span>
              <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Quote no, guest or phone"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            {/* Phones only: filters fold away so the list is visible straight away. */}
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              aria-controls="ledger-filters"
              className={`relative shrink-0 rounded-lg border px-3 py-2 text-sm font-medium sm:hidden ${
                showFilters || activeFilters ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-300 text-slate-600'
              }`}
            >
              Filters
              {activeFilters > 0 && (
                <span className="num ml-1.5 rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">{activeFilters}</span>
              )}
            </button>
            {filtered && (
              <button
                type="button"
                onClick={() => {
                  resetSearch();
                  setParams({});
                }}
                className="shrink-0 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                Clear filters
              </button>
            )}
          </div>
          <div id="ledger-filters" className={`${showFilters ? 'grid' : 'hidden'} grid-cols-2 gap-3 sm:grid sm:grid-cols-3 lg:grid-cols-5`}>
            <label className="min-w-0">
              <span className={labelCls}>Status</span>
              <select value={status ?? ''} onChange={(e) => setParam('status', e.target.value || null)} className={selectCls}>
                <option value="">All statuses</option>
                {STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {STATUS_LABEL[st]}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0">
              <span className={labelCls}>Function</span>
              <select value={functionName ?? ''} onChange={(e) => setParam('fn', e.target.value || null)} className={selectCls}>
                <option value="">All functions</option>
                {(options.data?.functions ?? []).map((f) => (
                  <option key={f.id} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 min-w-0 sm:col-span-1">
              <span className={labelCls}>Package</span>
              <select value={packageId ?? ''} onChange={(e) => setParam('pkg', e.target.value || null)} className={selectCls}>
                <option value="">All packages</option>
                {(packages.data ?? []).map((pk) => (
                  <option key={pk.id} value={pk.id}>
                    {pk.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-0">
              <span className={labelCls}>From date</span>
              <input type="date" value={from ?? ''} max={to ?? undefined} onChange={(e) => setParam('from', e.target.value || null)} className={selectCls} />
            </label>
            <label className="min-w-0">
              <span className={labelCls}>To date</span>
              <input type="date" value={to ?? ''} min={from ?? undefined} onChange={(e) => setParam('to', e.target.value || null)} className={selectCls} />
            </label>
          </div>
          <p className={`${showFilters ? 'block' : 'hidden'} text-xs text-slate-400 sm:block`}>Dates filter by when the quote was created.</p>
        </div>

        {list.isError ? (
          <div className="p-6">
            <FormAlert>{dbErrorMessage(list.error)}</FormAlert>
            <Button variant="secondary" className="mt-3" onClick={() => void list.refetch()}>
              Try again
            </Button>
          </div>
        ) : list.isLoading ? (
          <Spinner label="Loading quotes…" />
        ) : rows.length === 0 ? (
          <div className="p-6">
            {filtered ? (
              <EmptyState icon="search" title="No quotes match" description="Try different filters." />
            ) : (
              <EmptyState
                icon="ledger"
                title="No quotes yet"
                description="Quotes you save in the Guest Studio appear here."
                action={
                  <Link to={STUDIO_NEW_QUOTE} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                    Create a quote
                  </Link>
                }
              />
            )}
          </div>
        ) : (
          <>
            <div className={`overflow-x-auto ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
              <table className="w-full min-w-200 text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Quote</th>
                    <th className="px-4 py-3">Guest</th>
                    <th className="px-4 py-3">Event</th>
                    <th className="px-4 py-3">Packages</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((q) => (
                    <tr
                      key={q.id}
                      className="group transition-[background-color,box-shadow] duration-200 ease-premium hover:bg-brand-50/70 hover:shadow-[inset_3px_0_0_var(--color-brand-500)]"
                    >
                      <td className="px-4 py-3">
                        <Link to={q.id} className="num inline-block font-medium text-brand-700 transition-transform duration-200 ease-premium group-hover:translate-x-1 hover:text-brand-900">
                          {q.quote_no}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{q.guest_name}</td>
                      <td className="px-4 py-3">
                        <p className="text-slate-700">{q.function_name}</p>
                        {q.event_date && <p className="text-xs text-slate-500">{formatDate(q.event_date)}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <ul className="space-y-0.5">
                          {packageLines(q.package_name, q.package_tier).map((pk, i) => (
                            <li key={`${pk.name}-${i}`} className="text-slate-700">
                              {pk.name}
                              {pk.tier && <span className="ml-1.5 text-xs text-slate-400">· {pk.tier}</span>}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="num px-4 py-3 text-right font-semibold text-slate-900">{formatINR(q.final_total)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={q.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">
                        {formatDate(q.created_at)}
                        <span className="block text-xs text-slate-400">by {createdBy}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={list.data?.total ?? 0}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={list.isFetching}
            />
          </>
        )}
      </div>
    </>
  );
}
