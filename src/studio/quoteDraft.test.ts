/**
 * Tests for the per-user quote draft store and session draft helpers.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllDrafts } from '@/lib/sessionDrafts';
import { getQuoteDraft, resetQuoteDraftCache, setQuoteDraft, type GuestDraft } from './quoteDraft';

const guest: GuestDraft = {
  source: 'manual',
  sourceRef: null,
  sourceRaw: null,
  guestName: 'Mehta Family',
  phone: '9876543210',
  functionId: 'f1',
  venueId: 'v1',
  subVenueId: null,
  eventDate: '2026-12-01',
  sessionId: 's1',
};

beforeEach(() => {
  sessionStorage.clear();
  resetQuoteDraftCache();
});

describe('quote draft', () => {
  it('starts empty and keeps drafts separate per user', () => {
    setQuoteDraft('userA', (d) => ({ ...d, guest }));
    expect(getQuoteDraft('userA').guest).toEqual(guest);
    expect(getQuoteDraft('userB').guest).toBeNull();
  });

  it('returns the same object while unchanged (stable React snapshot)', () => {
    setQuoteDraft('userA', (d) => ({ ...d, guest }));
    expect(getQuoteDraft('userA')).toBe(getQuoteDraft('userA'));
  });

  it('survives a reload (sessionStorage)', () => {
    setQuoteDraft('userA', (d) => ({ ...d, guest }));
    resetQuoteDraftCache(); // simulate a fresh page
    expect(getQuoteDraft('userA').guest?.guestName).toBe('Mehta Family');
  });

  it('is wiped by clearAllDrafts (sign-out), even from the in-memory cache', () => {
    setQuoteDraft('userA', (d) => ({ ...d, guest }));
    sessionStorage.setItem('unrelated', 'keep');
    clearAllDrafts();
    expect(getQuoteDraft('userA').guest).toBeNull();
    expect(sessionStorage.getItem('unrelated')).toBe('keep');
  });
});
