/**
 * Tests for Guest Studio step 1 with event options mocked and LMS replaced by a test adapter
 * over the fixture guests (the app itself has no demo data).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, testProfile } from '@/test/renderApp';
import { eventOptionsApi, type EventOptions } from '@/data/eventOptions';
import { getQuoteDraft, setQuoteDraft } from '../quoteDraft';
import { LookupError, lookupErrorMessage, searchAllGuests, type GuestSourceAdapter } from './guestSources';

vi.mock('./guestSources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./guestSources')>();
  const { MOCK_GUESTS } = await import('@/test/guestFixtures');
  const { MAX_RESULTS, matchesQuery } = await import('../../../supabase/functions/_shared/lms');
  const fixtureAdapter: GuestSourceAdapter = {
    async search(source, query) {
      const wanted = source === 'lead' ? 'lms_lead' : 'lms_contract';
      return MOCK_GUESTS.filter((g) => g.source === wanted && matchesQuery(g, query)).slice(0, MAX_RESULTS);
    },
  };
  return { ...actual, getGuestAdapter: () => fixtureAdapter };
});

const OPTIONS: EventOptions = {
  functions: [
    { id: 'f-sangeet', name: 'Sangeet', lms_id: 20 },
    { id: 'f-wedding', name: 'Wedding', lms_id: 3 },
  ],
  venues: [
    { id: 'v-exotica', name: 'Ambria Exotica', lms_id: 19 },
    { id: 'v-push', name: 'Ambria Pushpanjali', lms_id: 3 },
  ],
  subVenues: [
    { id: 'sv-aura', venue_id: 'v-exotica', name: 'The Aura', lms_id: null },
    { id: 'sv-val', venue_id: 'v-exotica', name: 'Valencia', lms_id: null },
  ],
  sessions: [
    { id: 's-lunch', name: 'Lunch' },
    { id: 's-dinner', name: 'Dinner' },
  ],
};

beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(eventOptionsApi, 'fetch').mockResolvedValue(OPTIONS);
});

const open = () => renderApp('/studio/new');

describe('Guest & Event step', () => {
  it('finds a contract, fills the form and masks other guests\' phones', async () => {
    const { router } = open();
    await userEvent.type(await screen.findByPlaceholderText('Guest name, phone or booking number'), 'mehta');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    const list = await screen.findByRole('list', { name: 'Search results' });
    expect(within(list).getAllByText('Mehta Family')).toHaveLength(2);
    expect(within(list).queryByText(/9876543210/)).not.toBeInTheDocument();
    expect(within(list).getAllByText(/98765 •••10/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Demo data/)).toBeInTheDocument();

    await userEvent.click(within(list).getByRole('button', { name: 'Use Mehta Family C-1042' }));
    expect(screen.getByText(/Details filled from contract C-1042/)).toBeInTheDocument();
    expect(screen.getByLabelText('Guest name')).toHaveValue('Mehta Family');
    expect(screen.getByLabelText('Function')).toHaveValue('f-sangeet');
    expect(screen.getByLabelText('Venue')).toHaveValue('v-exotica');
    expect(screen.getByLabelText('Session')).toHaveValue('s-dinner');
    expect(screen.getByLabelText('Event date')).toHaveValue('2026-12-12');

    await userEvent.selectOptions(screen.getByLabelText('Sub-venue'), 'sv-aura');
    await userEvent.click(screen.getByRole('button', { name: /Continue to packages/ }));

    await waitFor(() => expect(router.state.location.search).toBe('?step=package'));
    expect(getQuoteDraft(testProfile.id).guest).toMatchObject({
      source: 'lms_contract',
      sourceRef: 'C-1042',
      phone: '9876543210',
      subVenueId: 'sv-aura',
    });
  });

  it('searches contracts and leads in one box and tags each result', async () => {
    open();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument(); // no Find contract / Find lead / Enter manually cards
    await userEvent.type(await screen.findByPlaceholderText('Guest name, phone or booking number'), 'family');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    const list = await screen.findByRole('list', { name: 'Search results' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringMatching(/Mehta Family.*Contract/),
      expect.stringMatching(/Mehta Family.*Contract/),
      expect.stringMatching(/Sharma Family.*Lead/),
    ]);
    await userEvent.click(within(list).getByRole('button', { name: 'Use Sharma Family L-5531' }));
    expect(screen.getByText(/Details filled from lead L-5531/)).toBeInTheDocument();
  });

  it('clears the results when the search box is emptied (✕)', async () => {
    open();
    const box = await screen.findByPlaceholderText('Guest name, phone or booking number');
    await userEvent.type(box, 'family');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await screen.findByRole('list', { name: 'Search results' });
    await userEvent.clear(box); // same input event as the native ✕
    expect(screen.queryByRole('list', { name: 'Search results' })).not.toBeInTheDocument();
  });

  it('builds a live event preview while the form is filled in', async () => {
    open();
    const preview = await screen.findByRole('complementary', { name: 'Your event preview' });
    expect(within(preview).getByText('0 of 6')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Guest name'), 'Kapoor Wedding');
    await userEvent.selectOptions(screen.getByLabelText('Function'), 'f-sangeet');
    expect(within(preview).getByText('Kapoor Wedding')).toBeInTheDocument();
    expect(within(preview).getByText('Sangeet')).toBeInTheDocument();
    expect(within(preview).getByText('2 of 6')).toBeInTheDocument();
  });

  it('needs 3+ characters before searching', async () => {
    open();
    await userEvent.type(await screen.findByPlaceholderText('Guest name, phone or booking number'), 'me');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByRole('alert')).toHaveTextContent('at least 3 letters');
  });

  it('enters a guest manually with validation', async () => {
    open();
    expect(await screen.findByText(/New guest — enter the details yourself/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Continue to packages/ }));
    expect(screen.getByText('Enter the guest name.')).toBeInTheDocument();
    expect(screen.getByText('Choose the function.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Guest name'), 'Verma Family');
    await userEvent.type(screen.getByLabelText('Mobile number'), '12345');
    await userEvent.click(screen.getByRole('button', { name: /Continue to packages/ }));
    expect(screen.getByText('Enter a 10-digit mobile number.')).toBeInTheDocument();

    // letters and symbols are dropped, and it stops at 10 digits
    const phone = screen.getByLabelText('Mobile number');
    await userEvent.clear(phone);
    await userEvent.type(phone, '98a7-65 43(21)0999');
    expect(phone).toHaveValue('9876543210');
  });

  it('only offers sub-venues of the chosen venue', async () => {
    open();
    expect(await screen.findByLabelText('Sub-venue')).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Venue'), 'v-exotica');
    expect(within(screen.getByLabelText('Sub-venue')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Optional',
      'The Aura',
      'Valencia',
    ]);
    await userEvent.selectOptions(screen.getByLabelText('Venue'), 'v-push');
    expect(screen.getByLabelText('Sub-venue')).toBeDisabled();
  });

  it('restores the saved guest after a refresh', async () => {
    setQuoteDraft(testProfile.id, (d) => ({
      ...d,
      guest: {
        source: 'manual',
        sourceRef: null,
        sourceRaw: null,
        guestName: 'Saved Guest',
        phone: '9123456789',
        functionId: 'f-wedding',
        venueId: 'v-push',
        subVenueId: null,
        eventDate: '2027-01-10',
        sessionId: 's-lunch',
      },
    }));
    open();
    expect(await screen.findByLabelText('Guest name')).toHaveValue('Saved Guest');
    expect(screen.getByText(/New guest — enter the details yourself/)).toBeInTheDocument();
  });

  it('sends you back to step 1 if a later step is opened without guest details', async () => {
    const { router } = renderApp('/studio/new?step=customise');
    await screen.findByLabelText('Guest name');
    expect(router.state.location.search).toBe('?step=guest');
  });
});

describe('lookup errors', () => {
  it('explains when LMS is not connected yet, without technical text', () => {
    expect(lookupErrorMessage(new LookupError('lms_mapping_pending'), 'contract')).toBe(
      "Contract lookup isn't connected yet. Please enter the details manually.",
    );
    expect(lookupErrorMessage(new LookupError('rate_limited'), 'lead')).toMatch(/Too many searches/);
    expect(lookupErrorMessage(new Error('internal stack'), 'lead')).toMatch(/Search failed/);
    expect(lookupErrorMessage(new LookupError('lms_not_configured'), 'any')).toBe("Guest lookup isn't connected yet. Please enter the details manually.");
  });

  it("keeps one side's results when the other side fails, and throws only if both fail", async () => {
    const lead = { source: 'lms_lead', sourceRef: 'L-1', guestName: 'X' } as never;
    const half: GuestSourceAdapter = { search: (s) => (s === 'contract' ? Promise.reject(new LookupError('lms_unavailable')) : Promise.resolve([lead])) };
    await expect(searchAllGuests(half, 'xyz')).resolves.toEqual({ results: [lead], failed: ['contract'] });
    const none: GuestSourceAdapter = { search: () => Promise.reject(new LookupError('rate_limited')) };
    await expect(searchAllGuests(none, 'xyz')).rejects.toMatchObject({ code: 'rate_limited' });
  });
});
