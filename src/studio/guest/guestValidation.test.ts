/**
 * Tests for the Guest & Event form validation and LMS pre-fill.
 */
import { describe, expect, it } from 'vitest';
import type { EventOptions } from '@/data/eventOptions';
import { EMPTY_GUEST_FORM, formFromLookup, todayIst, validateGuest, type GuestForm } from './guestValidation';
import { MOCK_GUESTS } from '@/test/guestFixtures';

const MANUAL = { source: 'manual' as const, sourceRef: null, sourceRaw: null };
const valid: GuestForm = {
  guestName: '  Mehta   Family ',
  phone: '9876543210',
  functionId: 'f-sangeet',
  venueId: 'v-exotica',
  subVenueId: '',
  eventDate: '2026-12-12',
  sessionId: 's-dinner',
};

const OPTIONS: EventOptions = {
  functions: [
    { id: 'f-sangeet', name: 'Sangeet', lms_id: 20 },
    { id: 'f-wedding', name: 'Wedding', lms_id: 3 },
  ],
  venues: [
    { id: 'v-exotica', name: 'Ambria Exotica', lms_id: 19 },
    { id: 'v-push', name: 'Ambria Pushpanjali', lms_id: 3 },
  ],
  subVenues: [{ id: 'sv-aura', venue_id: 'v-exotica', name: 'The Aura', lms_id: 7 }],
  sessions: [
    { id: 's-lunch', name: 'Lunch' },
    { id: 's-dinner', name: 'Dinner' },
  ],
};

describe('validateGuest', () => {
  it('tidies and normalises a valid form', () => {
    expect(validateGuest(valid, MANUAL, '2026-10-26')).toEqual({
      ok: true,
      value: {
        ...MANUAL,
        guestName: 'Mehta Family',
        phone: '9876543210',
        functionId: 'f-sangeet',
        venueId: 'v-exotica',
        subVenueId: null,
        eventDate: '2026-12-12',
        sessionId: 's-dinner',
      },
    });
  });

  it('reports every missing field', () => {
    const r = validateGuest(EMPTY_GUEST_FORM, MANUAL, '2026-10-26');
    expect(r.ok).toBe(false);
    expect(Object.keys((r as { errors: object }).errors).sort()).toEqual(
      ['eventDate', 'functionId', 'guestName', 'phone', 'sessionId', 'venueId'].sort(),
    );
  });

  it('rejects bad phones and past dates, allows today', () => {
    expect(validateGuest({ ...valid, phone: '12345' }, MANUAL, '2026-10-26')).toMatchObject({
      ok: false,
      errors: { phone: 'Enter a 10-digit mobile number.' },
    });
    expect(validateGuest({ ...valid, phone: '98765-4321' }, MANUAL, '2026-10-26')).toMatchObject({ errors: { phone: 'Numbers only.' } });
    expect(validateGuest({ ...valid, phone: '919876543210' }, MANUAL, '2026-10-26')).toMatchObject({ errors: { phone: 'Enter a 10-digit mobile number.' } });
    expect(validateGuest({ ...valid, phone: '1234567890' }, MANUAL, '2026-10-26')).toMatchObject({
      errors: { phone: 'Enter a valid 10-digit mobile number.' }, // Indian mobiles start with 6–9
    });
    expect(validateGuest({ ...valid, eventDate: '2026-10-25' }, MANUAL, '2026-10-26')).toMatchObject({
      ok: false,
      errors: { eventDate: "The event date can't be in the past." },
    });
    expect(validateGuest({ ...valid, eventDate: '2026-10-26' }, MANUAL, '2026-10-26').ok).toBe(true);
  });

  it('uses India time for "today"', () => {
    expect(todayIst(new Date('2026-10-25T20:00:00Z'))).toBe('2026-10-26'); // 01:30 IST next day
  });
});

describe('formFromLookup', () => {
  it('maps LMS ids to the user own option ids', () => {
    const r = { ...MOCK_GUESTS[0]!, subVenueLmsId: '7' };
    expect(formFromLookup(r, OPTIONS)).toEqual({
      guestName: 'Mehta Family',
      phone: '9876543210',
      functionId: 'f-sangeet',
      venueId: 'v-exotica',
      subVenueId: 'sv-aura',
      eventDate: '2026-12-12',
      sessionId: 's-dinner',
    });
  });

  it('leaves unknown values blank for the staff to fill', () => {
    const r = { ...MOCK_GUESTS[0]!, functionLmsId: '999', venueLmsId: null, session: null, eventDate: null };
    expect(formFromLookup(r, OPTIONS)).toMatchObject({ functionId: '', venueId: '', subVenueId: '', sessionId: '', eventDate: '' });
  });
});
