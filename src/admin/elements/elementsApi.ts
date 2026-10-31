/**
 * Elements data access (Supabase). RLS limits every call to the signed-in user's rows.
 * Lists are server-paginated and select only the columns the screens need.
 */
import { requireSupabase } from '@/lib/supabase';
import { escapeLike } from '@/lib/dbErrors';
import { removeImage } from '@/lib/storage';

export interface Element {
  id: string;
  name: string;
  unit: string | null;
  default_rate: number;
  /** Rate multiplier (workspace only). Guests see selling_rate = default_rate × multiplier. */
  multiplier: number;
  selling_rate: number;
  default_qty: number | null;
  /** Where this element is used. Shown to guests under the element name (Studio, quotation, PDF). */
  remarks: string | null;
  image_path: string | null;
  is_active: boolean;
  updated_at: string;
}

export interface ElementInput {
  name: string;
  unit: string | null;
  default_rate: number;
  multiplier: number;
  default_qty: number | null;
  remarks: string | null;
  image_path: string | null;
}

export type ElementStatus = 'active' | 'archived';
export type ElementSort = 'name' | 'rate_desc' | 'rate_asc' | 'updated';

export interface ElementListParams {
  search: string;
  status: ElementStatus;
  sort: ElementSort;
  page: number;
  pageSize: number;
}

export interface RateLogEntry {
  id: string;
  old_rate: number | null;
  new_rate: number;
  reason: string | null;
  changed_at: string;
}

const COLUMNS = 'id, name, unit, default_rate, multiplier, selling_rate, default_qty, remarks, image_path, is_active, updated_at';

const SORTS: Record<ElementSort, { column: string; ascending: boolean }> = {
  name: { column: 'name', ascending: true },
  rate_desc: { column: 'default_rate', ascending: false },
  rate_asc: { column: 'default_rate', ascending: true },
  updated: { column: 'updated_at', ascending: false },
};

const toElement = (row: Record<string, unknown>): Element => ({
  ...(row as unknown as Element),
  default_rate: Number(row.default_rate),
  multiplier: row.multiplier === null || row.multiplier === undefined ? 1 : Number(row.multiplier),
  selling_rate: Number(row.selling_rate ?? row.default_rate),
  default_qty: row.default_qty === null ? null : Number(row.default_qty),
});

export const elementsApi = {
  async list(p: ElementListParams): Promise<{ rows: Element[]; total: number }> {
    const from = (p.page - 1) * p.pageSize;
    const sort = SORTS[p.sort];
    let q = requireSupabase()
      .from('elements')
      .select(COLUMNS, { count: 'exact' })
      .eq('is_active', p.status === 'active');
    const term = p.search.trim();
    if (term) q = q.ilike('name', `%${escapeLike(term)}%`);
    const { data, error, count } = await q
      .order(sort.column, { ascending: sort.ascending })
      .order('id', { ascending: true })
      .range(from, from + p.pageSize - 1);
    if (error) throw error;
    return { rows: (data ?? []).map(toElement), total: count ?? 0 };
  },

  async create(input: ElementInput): Promise<Element> {
    const { data, error } = await requireSupabase().from('elements').insert(input).select(COLUMNS).single();
    if (error) throw error;
    return toElement(data);
  },

  async update(id: string, input: ElementInput, reason: string | null): Promise<Element> {
    const { data, error } = await requireSupabase().rpc('update_element', {
      p_id: id,
      p_name: input.name,
      p_unit: input.unit,
      p_default_rate: input.default_rate,
      p_default_qty: input.default_qty,
      p_image_path: input.image_path,
      p_unit_cost: null, // not used any more — the Default rate is the cost (0026)
      p_reason: reason,
      p_remarks: input.remarks,
      p_multiplier: input.multiplier,
    });
    if (error) throw error;
    return toElement(data as Record<string, unknown>);
  },

  /** Permanent delete (refused while in a package or with vendor history). Cleans up the image. */
  async remove(id: string): Promise<void> {
    const { data, error } = await requireSupabase().rpc('delete_element', { p_id: id });
    if (error) throw error;
    await removeImage('element-images', (data as { image_path: string | null } | null)?.image_path);
  },

  async setActive(id: string, active: boolean): Promise<void> {
    const { error } = await requireSupabase().from('elements').update({ is_active: active }).eq('id', id);
    if (error) throw error;
  },

  async rateHistory(elementId: string, limit = 5): Promise<RateLogEntry[]> {
    const { data, error } = await requireSupabase()
      .from('rate_change_logs')
      .select('id, old_rate, new_rate, reason, changed_at')
      .eq('element_id', elementId)
      .eq('change_type', 'master_rate')
      .order('changed_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => ({
      ...r,
      old_rate: r.old_rate === null ? null : Number(r.old_rate),
      new_rate: Number(r.new_rate),
    }));
  },
};
