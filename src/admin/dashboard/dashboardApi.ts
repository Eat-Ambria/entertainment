/**
 * Dashboard reads that the Quote Ledger / P&L APIs don't already cover: the next events by event
 * date. Internal (Workspace only). Object so tests can mock the Supabase call.
 */
import { useQuery } from '@tanstack/react-query';
import { requireSupabase } from '@/lib/supabase';
import type { QuoteStatus } from '../quotes/quoteLedgerApi';

export interface UpcomingEvent {
  id: string;
  quote_no: string;
  guest_name: string;
  function_name: string;
  venue_name: string | null;
  event_date: string;
  status: QuoteStatus;
  final_total: number;
}

async function upcoming(fromDate: string, limit = 5): Promise<UpcomingEvent[]> {
  const { data, error } = await requireSupabase()
    .from('quotes')
    .select('id, quote_no, guest_name, function_name, venue_name, event_date, status, final_total')
    .gte('event_date', fromDate)
    .in('status', ['draft', 'confirmed'])
    .order('event_date', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...(r as UpcomingEvent), final_total: Number(r.final_total) }));
}

export const dashboardApi = { upcoming };

export function useUpcomingEvents(fromDate: string) {
  return useQuery({ queryKey: ['quotes', 'upcoming', fromDate], queryFn: () => dashboardApi.upcoming(fromDate), retry: false });
}
