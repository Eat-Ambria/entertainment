/**
 * Quote Ledger data access (internal). Lists are server-paginated; detail adds internal
 * information the guest never sees (status history, rate overrides, source).
 */
import { requireSupabase } from '@/lib/supabase';
import { ilikeAny } from '@/lib/postgrestFilters';

export type QuoteStatus = 'draft' | 'sent' | 'confirmed' | 'cancelled';

export interface LedgerRow {
  id: string;
  quote_no: string;
  status: QuoteStatus;
  guest_name: string;
  guest_phone: string | null;
  function_name: string;
  package_name: string | null;
  package_tier: string | null;
  event_date: string | null;
  final_total: number;
  created_at: string;
}

export interface LedgerParams {
  search: string;
  status: QuoteStatus | null;
  functionName: string | null;
  packageId: string | null;
  from: string | null; // YYYY-MM-DD (created date, IST)
  to: string | null;
  page: number;
  pageSize: number;
}

export interface QuoteInternal {
  id: string;
  quote_no: string;
  status: QuoteStatus;
  source: 'manual' | 'lms_lead' | 'lms_contract';
  source_ref: string | null;
  created_at: string;
  updated_at: string;
  /** by = the teammate who opened / edited someone else's quote (viewed_by_other / edited_by_other). */
  history: { at: string; action: string; from: string; to: string; sentCount: number | null; by: string | null }[];
  overrides: { element_name: string; old_rate: number | null; new_rate: number; changed_at: string }[];
}

const ROW_COLUMNS =
  'id, quote_no, status, guest_name, guest_phone, function_name, package_name, package_tier, event_date, final_total, created_at';

/** IST day boundaries as ISO timestamps for created_at filters. */
export function istDayStart(date: string): string {
  return `${date}T00:00:00+05:30`;
}
export function istDayEnd(date: string): string {
  return `${date}T23:59:59.999+05:30`;
}

export const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
};

export const STATUS_FLOW: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  sent: ['confirmed', 'cancelled'], // legacy only — no quote can be Sent any more
  confirmed: ['cancelled'],
  cancelled: [],
};

export const quoteLedgerApi = {
  async list(p: LedgerParams): Promise<{ rows: LedgerRow[]; total: number }> {
    const from = (p.page - 1) * p.pageSize;
    // Package filter matches ANY package in the quote (quote_packages), via an inner-joined embed.
    const columns = p.packageId
      ? `${ROW_COLUMNS}, quote_packages!quote_packages_owner_id_quote_id_fkey!inner(package_id)`
      : ROW_COLUMNS;
    let q = requireSupabase().from('quotes').select(columns, { count: 'exact' });
    if (p.status) q = q.eq('status', p.status);
    if (p.functionName) q = q.eq('function_name', p.functionName);
    if (p.packageId) q = q.eq('quote_packages.package_id', p.packageId);
    if (p.from) q = q.gte('created_at', istDayStart(p.from));
    if (p.to) q = q.lte('created_at', istDayEnd(p.to));
    const term = p.search.trim();
    if (term) q = q.or(ilikeAny(['quote_no', 'guest_name', 'guest_phone'], term));
    const { data, error, count } = await q
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + p.pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as (LedgerRow & { quote_packages?: unknown })[];
    return {
      rows: rows.map((r) => {
        const row = { ...r, final_total: Number(r.final_total) };
        delete row.quote_packages; // only present to filter by package
        return row as LedgerRow;
      }),
      total: count ?? 0,
    };
  },

  async packages(): Promise<{ id: string; label: string }[]> {
    const { data, error } = await requireSupabase().from('package_summaries').select('id, name, tier_name').order('name');
    if (error) throw error;
    return (data ?? []).map((p) => ({ id: p.id, label: `${p.name} · ${p.tier_name}` }));
  },

  async internal(id: string): Promise<QuoteInternal> {
    const sb = requireSupabase();
    const [q, audit, overrides] = await Promise.all([
      sb.from('quotes').select('id, quote_no, status, source, source_ref, created_at, updated_at').eq('id', id).single(),
      sb.from('audit_log').select('at, action, old_data, new_data').eq('table_name', 'quotes').eq('row_id', id).order('at', { ascending: false }),
      sb
        .from('rate_change_logs')
        .select('element_name, old_rate, new_rate, changed_at')
        .eq('quote_id', id)
        .eq('change_type', 'quote_override')
        .order('changed_at', { ascending: false }),
    ]);
    for (const r of [q, audit, overrides]) if (r.error) throw r.error;
    return {
      ...(q.data as Omit<QuoteInternal, 'history' | 'overrides'>),
      history: (audit.data ?? []).map((a) => ({
        at: a.at,
        action: a.action,
        from: (a.old_data as { status?: string } | null)?.status ?? '',
        to: (a.new_data as { status?: string } | null)?.status ?? '',
        sentCount: (a.new_data as { sent_count?: number } | null)?.sent_count ?? null,
        by: (a.new_data as { actor_name?: string } | null)?.actor_name ?? null,
      })),
      overrides: (overrides.data ?? []).map((o) => ({
        ...o,
        old_rate: o.old_rate === null ? null : Number(o.old_rate),
        new_rate: Number(o.new_rate),
      })),
    };
  },

  async setStatus(id: string, status: QuoteStatus): Promise<void> {
    const { error } = await requireSupabase().from('quotes').update({ status }).eq('id', id);
    if (error) throw error;
  },
};
