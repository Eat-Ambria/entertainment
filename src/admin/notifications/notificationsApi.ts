/**
 * Workspace notifications (bell in the header), built from data the user can already read:
 * - teammates who opened or edited one of your manual quotes (audit log, last 14 days),
 * - your events in the next 7 days (draft / sent / confirmed),
 * - how many of your drafts are waiting for a follow-up.
 * Object so tests can mock the Supabase calls.
 */
import { useQuery } from '@tanstack/react-query';
import { requireSupabase } from '@/lib/supabase';

export interface TeamActivity {
  id: string;
  quoteId: string;
  quoteNo: string;
  guestName: string;
  action: 'viewed_by_other' | 'edited_by_other';
  by: string;
  at: string;
}

export interface UpcomingNotice {
  id: string;
  quoteNo: string;
  guestName: string;
  functionName: string;
  eventDate: string;
}

export interface Notifications {
  activity: TeamActivity[];
  upcoming: UpcomingNotice[];
  drafts: number;
}

const ACTIVITY_DAYS = 14;
const UPCOMING_DAYS = 7;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function load(today: string): Promise<Notifications> {
  const sb = requireSupabase();
  const since = new Date(Date.now() - ACTIVITY_DAYS * 86_400_000).toISOString();
  const [audit, upcoming, drafts] = await Promise.all([
    sb
      .from('audit_log')
      .select('id, row_id, action, new_data, at')
      .eq('table_name', 'quotes')
      .in('action', ['viewed_by_other', 'edited_by_other'])
      .gte('at', since)
      .order('at', { ascending: false })
      .limit(10),
    sb
      .from('quotes')
      .select('id, quote_no, guest_name, function_name, event_date')
      .gte('event_date', today)
      .lte('event_date', addDays(today, UPCOMING_DAYS))
      .in('status', ['draft', 'sent', 'confirmed'])
      .order('event_date', { ascending: true })
      .limit(5),
    sb.from('quotes').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
  ]);
  for (const r of [audit, upcoming, drafts]) if (r.error) throw r.error;

  // Quote numbers for the activity rows (your own quotes, so RLS lets you read them).
  const ids = [...new Set((audit.data ?? []).map((a) => a.row_id as string))];
  const quotes = new Map<string, { quote_no: string; guest_name: string }>();
  if (ids.length) {
    const q = await sb.from('quotes').select('id, quote_no, guest_name').in('id', ids);
    if (q.error) throw q.error;
    for (const r of q.data ?? []) quotes.set(r.id, r);
  }

  return {
    activity: (audit.data ?? []).flatMap((a) => {
      const q = quotes.get(a.row_id as string);
      if (!q) return [];
      return [
        {
          id: a.id as string,
          quoteId: a.row_id as string,
          quoteNo: q.quote_no,
          guestName: q.guest_name,
          action: a.action as TeamActivity['action'],
          by: (a.new_data as { actor_name?: string } | null)?.actor_name ?? 'A teammate',
          at: a.at as string,
        },
      ];
    }),
    upcoming: (upcoming.data ?? []).map((r) => ({
      id: r.id,
      quoteNo: r.quote_no,
      guestName: r.guest_name,
      functionName: r.function_name,
      eventDate: r.event_date,
    })),
    drafts: drafts.count ?? 0,
  };
}

export const notificationsApi = { load };

export function useNotifications(today: string) {
  return useQuery({
    queryKey: ['quotes', 'notifications', today],
    queryFn: () => notificationsApi.load(today),
    refetchInterval: 5 * 60 * 1000,
    retry: false,
  });
}
