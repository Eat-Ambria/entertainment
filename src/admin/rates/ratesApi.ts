/**
 * Rate History data access (internal).
 * - Vendor purchase rates: `vendor_rate_latest` (one old → new row per element + vendor),
 *   with the full list per pair from `vendor_rate_history`. Offset pages.
 * - Master-rate changes and quote overrides: `rate_change_logs`, keyset "load more"
 *   (append-only and fast-growing).
 */
import { requireSupabase } from '@/lib/supabase';
import { keysetAfterDesc } from '@/lib/postgrestFilters';

export type Trend = 'new' | 'up' | 'down' | 'same' | 'void';

export interface VendorRateRow {
  id: string;
  element_id: string;
  element_name: string;
  vendor_id: string;
  vendor_name: string;
  purchase_date: string;
  qty: number;
  unit: string | null;
  rate_per_unit: number;
  remarks: string | null;
  logged_by_name: string | null;
  logged_at: string;
  void_reason: string | null;
  trend: Trend;
}

/** Latest purchase per element + vendor, with the one before it. */
export interface VendorLatestRow {
  id: string;
  element_id: string;
  element_name: string;
  vendor_id: string;
  vendor_name: string;
  new_date: string;
  new_rate: number;
  old_date: string | null;
  old_rate: number | null;
  qty: number;
  unit: string | null;
  purchases: number;
  trend: Exclude<Trend, 'void'>;
}

export interface RateLogRow {
  id: string;
  element_name: string;
  old_rate: number | null;
  new_rate: number;
  reason: string | null;
  changed_at: string;
  quote_id: string | null;
  quote_no: string | null;
}

export interface Vendor {
  id: string;
  name: string;
}

export interface VendorEntryInput {
  element_id: string;
  vendor_id: string;
  purchase_date: string;
  qty: number;
  unit: string | null;
  rate_per_unit: number;
  remarks: string | null;
}

export const LOG_PAGE = 25;

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export const ratesApi = {
  async vendorLatest(p: { elementId: string | null; vendorId: string | null; page: number; pageSize: number }) {
    const from = (p.page - 1) * p.pageSize;
    let q = requireSupabase()
      .from('vendor_rate_latest')
      .select('id, element_id, element_name, vendor_id, vendor_name, new_date, new_rate, old_date, old_rate, qty, unit, purchases, trend', {
        count: 'exact',
      });
    if (p.elementId) q = q.eq('element_id', p.elementId);
    if (p.vendorId) q = q.eq('vendor_id', p.vendorId);
    const { data, error, count } = await q
      .order('new_date', { ascending: false })
      .order('element_name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + p.pageSize - 1);
    if (error) throw error;
    return {
      rows: (data ?? []).map((r) => ({
        ...r,
        new_rate: Number(r.new_rate),
        old_rate: n(r.old_rate),
        qty: Number(r.qty),
        purchases: Number(r.purchases),
      })) as VendorLatestRow[],
      total: count ?? 0,
    };
  },

  async vendorHistory(p: { elementId: string | null; vendorId: string | null; page: number; pageSize: number }) {
    const from = (p.page - 1) * p.pageSize;
    let q = requireSupabase()
      .from('vendor_rate_history')
      .select(
        'id, element_id, element_name, vendor_id, vendor_name, purchase_date, qty, unit, rate_per_unit, remarks, logged_by_name, logged_at, void_reason, trend',
        { count: 'exact' },
      );
    if (p.elementId) q = q.eq('element_id', p.elementId);
    if (p.vendorId) q = q.eq('vendor_id', p.vendorId);
    const { data, error, count } = await q
      .order('purchase_date', { ascending: false })
      .order('logged_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + p.pageSize - 1);
    if (error) throw error;
    return {
      rows: (data ?? []).map((r) => ({ ...r, qty: Number(r.qty), rate_per_unit: Number(r.rate_per_unit) })) as VendorRateRow[],
      total: count ?? 0,
    };
  },

  async logs(type: 'master_rate' | 'quote_override', cursor: { at: string; id: string } | null): Promise<RateLogRow[]> {
    let q = requireSupabase()
      .from('rate_change_logs')
      .select('id, element_name, old_rate, new_rate, reason, changed_at, quote_id, quotes(quote_no)')
      .eq('change_type', type);
    if (cursor) q = q.or(keysetAfterDesc('changed_at', cursor.at, cursor.id));
    const { data, error } = await q.order('changed_at', { ascending: false }).order('id', { ascending: false }).limit(LOG_PAGE);
    if (error) throw error;
    return (data ?? []).map((r) => {
      const quote = (Array.isArray(r.quotes) ? r.quotes[0] : r.quotes) as { quote_no: string } | null;
      return {
        id: r.id,
        element_name: r.element_name,
        old_rate: n(r.old_rate),
        new_rate: Number(r.new_rate),
        reason: r.reason,
        changed_at: r.changed_at,
        quote_id: r.quote_id,
        quote_no: quote?.quote_no ?? null,
      };
    });
  },

  async vendors(): Promise<Vendor[]> {
    const { data, error } = await requireSupabase().from('vendors').select('id, name').eq('is_active', true).order('name');
    if (error) throw error;
    return data ?? [];
  },

  async createVendor(name: string): Promise<Vendor> {
    const { data, error } = await requireSupabase().from('vendors').insert({ name }).select('id, name').single();
    if (error) throw error;
    return data;
  },

  async elements(): Promise<{ id: string; name: string; unit: string | null }[]> {
    const { data, error } = await requireSupabase().from('elements').select('id, name, unit').eq('is_active', true).order('name').limit(1000);
    if (error) throw error;
    return data ?? [];
  },

  async addEntry(input: VendorEntryInput): Promise<void> {
    const { error } = await requireSupabase().from('vendor_rate_entries').insert(input);
    if (error) throw error;
  },

  async voidEntry(id: string, reason: string): Promise<void> {
    const { error } = await requireSupabase().rpc('void_vendor_rate_entry', { p_id: id, p_reason: reason });
    if (error) throw error;
  },
};
