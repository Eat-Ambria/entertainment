/**
 * Pagination bar used under every server-paginated table.
 */
import { memo } from 'react';
import { PAGE_SIZES, pageWindow, rangeLabel, totalPages } from '@/lib/pagination';
import { Icon } from './Icon';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  disabled?: boolean;
}

const btn =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm disabled:cursor-not-allowed disabled:opacity-40';

export const Pagination = memo(function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  disabled = false,
}: PaginationProps) {
  const pages = totalPages(total, pageSize);
  const current = Math.min(page, pages);

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm text-slate-600 sm:flex-row"
    >
      <div className="flex items-center gap-3">
        <span>{rangeLabel({ page: current, pageSize }, total)}</span>
        {onPageSizeChange && (
          <label className="flex items-center gap-1">
            <span className="sr-only">Rows per page</span>
            <select
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
              value={pageSize}
              disabled={disabled}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s} / page
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={`${btn} hover:bg-slate-100`}
          onClick={() => onPageChange(current - 1)}
          disabled={disabled || current <= 1}
          aria-label="Previous page"
        >
          <Icon name="chevronLeft" size={16} />
        </button>
        {pageWindow(current, pages).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1 text-slate-400">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={`${btn} ${p === current ? 'bg-brand-600 font-medium text-white' : 'hover:bg-slate-100'}`}
              onClick={() => onPageChange(p)}
              disabled={disabled}
              aria-current={p === current ? 'page' : undefined}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          className={`${btn} hover:bg-slate-100`}
          onClick={() => onPageChange(current + 1)}
          disabled={disabled || current >= pages}
          aria-label="Next page"
        >
          <Icon name="chevronRight" size={16} />
        </button>
      </div>
    </nav>
  );
});
