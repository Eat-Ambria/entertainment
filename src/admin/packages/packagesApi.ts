/**
 * Packages data access (Supabase). Packages are shared by the whole team (0030).
 * Saving goes through the save_package RPC so the package and its element mapping are
 * written in one transaction; its functions (optional, 0024) via set_package_functions.
 * Function tags are matched by name, since each user has their own function list.
 */
import { requireSupabase } from '@/lib/supabase';
import { escapeLike } from '@/lib/dbErrors';
import { removeImage } from '@/lib/storage';

export interface PackageSummary {
  id: string;
  name: string;
  tier_id: string;
  tier_name: string;
  display_price: number | null;
  description: string | null;
  image_path: string | null;
  video_url: string | null;
  is_active: boolean;
  updated_at: string;
  element_count: number;
  elements_total: number;
  /** Function names the package is tagged with (empty = any function). */
  functions: string[];
}

export interface PackageItem {
  element_id: string;
  default_qty: number;
}

export interface PackageDetail extends Omit<PackageSummary, 'tier_name' | 'element_count' | 'elements_total' | 'functions'> {
  items: PackageItem[];
  /** Functions this package is meant for; empty = any function. */
  function_ids: string[];
}

export interface PackageInput {
  name: string;
  tier_id: string;
  display_price: number | null;
  description: string | null;
  image_path: string | null;
  video_url: string | null;
  is_active: boolean;
  items: PackageItem[];
  function_ids: string[];
}

export interface Tier {
  id: string;
  name: string;
}

export interface PickerElement {
  id: string;
  name: string;
  unit: string | null;
  default_rate: number;
  default_qty: number | null;
  image_path: string | null;
  is_active: boolean;
  remarks?: string | null;
}

export type PackageStatus = 'active' | 'inactive';

export interface PackageListParams {
  search: string;
  status: PackageStatus;
  tierId: string | null;
  page: number;
  pageSize: number;
}

const SUMMARY_COLUMNS =
  'id, name, tier_id, tier_name, display_price, description, image_path, video_url, is_active, updated_at, element_count, elements_total';

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const toSummary = (r: Record<string, unknown>): PackageSummary => ({
  ...(r as unknown as PackageSummary),
  display_price: num(r.display_price),
  elements_total: Number(r.elements_total ?? 0),
  element_count: Number(r.element_count ?? 0),
  functions: [],
});

/** Picker can hold every active element; capped to keep the payload bounded. */
export const PICKER_LIMIT = 1000;

export const packagesApi = {
  async list(p: PackageListParams): Promise<{ rows: PackageSummary[]; total: number }> {
    const from = (p.page - 1) * p.pageSize;
    let q = requireSupabase()
      .from('package_summaries')
      .select(SUMMARY_COLUMNS, { count: 'exact' })
      .eq('is_active', p.status === 'active');
    if (p.tierId) q = q.eq('tier_id', p.tierId);
    const term = p.search.trim();
    if (term) q = q.ilike('name', `%${escapeLike(term)}%`);
    const { data, error, count } = await q
      .order('name', { ascending: true })
      .order('tier_sort', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + p.pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []).map(toSummary);
    if (rows.length) {
      const fns = await requireSupabase()
        .from('package_functions')
        .select('package_id, function_name')
        .in(
          'package_id',
          rows.map((r) => r.id),
        );
      if (fns.error) throw fns.error;
      for (const f of fns.data ?? []) {
        const row = rows.find((r) => r.id === f.package_id);
        if (f.function_name && row && !row.functions.includes(f.function_name)) row.functions.push(f.function_name);
      }
      rows.forEach((r) => r.functions.sort());
    }
    return { rows, total: count ?? 0 };
  },

  async get(id: string): Promise<PackageDetail> {
    const sb = requireSupabase();
    const [pkg, items, fns, own] = await Promise.all([
      sb
        .from('packages')
        .select('id, name, tier_id, display_price, description, image_path, video_url, is_active, updated_at')
        .eq('id', id)
        .single(),
      sb.from('package_elements').select('element_id, default_qty').eq('package_id', id).order('sort_order'),
      sb.from('package_functions').select('function_name').eq('package_id', id),
      sb.from('function_options').select('id, name'),
    ]);
    if (pkg.error) throw pkg.error;
    if (items.error) throw items.error;
    if (fns.error) throw fns.error;
    if (own.error) throw own.error;
    // Tags may come from a teammate's function list: pick the signed-in user's function of the same name.
    const tagged = new Set((fns.data ?? []).map((f) => (f.function_name as string | null)?.toLowerCase()));
    return {
      ...(pkg.data as unknown as PackageDetail),
      display_price: num(pkg.data.display_price),
      items: (items.data ?? []).map((i) => ({ element_id: i.element_id, default_qty: Number(i.default_qty) })),
      function_ids: (own.data ?? []).filter((f) => tagged.has(f.name.toLowerCase())).map((f) => f.id as string),
    };
  },

  async save(id: string | null, input: PackageInput): Promise<string> {
    const { data, error } = await requireSupabase().rpc('save_package', {
      p_id: id,
      p_name: input.name,
      p_tier_id: input.tier_id,
      p_display_price: input.display_price,
      p_description: input.description,
      p_image_path: input.image_path,
      p_video_url: input.video_url,
      p_is_active: input.is_active,
      p_items: input.items.map((it, i) => ({ ...it, sort_order: i + 1 })),
    });
    if (error) throw error;
    const packageId = data as string;
    const fns = await requireSupabase().rpc('set_package_functions', { p_package_id: packageId, p_function_ids: input.function_ids });
    if (fns.error) throw fns.error;
    return packageId;
  },

  /** Permanent delete. Saved quotes keep their snapshot. Cleans up the image. */
  async remove(id: string): Promise<void> {
    const { data, error } = await requireSupabase().rpc('delete_package', { p_id: id });
    if (error) throw error;
    await removeImage('package-images', (data as { image_path: string | null } | null)?.image_path);
  },

  async setActive(id: string, active: boolean): Promise<void> {
    const { error } = await requireSupabase().from('packages').update({ is_active: active }).eq('id', id);
    if (error) throw error;
  },

  async tiers(): Promise<Tier[]> {
    const { data, error } = await requireSupabase()
      .from('tiers')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order');
    if (error) throw error;
    return data ?? [];
  },

  /** Active elements, plus any archived ones already in the package being edited. */
  async pickerElements(includeIds: string[] = []): Promise<PickerElement[]> {
    const sb = requireSupabase();
    const cols = 'id, name, unit, selling_rate, default_qty, image_path, is_active, remarks';
    const active = await sb.from('elements').select(cols).eq('is_active', true).order('name').limit(PICKER_LIMIT);
    if (active.error) throw active.error;
    let extra: typeof active.data = [];
    if (includeIds.length) {
      const res = await sb.from('elements').select(cols).in('id', includeIds).eq('is_active', false);
      if (res.error) throw res.error;
      extra = res.data ?? [];
    }
    return [...(active.data ?? []), ...extra].map(({ selling_rate, ...e }) => ({
      ...e,
      default_rate: Number(selling_rate), // guest rate (rate × multiplier)
      default_qty: num(e.default_qty),
    }));
  },
};
