/**
 * Guest Studio search: the signed-in user's own saved quotes for manually entered guests
 * (not from LMS), so a repeat guest can be found again from the Studio. Guest-safe columns
 * only — no amounts. Matches the guest name, phone or quote number; newest first.
 */
import { requireSupabase } from '@/lib/supabase';
import { escapeLike } from '@/lib/dbErrors';
import type { GuestForm } from '@/studio/guest/guestValidation';

export interface SavedGuestQuote {
  id: string;
  quoteNo: string;
  status: 'draft' | 'sent' | 'confirmed' | 'cancelled';
  guestName: string;
  phone: string | null;
  functionName: string | null;
  venueName: string | null;
  eventDate: string | null;
  /** The saved guest & event, ready for the form. */
  form: GuestForm;
}

export const SAVED_GUEST_LIMIT = 5;

async function search(q: string): Promise<SavedGuestQuote[]> {
  // Characters that would break the PostgREST or() filter are dropped; the rest is matched literally.
  const term = escapeLike(q.trim().replace(/[,()*"]/g, ' ').trim());
  if (term.length < 3) return [];
  const digits = q.replace(/\D/g, '');
  const filters = [`guest_name.ilike.%${term}%`, `quote_no.ilike.%${term}%`];
  if (digits.length >= 3) filters.push(`guest_phone.ilike.%${digits}%`);

  const { data, error } = await requireSupabase()
    .from('quotes')
    .select('id, quote_no, status, guest_name, guest_phone, function_id, function_name, venue_id, venue_name, sub_venue_id, event_date, session_id')
    .eq('source', 'manual')
    .or(filters.join(','))
    .order('created_at', { ascending: false })
    .limit(SAVED_GUEST_LIMIT);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    quoteNo: r.quote_no,
    status: r.status,
    guestName: r.guest_name,
    phone: r.guest_phone,
    functionName: r.function_name,
    venueName: r.venue_name,
    eventDate: r.event_date,
    form: {
      guestName: r.guest_name ?? '',
      phone: r.guest_phone ?? '',
      functionId: r.function_id ?? '',
      venueId: r.venue_id ?? '',
      subVenueId: r.sub_venue_id ?? '',
      eventDate: r.event_date ?? '',
      sessionId: r.session_id ?? '',
    },
  }));
}

/** Object so tests can mock the Supabase call. */
export const savedGuestsApi = { search };
