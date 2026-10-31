/**
 * Tests for the shared LMS helpers used by the lms-proxy Edge Function.
 * Uses a made-up test mapping — the real FIELD_MAP stays unmapped until a real response is captured.
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  FIELD_MAP,
  dedupe,
  isMappingReady,
  lookup,
  matchesQuery,
  normalizePhone,
  timingToSession,
  toIsoDate,
  venueText,
  type LmsFieldMap,
} from '../functions/_shared/lms';

const TEST_MAP: LmsFieldMap = {
  listPath: 'data',
  ref: 'id',
  guestName: 'guest.name',
  phone: 'guest.mobile',
  venueId: 'venue',
  subVenueId: 'loc',
  venueName: 'venue_name',
  subVenueName: 'loc_name',
  outsideVenue: 'venue2',
  outsideCity: 'city2',
  functionId: 'fn',
  eventDate: 'date',
  timing: 'time',
  session: 'session',
  cancelRemarks: 'cancel',
};

const row = (o: Record<string, unknown>) => ({
  id: 101,
  guest: { name: 'Mehta Family', mobile: '+91 98765 43210' },
  venue: 19,
  loc: 7,
  fn: 20,
  date: '18-10-2026',
  time: '18:00',
  cancel: '',
  ...o,
});

describe('mapping', () => {
  it('real mapping is not guessed — lookups stay off until filled in', () => {
    expect(isMappingReady(FIELD_MAP.lead)).toBe(false);
    expect(isMappingReady(FIELD_MAP.contract)).toBe(false);
    expect(isMappingReady(TEST_MAP)).toBe(true);
  });
});

describe('field helpers', () => {
  it('normalises phones, timings and dates', () => {
    expect(normalizePhone('+91 98765-43210')).toBe('9876543210');
    expect(normalizePhone('12345')).toBeNull();
    expect(timingToSession('18:00:00')).toBe('Dinner');
    expect(timingToSession('16:00')).toBe('Sundowner');
    expect(timingToSession('9:00')).toBeNull();
    expect(toIsoDate('18-10-2026')).toBe('2026-10-18');
    expect(toIsoDate('18/10/2026 00:00')).toBe('2026-10-18');
    expect(toIsoDate('2026-10-18T10:00:00Z')).toBe('2026-10-18');
    expect(toIsoDate('31-02-2026')).toBeNull();
    expect(toIsoDate('soon')).toBeNull();
  });
});

describe('lookup pipeline', () => {
  const body = {
    data: [
      row({}),
      row({ id: 102, guest: { name: 'Kapoor Wedding', mobile: '9123456789' }, fn: 3 }),
      row({ id: 103, guest: { name: 'Mehta Cancelled', mobile: '9000000000' }, cancel: 'Guest cancelled' }),
      row({ id: 104, guest: { name: '', mobile: '9000000001' } }),
    ],
  };

  it('drops cancelled and nameless rows, normalises the rest', () => {
    const r = lookup(body, TEST_MAP, 'contract', 'mehta');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      source: 'lms_contract',
      sourceRef: '101',
      guestName: 'Mehta Family',
      phone: '9876543210',
      venueLmsId: '19',
      subVenueLmsId: '7',
      functionLmsId: '20',
      eventDate: '2026-10-18',
      session: 'Dinner',
    });
  });

  it('reads the venue as LMS writes it, outside venues included', () => {
    expect(venueText({ venue: '19', venue_name: 'Ambria Exotica' }, TEST_MAP)).toBe('Ambria Exotica');
    expect(venueText({ venue: '', venue2: 'radisson blu udhyog vihar', city2: 'gurgaon' }, TEST_MAP)).toBe('Radisson Blu Udhyog Vihar, Gurgaon');
    expect(venueText({ venue: '', venue2: '' }, TEST_MAP)).toBeNull();
  });

  it('searches by phone digits or ref and needs 3+ characters', () => {
    expect(lookup(body, TEST_MAP, 'lead', '43210').map((r) => r.sourceRef)).toEqual(['101']);
    expect(lookup(body, TEST_MAP, 'lead', '102').map((r) => r.sourceRef)).toEqual(['102']);
    expect(lookup(body, TEST_MAP, 'lead', 'me')).toEqual([]);
  });

  it('caps results at 5', () => {
    const many = { data: Array.from({ length: 12 }, (_, i) => row({ id: 200 + i, guest: { name: `Sharma ${i}`, mobile: null } })) };
    expect(lookup(many, TEST_MAP, 'lead', 'sharma')).toHaveLength(5);
  });

  it('returns nothing for an unexpected response shape', () => {
    expect(lookup({ message: 'error' }, TEST_MAP, 'lead', 'mehta')).toEqual([]);
  });
});

describe('dedupe', () => {
  const base = lookup({ data: [row({})] }, TEST_MAP, 'lead', 'mehta')[0]!;

  it('prefers the row that has a function date', () => {
    const noDate = { ...base, eventDate: null };
    expect(dedupe([noDate, base])).toEqual([base]);
    expect(dedupe([base, noDate])).toEqual([base]);
  });

  it('keeps different functions of the same booking', () => {
    const haldi = { ...base, functionLmsId: '14' };
    expect(dedupe([base, haldi])).toHaveLength(2);
  });
});

describe('matchesQuery', () => {
  const r = lookup({ data: [row({})] }, TEST_MAP, 'lead', 'mehta')[0]!;
  it('treats spaced phone input as digits', () => {
    expect(matchesQuery(r, '98765 43')).toBe(true);
    expect(matchesQuery(r, 'kapoor')).toBe(false);
  });
});
