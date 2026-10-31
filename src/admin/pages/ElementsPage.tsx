/**
 * Elements master list: search, Active/Archived tabs, sort, server-side pagination,
 * add/edit dialog and archive/restore with confirmation.
 * Filters live in the URL (?q=&status=&sort=&page=&size=) so the view survives refresh.
 */
import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { ImageThumb } from '@/components/ui/ImageThumb';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormAlert } from '@/components/ui/FormAlert';
import { toast } from '@/components/ui/toast';
import { usePagination } from '@/lib/usePagination';
import { useUrlSearch } from '@/lib/useUrlSearch';
import { formatINR } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { formatQty } from '@/lib/numbers';
import { dbErrorMessage, deleteErrorMessage } from '@/lib/dbErrors';
import type { Element, ElementSort, ElementStatus } from '../elements/elementsApi';
import { ElementFormDialog } from '../elements/ElementFormDialog';
import { useDeleteElement, useElementList, useSetElementActive } from '../elements/useElements';

const SORT_OPTIONS: { value: ElementSort; label: string }[] = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'rate_desc', label: 'Rate (high to low)' },
  { value: 'rate_asc', label: 'Rate (low to high)' },
  { value: 'updated', label: 'Recently updated' },
];

const isSort = (v: string | null): v is ElementSort => SORT_OPTIONS.some((o) => o.value === v);

export default function ElementsPage() {
  const [params, setParams] = useSearchParams();
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const status: ElementStatus = params.get('status') === 'archived' ? 'archived' : 'active';
  const sortParam = params.get('sort');
  const sort: ElementSort = isSort(sortParam) ? sortParam : 'name';

  const { input: searchInput, setInput: setSearchInput, value: urlSearch } = useUrlSearch();

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


  const list = useElementList({ search: urlSearch, status, sort, page, pageSize });
  const setActive = useSetElementActive();

  const [editing, setEditing] = useState<Element | null | 'new'>(null);
  const [confirming, setConfirming] = useState<Element | null>(null);
  const [deleting, setDeleting] = useState<Element | null>(null);
  const del = useDeleteElement();

  const rows = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const filtered = urlSearch.length > 0;

  async function remove(el: Element) {
    try {
      await del.mutateAsync(el.id);
      toast.success(`"${el.name}" deleted.`);
    } catch (err) {
      toast.error(deleteErrorMessage(err));
    } finally {
      setDeleting(null);
    }
  }

  async function toggleActive(el: Element) {
    try {
      await setActive.mutateAsync({ id: el.id, active: !el.is_active });
      toast.success(el.is_active ? `"${el.name}" archived.` : `"${el.name}" restored.`);
      setConfirming(null);
    } catch (err) {
      toast.error(
        dbErrorMessage(err, { '23505': `An active element named "${el.name}" already exists. Rename one first.` }),
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Elements"
        description="Your master list of elements: cost rate × multiplier = the rate guests see."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Icon name="plus" size={18} />
            Add element
          </Button>
        }
      />

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div role="tablist" aria-label="Status" className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
            {(['active', 'archived'] as const).map((s) => (
              <button
                key={s}
                role="tab"
                type="button"
                aria-selected={status === s}
                onClick={() => setParam('status', s === 'active' ? null : s)}
                className={`rounded-md px-3 py-1.5 font-medium capitalize ${
                  status === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative flex-1 sm:w-72">
              <span className="sr-only">Search elements</span>
              <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search elements"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </label>
            <label>
              <span className="sr-only">Sort by</span>
              <select
                value={sort}
                onChange={(e) => setParam('sort', e.target.value === 'name' ? null : e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {list.isError ? (
          <div className="p-6">
            <FormAlert>{dbErrorMessage(list.error)}</FormAlert>
            <Button variant="secondary" className="mt-3" onClick={() => void list.refetch()}>
              Try again
            </Button>
          </div>
        ) : list.isLoading ? (
          <Spinner label="Loading elements…" />
        ) : rows.length === 0 ? (
          <div className="p-6">
            {filtered ? (
              <EmptyState icon="search" title="No elements match your search" description={`Nothing found for "${urlSearch}".`} />
            ) : status === 'archived' ? (
              <EmptyState icon="archive" title="No archived elements" description="Archived elements will appear here." />
            ) : (
              <EmptyState
                icon="elements"
                title="Add your first element"
                description="Elements like Entrance Arch, Stage Backdrop or DJ make up your packages."
                action={
                  <Button onClick={() => setEditing('new')}>
                    <Icon name="plus" size={18} /> Add element
                  </Button>
                }
              />
            )}
          </div>
        ) : (
          <>
            <div className={`overflow-x-auto ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
              <table className="w-full min-w-160 text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3">Element</th>
                    <th className="px-4 py-3 text-right">Cost rate</th>
                    <th className="px-4 py-3 text-right">Multiplier</th>
                    <th className="px-4 py-3 text-right">Guest rate</th>
                    <th className="px-4 py-3 text-right">Default qty</th>
                    <th className="px-4 py-3">Remarks</th>
                    <th className="px-4 py-3">Updated</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((el) => (
                    <tr key={el.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <ImageThumb bucket="element-images" path={el.image_path} alt="" />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">{el.name}</p>
                            {el.unit && <p className="text-xs text-slate-500">per {el.unit}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="num px-4 py-3 text-right text-slate-600">{formatINR(el.default_rate)}</td>
                      <td className="num px-4 py-3 text-right text-slate-600">× {formatQty(el.multiplier)}</td>
                      <td className="num px-4 py-3 text-right font-semibold text-slate-900">{formatINR(el.selling_rate)}</td>
                      <td className="num px-4 py-3 text-right text-slate-600">{formatQty(el.default_qty, el.unit)}</td>
                      <td className="max-w-56 px-4 py-3 text-slate-600">
                        {el.remarks ? (
                          <p className="line-clamp-2" title={el.remarks}>
                            {el.remarks}
                          </p>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(el.updated_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {el.is_active && (
                            <button
                              type="button"
                              onClick={() => setEditing(el)}
                              className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                              aria-label={`Edit ${el.name}`}
                            >
                              <Icon name="edit" size={16} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => (el.is_active ? setConfirming(el) : void toggleActive(el))}
                            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                            aria-label={el.is_active ? `Archive ${el.name}` : `Restore ${el.name}`}
                          >
                            <Icon name={el.is_active ? 'archive' : 'restore'} size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(el)}
                            className="rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label={`Delete ${el.name}`}
                          >
                            <Icon name="trash" size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={list.isFetching}
            />
          </>
        )}
      </div>

      {editing && <ElementFormDialog element={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}" permanently?`}
          body={
            <>
              This can't be undone. Saved quotes and rate history keep their copy of this element. If you might need it
              again, <strong>Archive</strong> it instead.
            </>
          }
          confirmLabel="Delete permanently"
          onConfirm={() => remove(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
      {confirming && (
        <ConfirmDialog
          title={`Archive "${confirming.name}"?`}
          body={
            <>
              It will be hidden from new packages and quotes. Existing packages and saved quotes keep it, and you can
              restore it any time from the <strong>Archived</strong> tab.
            </>
          }
          confirmLabel="Archive"
          onConfirm={() => toggleActive(confirming)}
          onClose={() => setConfirming(null)}
        />
      )}
    </>
  );
}
