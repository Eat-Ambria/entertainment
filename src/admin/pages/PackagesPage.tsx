/**
 * Packages list: cards with image, tier, element count and price; search, tier filter,
 * Active/Inactive tabs and server-side pagination. Packages are never filtered by function.
 */
import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { ImageThumb } from '@/components/ui/ImageThumb';
import { FormAlert } from '@/components/ui/FormAlert';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/toast';
import { usePagination } from '@/lib/usePagination';
import { useUrlSearch } from '@/lib/useUrlSearch';
import { formatINR } from '@/lib/money';
import { dbErrorMessage } from '@/lib/dbErrors';
import type { PackageStatus, PackageSummary } from '../packages/packagesApi';
import { useDeletePackage, usePackageList, useSetPackageActive, useTiers } from '../packages/usePackages';
import { TabButton } from '@/components/ui/TabButton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const linkBtn =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700';

function PackageCard({
  pkg,
  onToggle,
  onDelete,
}: {
  pkg: PackageSummary;
  onToggle: (p: PackageSummary) => void;
  onDelete: (p: PackageSummary) => void;
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
      <Link to={pkg.id} className="relative block" aria-label={`Edit ${pkg.name}`}>
        <ImageThumb bucket="package-images" path={pkg.image_path} alt="" fill aspect="aspect-16/9" />
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-brand-700 shadow-sm">
          {pkg.tier_name}
        </span>
        {!pkg.is_active && (
          <span className="absolute right-3 top-3 rounded-full bg-slate-900/80 px-2.5 py-1 text-xs font-medium text-white">
            Inactive
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <Link to={pkg.id} className="font-semibold text-slate-900 hover:text-brand-700">
            {pkg.name}
          </Link>
          <p className="mt-0.5 text-sm text-slate-500">
            {pkg.element_count} {pkg.element_count === 1 ? 'element' : 'elements'}
          </p>
        </div>
        <ul className="flex flex-wrap gap-1.5" aria-label={`Functions for ${pkg.name}`}>
          {pkg.functions.length ? (
            pkg.functions.map((f) => (
              <li key={f} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                {f}
              </li>
            ))
          ) : (
            <li className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">All functions</li>
          )}
        </ul>
        <dl className="mt-auto grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Elements total</dt>
            <dd className="num font-semibold text-slate-900">{formatINR(pkg.elements_total)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Display price</dt>
            <dd className="num font-semibold text-slate-900">{pkg.display_price !== null ? formatINR(pkg.display_price) : <span className="font-normal text-slate-400">Not set</span>}</dd>
          </div>
        </dl>
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5">
        <Link to={pkg.id} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50">
          <Icon name="edit" size={14} /> Edit
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onToggle(pkg)}
            className="rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            {pkg.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button
            type="button"
            onClick={() => onDelete(pkg)}
            className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            aria-label={`Delete ${pkg.name}`}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function PackagesPage() {
  const [params, setParams] = useSearchParams();
  const { page, pageSize, setPage, setPageSize } = usePagination();
  const status: PackageStatus = params.get('status') === 'inactive' ? 'inactive' : 'active';
  const tierId = params.get('tier');
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


  const tiers = useTiers();
  const list = usePackageList({ search: urlSearch, status, tierId, page, pageSize });
  const setActive = useSetPackageActive();
  const del = useDeletePackage();
  const [deleting, setDeleting] = useState<PackageSummary | null>(null);

  async function remove(pkg: PackageSummary) {
    try {
      await del.mutateAsync(pkg.id);
      toast.success(`"${pkg.name}" deleted.`);
    } catch (err) {
      toast.error(dbErrorMessage(err));
    } finally {
      setDeleting(null);
    }
  }
  const rows = list.data?.rows ?? [];

  async function toggle(pkg: PackageSummary) {
    try {
      await setActive.mutateAsync({ id: pkg.id, active: !pkg.is_active });
      toast.success(pkg.is_active ? `"${pkg.name}" deactivated.` : `"${pkg.name}" is active again.`);
    } catch (err) {
      toast.error(dbErrorMessage(err, { '23505': `An active package named "${pkg.name}" already exists in this tier.` }));
    }
  }

  return (
    <>
      <PageHeader
        title="Packages"
        description="Curated packages your guests can choose from. Tag functions to show a package first for those events — every package stays available for every function."
        actions={
          <Link to="new" className={linkBtn}>
            <Icon name="plus" size={18} /> New package
          </Link>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Status" className="inline-flex self-start rounded-lg bg-slate-100 p-1 text-sm">
          {(['active', 'inactive'] as const).map((s) => (
            <TabButton key={s} selected={status === s} onClick={() => setParam('status', s === 'active' ? null : s)} className="capitalize">
              {s}
            </TabButton>
          ))}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="relative sm:w-72">
            <span className="sr-only">Search packages</span>
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search packages"
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </label>
          <label>
            <span className="sr-only">Tier</span>
            <select
              value={tierId ?? ''}
              onChange={(e) => setParam('tier', e.target.value || null)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All tiers</option>
              {(tiers.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {list.isError ? (
        <div>
          <FormAlert>{dbErrorMessage(list.error)}</FormAlert>
          <Button variant="secondary" className="mt-3" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      ) : list.isLoading ? (
        <Spinner label="Loading packages…" />
      ) : rows.length === 0 ? (
        urlSearch || tierId ? (
          <EmptyState icon="search" title="No packages match" description="Try a different search or tier." />
        ) : status === 'inactive' ? (
          <EmptyState icon="packages" title="No inactive packages" description="Packages you deactivate will appear here." />
        ) : (
          <EmptyState
            icon="packages"
            title="Create your first package"
            description="Group elements into a package — for example Royal Package (Premium) — and offer it to guests."
            action={
              <Link to="new" className={linkBtn}>
                <Icon name="plus" size={18} /> New package
              </Link>
            }
          />
        )
      ) : (
        <>
          <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
            {rows.map((p) => (
              <PackageCard key={p.id} pkg={p} onToggle={(x) => void toggle(x)} onDelete={setDeleting} />
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-slate-200 bg-white">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={list.data?.total ?? 0}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={list.isFetching}
            />
          </div>
        </>
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}" permanently?`}
          body={
            <>
              This can't be undone. Saved quotes keep their copy of this package and its elements. To hide it from guests
              without deleting, use <strong>Deactivate</strong>.
            </>
          }
          confirmLabel="Delete permanently"
          onConfirm={() => remove(deleting)}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
