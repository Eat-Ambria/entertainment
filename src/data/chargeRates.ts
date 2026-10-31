/**
 * The signed-in user's Additional-charge master rates (0018): Transportation (fixed amount)
 * and Labour (rate × labour per package × packages), with optional per-venue rates (0019).
 * Read by the Guest Studio to pre-add charges, edited in Catalogue → Additional charges.
 * No cost or vendor data here.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase } from '@/lib/supabase';

export interface ChargeRate {
  id: string;
  code: string;
  label: string;
  mode: 'fixed' | 'per_package';
  rate: number;
  qty_per_package: number;
  auto_add: boolean;
  sort_order: number;
  /** Venue overrides; a venue not listed uses the default above. qty null = default qty. */
  venues: ChargeVenueRate[];
}

export interface ChargeVenueRate {
  venue_id: string;
  rate: number;
  qty_per_package: number | null;
}

export interface ChargeRateSave {
  rate: number;
  qty_per_package: number | null;
  venues: ChargeVenueRate[];
}

async function list(): Promise<ChargeRate[]> {
  const { data, error } = await requireSupabase()
    .from('charge_rates')
    .select(
      'id, code, label, mode, rate, qty_per_package, auto_add, sort_order, venues:charge_venue_rates!charge_venue_rates_charge_fkey(venue_id, rate, qty_per_package)',
    )
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as unknown as ChargeRate & { venues: { venue_id: string; rate: unknown; qty_per_package: unknown }[] | null };
    return {
      ...row,
      rate: Number(row.rate),
      qty_per_package: Number(row.qty_per_package),
      venues: (row.venues ?? []).map((v) => ({
        venue_id: v.venue_id,
        rate: Number(v.rate),
        qty_per_package: v.qty_per_package === null ? null : Number(v.qty_per_package),
      })),
    };
  });
}

/** Saves the default rate and all venue rates together (venues left out use the default). */
async function save(id: string, v: ChargeRateSave): Promise<void> {
  const { error } = await requireSupabase().rpc('save_charge_rate', {
    p_id: id,
    p_rate: v.rate,
    p_qty_per_package: v.qty_per_package,
    p_venues: v.venues,
  });
  if (error) throw error;
}

/** Object so tests can mock the Supabase calls. */
export const chargeRatesApi = { list, save };

export function useChargeRates() {
  return useQuery({ queryKey: ['charge-rates'], queryFn: () => chargeRatesApi.list(), staleTime: 5 * 60_000, retry: false });
}

export function useSaveChargeRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; save: ChargeRateSave }) => chargeRatesApi.save(v.id, v.save),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['charge-rates'] }),
  });
}
