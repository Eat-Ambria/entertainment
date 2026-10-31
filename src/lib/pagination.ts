/**
 * Server-side pagination helpers shared by every list screen.
 * Page state lives in the URL (?page=2&size=50) so views survive refresh.
 */
export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export interface PageState {
  page: number; // 1-based
  pageSize: number;
}

export function parsePageState(params: URLSearchParams): PageState {
  const rawPage = Number.parseInt(params.get('page') ?? '', 10);
  const rawSize = Number.parseInt(params.get('size') ?? '', 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = (PAGE_SIZES as readonly number[]).includes(rawSize) ? rawSize : DEFAULT_PAGE_SIZE;
  return { page, pageSize };
}

/** Inclusive [from, to] range for Supabase `.range(from, to)`. */
export function toRange({ page, pageSize }: PageState): [number, number] {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1];
}

export function totalPages(total: number, pageSize: number): number {
  if (total <= 0) return 1;
  return Math.ceil(total / pageSize);
}

/** Page numbers to render, with null for an ellipsis gap. */
export function pageWindow(current: number, total: number, span = 1): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total]);
  for (let p = current - span; p <= current + span; p++) {
    if (p > 1 && p < total) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev > 1) out.push(null);
    out.push(p);
  });
  return out;
}

export function rangeLabel(state: PageState, total: number): string {
  if (total === 0) return 'No results';
  const [from, to] = toRange(state);
  return `${from + 1}–${Math.min(to + 1, total)} of ${total}`;
}
