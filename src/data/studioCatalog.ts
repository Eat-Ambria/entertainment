/**
 * Guest Studio catalogue reads. Selects ONLY guest-safe columns — names, tiers, images,
 * guest rates (selling_rate = rate × the element's multiplier, which is never read here),
 * default quantities and element remarks (where it is used). Never cost, vendor or internal data.
 * Every active package is returned regardless of the guest's function — packages tagged
 * with the guest's function just come first (studio_packages RPC).
 */
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { prefetchSignedUrls } from '@/lib/storage';
import { requireSupabase } from '@/lib/supabase';

export interface StudioPackage {
  id: string;
  name: string;
  tier_name: string;
  display_price: number | null;
  description: string | null;
  image_path: string | null;
  video_url: string | null;
  /** Tagged with the guest's function (shown first). */
  for_function?: boolean;
}

export interface StudioPackageLine {
  element_id: string;
  name: string;
  unit: string | null;
  image_path: string | null;
  default_rate: number;
  default_qty: number;
  remarks?: string | null;
}

export const STUDIO_PAGE_SIZE = 12;

/** All active packages, server-paginated; those tagged with `functionId` first. */
async function listActivePackages(page: number, functionId: string | null = null): Promise<{ rows: StudioPackage[]; total: number }> {
  const { data, error } = await requireSupabase().rpc('studio_packages', {
    p_function_id: functionId,
    p_offset: page * STUDIO_PAGE_SIZE,
    p_limit: STUDIO_PAGE_SIZE,
  });
  if (error) throw error;
  const rows = (data ?? []) as (StudioPackage & { total: number | string })[];
  return {
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      tier_name: r.tier_name,
      display_price: r.display_price === null ? null : Number(r.display_price),
      description: r.description,
      image_path: r.image_path,
      video_url: r.video_url,
      for_function: Boolean(r.for_function),
    })),
    total: rows.length ? Number(rows[0]!.total) : 0,
  };
}

async function packageLines(packageId: string): Promise<StudioPackageLine[]> {
  const { data, error } = await requireSupabase()
    .from('package_elements')
    .select('element_id, default_qty, sort_order, elements(name, unit, image_path, selling_rate, remarks)')
    .eq('package_id', packageId)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map((r) => {
    const el = (Array.isArray(r.elements) ? r.elements[0] : r.elements) as {
      name: string;
      unit: string | null;
      image_path: string | null;
      selling_rate: number;
      remarks: string | null;
    };
    return {
      element_id: r.element_id,
      name: el.name,
      unit: el.unit,
      image_path: el.image_path,
      default_rate: Number(el.selling_rate), // rate × element multiplier — the guest rate
      default_qty: Number(r.default_qty),
      remarks: el.remarks ?? null,
    };
  });
}

export interface StudioElement {
  id: string;
  name: string;
  unit: string | null;
  image_path: string | null;
  default_rate: number;
  default_qty: number | null;
  remarks?: string | null;
}

/** Active elements that can be added to a quote on top of a package (selling data only). */
async function activeElements(): Promise<StudioElement[]> {
  const { data, error } = await requireSupabase()
    .from('elements')
    .select('id, name, unit, image_path, selling_rate, default_qty, remarks')
    .eq('is_active', true)
    .order('name')
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map(({ selling_rate, ...e }) => ({ ...e, default_rate: Number(selling_rate), default_qty: e.default_qty === null ? null : Number(e.default_qty) }));
}

/** Object so tests can mock the Supabase calls. */
export const studioCatalogApi = { listActivePackages, packageLines, activeElements };

/** Re-read every time the Add element dialog opens, so an element just created in the Workspace
 * (even in another tab) shows up straight away; the cached list is shown meanwhile. */
export function useActiveElements(enabled: boolean) {
  return useQuery({
    queryKey: ['studio', 'elements'],
    queryFn: () => studioCatalogApi.activeElements(),
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

/** Query options shared by the Package step and the Guest step's prefetch. Each page's card
 * images are signed in one request before the page is shown. */
export function activePackagesQuery(qc: ReturnType<typeof useQueryClient>, functionId: string | null) {
  return {
    queryKey: ['studio', 'packages', functionId] as const,
    initialPageParam: 0,
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const page = await studioCatalogApi.listActivePackages(pageParam, functionId);
      await prefetchSignedUrls(qc, 'package-images', page.rows.map((r) => r.image_path), { preload: true });
      return page;
    },
  };
}

export function useActivePackages(functionId: string | null) {
  const qc = useQueryClient();
  return useInfiniteQuery({
    ...activePackagesQuery(qc, functionId),
    getNextPageParam: (last, pages) => (pages.length * STUDIO_PAGE_SIZE < last.total ? pages.length : undefined),
  });
}

/**
 * Loads the chosen packages' lines (same cache the Customise step reads) and signs + preloads
 * their element images, so Customise opens with everything ready — no loading swap mid-animation.
 */
export function prefetchPackageLines(qc: ReturnType<typeof useQueryClient>, packageIds: readonly string[]): void {
  for (const id of packageIds) {
    void qc
      .fetchQuery({ queryKey: ['studio', 'package-lines', id], queryFn: () => studioCatalogApi.packageLines(id), staleTime: 60_000 })
      .then((lines) => prefetchSignedUrls(qc, 'element-images', lines.map((l) => l.image_path), { preload: true }))
      .catch(() => undefined); // Customise loads (and reports) it again if this failed
  }
}

export function usePackageLines(packageId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['studio', 'package-lines', packageId],
    queryFn: () => studioCatalogApi.packageLines(packageId!),
    enabled: Boolean(packageId) && enabled,
  });
}
