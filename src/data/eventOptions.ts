/**
 * The signed-in user's own option lists (functions, venues, sub-venues, sessions) used by
 * the guest form; cached for a long time since they rarely change. The guest form can add a
 * venue / sub-venue that is written in LMS but missing here (ensureVenue / ensureSubVenue).
 * Shared by the Guest Studio and the workspace (no internal data in these lists).
 */
import { useQuery } from '@tanstack/react-query';
import { requireSupabase } from '@/lib/supabase';

export interface FunctionOption {
  id: string;
  name: string;
  lms_id: number | null;
}
export interface VenueOption {
  id: string;
  name: string;
  lms_id: number | null;
}
export interface SubVenueOption {
  id: string;
  venue_id: string;
  name: string;
  lms_id: number | null;
}
export interface SessionOption {
  id: string;
  name: string;
}

export interface EventOptions {
  functions: FunctionOption[];
  venues: VenueOption[];
  subVenues: SubVenueOption[];
  sessions: SessionOption[];
}

async function fetchEventOptions(): Promise<EventOptions> {
  const sb = requireSupabase();
  const [functions, venues, subVenues, sessions] = await Promise.all([
    sb.from('function_options').select('id, name, lms_id').eq('is_active', true).order('sort_order').order('name'),
    sb.from('venues').select('id, name, lms_id').eq('is_active', true).order('sort_order').order('name'),
    sb.from('sub_venues').select('id, venue_id, name, lms_id').eq('is_active', true).order('sort_order').order('name'),
    sb.from('sessions').select('id, name').eq('is_active', true).order('sort_order'),
  ]);
  for (const r of [functions, venues, subVenues, sessions]) if (r.error) throw r.error;
  return {
    functions: functions.data ?? [],
    venues: venues.data ?? [],
    subVenues: subVenues.data ?? [],
    sessions: sessions.data ?? [],
  };
}

/**
 * Returns the id of the user's venue (or sub-venue of `venueId`) with this name, adding it when
 * missing — so a venue written in LMS (e.g. an outside venue) can be filled into the form.
 */
async function ensureOption(name: string, lmsId: string | null, venueId?: string): Promise<string> {
  const sb = requireSupabase();
  const table = venueId ? 'sub_venues' : 'venues';
  const lms = lmsId && /^\d+$/.test(lmsId) ? Number(lmsId) : null;
  const find = () => {
    const q = sb.from(table).select('id').ilike('name', name.replace(/[\\%_]/g, '\\$&'));
    return (venueId ? q.eq('venue_id', venueId) : q).limit(1).maybeSingle();
  };
  const found = await find();
  if (found.error) throw found.error;
  if (found.data) return found.data.id as string;
  const added = await sb
    .from(table)
    .insert({ name, lms_id: lms, sort_order: 100, ...(venueId ? { venue_id: venueId } : {}) })
    .select('id')
    .single();
  if (added.error?.code === '23505') {
    const again = await find();
    if (again.data) return again.data.id as string;
  }
  if (added.error) throw added.error;
  return added.data.id as string;
}

/** Object so tests can mock the Supabase call. */
export const eventOptionsApi = {
  fetch: fetchEventOptions,
  ensureVenue: (name: string, lmsId: string | null) => ensureOption(name, lmsId),
  ensureSubVenue: (venueId: string, name: string, lmsId: string | null) => ensureOption(name, lmsId, venueId),
};

export function useEventOptions() {
  return useQuery({ queryKey: ['event-options'], queryFn: () => eventOptionsApi.fetch(), staleTime: 15 * 60_000 });
}
