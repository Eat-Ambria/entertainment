/**
 * Guest Studio search: saved quotes for manually entered guests (not from LMS), so a repeat
 * guest can be found again from the Studio. By default only the signed-in user's own; with
 * `all`, every team member's too (e.g. when a colleague is on leave), each with who made it.
 * Goes through the team_manual_quotes RPC; guest-safe columns only — no amounts.
 * Matches the guest name, phone or quote number; newest first.
 */
import { requireSupabase } from '@/lib/supabase';
import { escapeLike } from '@/lib/dbErrors';

export interface SavedGuestQuote {
  id: string;
  quoteNo: string;
  status: 'draft' | 'sent' | 'confirmed' | 'cancelled';
  guestName: string;
  phone: string | null;
  functionName: string | null;
  venueName: string | null;
  eventDate: string | null;
  /** Who made the quote; `mine` = the signed-in user. */
  ownerName: string;
  mine: boolean;
}

async function search(q: string, all = false): Promise<SavedGuestQuote[]> {
  const term = escapeLike(q.trim());
  if (term.length < 3) return [];
  const { data, error } = await requireSupabase().rpc('team_manual_quotes', {
    p_term: term,
    p_digits: q.replace(/\D/g, ''),
    p_all: all,
  });
  if (error) throw error;
  return ((data ?? []) as Record<string, string | boolean | null>[]).map((r) => ({
    id: r.id as string,
    quoteNo: r.quote_no as string,
    status: r.status as SavedGuestQuote['status'],
    guestName: r.guest_name as string,
    phone: r.guest_phone as string | null,
    functionName: r.function_name as string | null,
    venueName: r.venue_name as string | null,
    eventDate: r.event_date as string | null,
    ownerName: r.owner_name as string,
    mine: Boolean(r.mine),
  }));
}

/** Object so tests can mock the Supabase call. */
export const savedGuestsApi = { search };
