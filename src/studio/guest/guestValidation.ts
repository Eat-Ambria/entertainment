/**
 * Guest & Event form: validation, and mapping an LMS result onto the user's own option ids.
 */
import { normalizePhone } from '@/lib/phone';
import { todayIst } from '@/lib/date';
import type { EventOptions } from '@/data/eventOptions';
import type { GuestDraft, GuestSource } from '../quoteDraft';
import type { GuestLookupResult } from './guestSources';
import { SUB_VENUE_LOCATIONS } from '../../../supabase/functions/_shared/lms';

export interface GuestForm {
  guestName: string;
  phone: string;
  functionId: string;
  venueId: string;
  subVenueId: string;
  eventDate: string;
  sessionId: string;
}

export type GuestFormErrors = Partial<Record<keyof GuestForm, string>>;

export const EMPTY_GUEST_FORM: GuestForm = {
  guestName: '',
  phone: '',
  functionId: '',
  venueId: '',
  subVenueId: '',
  eventDate: '',
  sessionId: '',
};

export { todayIst };

export function validateGuest(
  form: GuestForm,
  meta: { source: GuestSource; sourceRef: string | null; sourceRaw: unknown },
  today: string = todayIst(),
): { ok: true; value: GuestDraft } | { ok: false; errors: GuestFormErrors } {
  const errors: GuestFormErrors = {};
  const name = form.guestName.trim().replace(/\s+/g, ' ');
  if (!name) errors.guestName = 'Enter the guest name.';
  else if (name.length > 120) errors.guestName = 'Keep the name under 120 characters.';

  // Exactly 10 digits, numbers only (the +91 is shown separately).
  const digits = form.phone.trim();
  const phone = normalizePhone(digits);
  if (!digits) errors.phone = 'Enter a mobile number.';
  else if (!/^\d+$/.test(digits)) errors.phone = 'Numbers only.';
  else if (digits.length !== 10) errors.phone = 'Enter a 10-digit mobile number.';
  else if (!phone) errors.phone = 'Enter a valid 10-digit mobile number.';

  if (!form.functionId) errors.functionId = 'Choose the function.';
  if (!form.venueId) errors.venueId = 'Choose the venue.';
  if (!form.sessionId) errors.sessionId = 'Choose the session.';

  if (!form.eventDate) errors.eventDate = 'Choose the event date.';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(form.eventDate)) errors.eventDate = 'Choose a valid date.';
  else if (form.eventDate < today) errors.eventDate = "The event date can't be in the past.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      ...meta,
      guestName: name,
      phone: phone!,
      functionId: form.functionId,
      venueId: form.venueId,
      subVenueId: form.subVenueId || null,
      eventDate: form.eventDate,
      sessionId: form.sessionId,
    },
  };
}

/** Pre-fills the form from an LMS result using LMS ids; anything that can't be matched stays blank. */
export function formFromLookup(r: GuestLookupResult, opts: EventOptions): GuestForm {
  const byLms = <T extends { lms_id: number | null }>(list: T[], id: string | null) =>
    id === null ? undefined : list.find((x) => x.lms_id !== null && String(x.lms_id) === id);
  const venue = byLms(opts.venues, r.venueLmsId);
  const venueSubs = venue ? opts.subVenues.filter((s) => s.venue_id === venue.id) : [];
  const sub =
    byLms(venueSubs, r.subVenueLmsId) ??
    (r.subVenueLmsId === null ? undefined : venueSubs.find((s) => SUB_VENUE_LOCATIONS[s.name.trim().toLowerCase()]?.includes(r.subVenueLmsId!)));
  return {
    guestName: r.guestName,
    phone: r.phone ? (normalizePhone(r.phone) ?? r.phone.replace(/\D/g, '').slice(-10)) : '',
    functionId: byLms(opts.functions, r.functionLmsId)?.id ?? '',
    venueId: venue?.id ?? '',
    subVenueId: sub?.id ?? '',
    eventDate: r.eventDate ?? '',
    sessionId: opts.sessions.find((s) => s.name === r.session)?.id ?? '',
  };
}

export function formFromDraft(d: GuestDraft): GuestForm {
  return {
    guestName: d.guestName,
    phone: d.phone,
    functionId: d.functionId,
    venueId: d.venueId,
    subVenueId: d.subVenueId ?? '',
    eventDate: d.eventDate,
    sessionId: d.sessionId,
  };
}
