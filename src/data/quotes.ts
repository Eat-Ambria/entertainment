/**
 * Quotes for the Guest Studio: save (save_quote RPC) and read back a saved quote's
 * guest-safe snapshot. Never selects master_rate_at_quote, unit_cost_at_quote, source_raw
 * or notes — those are internal.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requireSupabase } from '@/lib/supabase';
import type { SaveQuotePayload } from '@/studio/quote/quoteTotals';

export interface GuestQuote {
  id: string;
  quote_no: string;
  status: 'draft' | 'sent' | 'confirmed' | 'cancelled';
  created_at: string;
  guest_name: string;
  guest_phone: string | null;
  function_name: string;
  venue_name: string | null;
  sub_venue_name: string | null;
  event_date: string | null;
  session_name: string | null;
  package_name: string | null;
  package_tier: string | null;
  elements_subtotal: number;
  charges_total: number;
  final_total: number;
  packages: { id: string; package_name: string; package_tier: string | null; subtotal: number; sort_order: number }[];
  items: {
    quote_package_id: string | null;
    element_name: string;
    remarks?: string | null;
    unit: string | null;
    qty: number;
    rate: number;
    amount: number;
    is_included: boolean;
    sort_order: number;
  }[];
  charges: { description: string; amount: number; sort_order: number }[];
}

async function save(payload: SaveQuotePayload): Promise<{ id: string; quote_no: string }> {
  const { data, error } = await requireSupabase().rpc('save_quote', { p_payload: payload });
  if (error) throw error;
  return data as { id: string; quote_no: string };
}

async function getGuestQuote(id: string): Promise<GuestQuote> {
  // Own quotes, or a teammate's manual quote (same guest-safe columns).
  const { data, error } = await requireSupabase().rpc('team_quote', { p_id: id });
  if (error) throw error;
  const r = data as Record<string, unknown> & {
    quote_packages: GuestQuote['packages'] | null;
    quote_items: GuestQuote['items'];
    quote_charges: GuestQuote['charges'];
  };
  const n = (v: unknown) => Number(v ?? 0);
  return {
    ...(r as unknown as GuestQuote),
    elements_subtotal: n(r.elements_subtotal),
    charges_total: n(r.charges_total),
    final_total: n(r.final_total),
    packages: [...(r.quote_packages ?? [])]
      .map((p) => ({ ...p, subtotal: n(p.subtotal) }))
      .sort((a, b) => a.sort_order - b.sort_order),
    items: [...(r.quote_items ?? [])]
      .map((i) => ({ ...i, qty: n(i.qty), rate: n(i.rate), amount: n(i.amount) }))
      .sort((a, b) => a.sort_order - b.sort_order),
    charges: [...(r.quote_charges ?? [])].map((c) => ({ ...c, amount: n(c.amount) })).sort((a, b) => a.sort_order - b.sort_order),
  };
}

/** Object so tests can mock the Supabase calls. */
export const quotesApi = { save, getGuestQuote };

export function useSaveQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: SaveQuotePayload) => quotesApi.save(p),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ['quotes'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'quote', r.id] });
    },
  });
}

export function useGuestQuote(id: string | undefined) {
  return useQuery({
    queryKey: ['studio', 'quote', id],
    queryFn: () => quotesApi.getGuestQuote(id!),
    enabled: Boolean(id),
  });
}
