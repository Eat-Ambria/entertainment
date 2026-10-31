/**
 * P&L data access (internal). Totals come from the pnl_totals RPC (computed in SQL over
 * every matching quote, not just the visible page); the table reads the quote_pnl view
 * page by page; line detail reads quote_item_pnl.
 */
import { requireSupabase } from '@/lib/supabase';
import type { QuoteStatus } from '../quotes/quoteLedgerApi';

export type StatusFilter = 'confirmed' | 'draft' | 'all';

export const STATUS_FILTERS: { value: StatusFilter; label: string; statuses: QuoteStatus[] }[] = [
  { value: 'confirmed', label: 'Confirmed', statuses: ['confirmed'] },
  { value: 'draft', label: 'Draft', statuses: ['draft'] },
  { value: 'all', label: 'All except cancelled', statuses: ['draft', 'confirmed'] },
];

export interface PnlFilters {
  status: StatusFilter;
  from: string | null; // event date
  to: string | null;
  functionName: string | null;
  packageId: string | null;
}

export interface PnlTotals {
  quotes: number;
  complete_quotes: number;
  incomplete_quotes: number;
  elements_selling: number;
  elements_cost: number;
  profit: number;
  margin_pct: number | null;
  charges_total: number;
  all_selling: number;
}

export interface PnlRow {
  id: string;
  quote_no: string;
  status: QuoteStatus;
  event_date: string | null;
  guest_name: string;
  function_name: string;
  package_name: string | null;
  elements_selling: number;
  charges_total: number;
  known_cost: number;
  missing_cost_lines: number;
  elements_cost: number | null;
  profit: number | null;
  margin_pct: number | null;
}

export interface PnlLine {
  id: string;
  element_name: string;
  unit: string | null;
  qty: number;
  rate: number;
  selling: number;
  unit_cost: number | null;
  cost_source: 'base_rate' | 'fixed' | 'vendor' | null;
  cost: number | null;
  profit: number | null;
  margin_pct: number | null;
  package_name: string | null;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const statusesOf = (f: StatusFilter) => STATUS_FILTERS.find((s) => s.value === f)!.statuses;

/** Quote ids containing a package (quote_pnl is a view, so filter by id list). */
async function quoteIdsWithPackage(packageId: string): Promise<string[]> {
  const { data, error } = await requireSupabase().from('quote_packages').select('quote_id').eq('package_id', packageId).limit(2000);
  if (error) throw error;
  return [...new Set((data ?? []).map((r) => r.quote_id as string))];
}

export const pnlApi = {
  async totals(f: PnlFilters): Promise<PnlTotals> {
    const { data, error } = await requireSupabase().rpc('pnl_totals', {
      p_statuses: statusesOf(f.status),
      p_from: f.from,
      p_to: f.to,
      p_function: f.functionName,
      p_package_id: f.packageId,
    });
    if (error) throw error;
    const t = data as Record<string, unknown>;
    return {
      quotes: Number(t.quotes),
      complete_quotes: Number(t.complete_quotes),
      incomplete_quotes: Number(t.incomplete_quotes),
      elements_selling: Number(t.elements_selling),
      elements_cost: Number(t.elements_cost),
      profit: Number(t.profit),
      margin_pct: num(t.margin_pct),
      charges_total: Number(t.charges_total),
      all_selling: Number(t.all_selling),
    };
  },

  async list(f: PnlFilters, page: number, pageSize: number): Promise<{ rows: PnlRow[]; total: number }> {
    let q = requireSupabase()
      .from('quote_pnl')
      .select(
        'id, quote_no, status, event_date, guest_name, function_name, package_name, elements_selling, charges_total, known_cost, missing_cost_lines, elements_cost, profit, margin_pct',
        { count: 'exact' },
      )
      .in('status', statusesOf(f.status));
    if (f.from) q = q.gte('event_date', f.from);
    if (f.to) q = q.lte('event_date', f.to);
    if (f.functionName) q = q.eq('function_name', f.functionName);
    if (f.packageId) {
      const ids = await quoteIdsWithPackage(f.packageId);
      if (ids.length === 0) return { rows: [], total: 0 };
      q = q.in('id', ids);
    }
    const from = (page - 1) * pageSize;
    const { data, error, count } = await q
      .order('event_date', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    return {
      rows: (data ?? []).map((r) => ({
        ...(r as unknown as PnlRow),
        elements_selling: Number(r.elements_selling),
        charges_total: Number(r.charges_total),
        known_cost: Number(r.known_cost),
        missing_cost_lines: Number(r.missing_cost_lines),
        elements_cost: num(r.elements_cost),
        profit: num(r.profit),
        margin_pct: num(r.margin_pct),
      })),
      total: count ?? 0,
    };
  },

  async lines(quoteId: string): Promise<PnlLine[]> {
    const sb = requireSupabase();
    const [lines, packages] = await Promise.all([
      sb
        .from('quote_item_pnl')
        .select('id, quote_package_id, element_name, unit, qty, rate, selling, unit_cost, cost_source, cost, profit, margin_pct, sort_order')
        .eq('quote_id', quoteId)
        .order('sort_order'),
      sb.from('quote_packages').select('id, package_name').eq('quote_id', quoteId),
    ]);
    if (lines.error) throw lines.error;
    if (packages.error) throw packages.error;
    const names = new Map((packages.data ?? []).map((p) => [p.id as string, p.package_name as string]));
    return (lines.data ?? []).map((l) => ({
      id: l.id,
      element_name: l.element_name,
      unit: l.unit,
      qty: Number(l.qty),
      rate: Number(l.rate),
      selling: Number(l.selling),
      unit_cost: num(l.unit_cost),
      cost_source: l.cost_source,
      cost: num(l.cost),
      profit: num(l.profit),
      margin_pct: num(l.margin_pct),
      package_name: l.quote_package_id ? (names.get(l.quote_package_id) ?? null) : null,
    }));
  },
};
