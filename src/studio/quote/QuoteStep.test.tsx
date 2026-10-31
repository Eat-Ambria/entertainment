/**
 * Tests for Guest Studio step 4 (Quotation) and the saved-quote page, with Supabase reads mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, testProfile } from '@/test/renderApp';
import { eventOptionsApi } from '@/data/eventOptions';
import { quotesApi, type GuestQuote } from '@/data/quotes';
import { getQuoteDraft, setQuoteDraft, EMPTY_DRAFT } from '../quoteDraft';
import { linesFromPackage } from '../lines';
import { downloadPdf } from './exportQuote';

/** Package lines with every element ticked (elements start unticked in the Studio). */
const ticked = (pkg: Parameters<typeof linesFromPackage>[0]) => linesFromPackage(pkg).map((l) => ({ ...l, included: true }));

vi.mock('./exportQuote', async (orig) => ({
  ...(await orig<typeof import('./exportQuote')>()),
  downloadPdf: vi.fn().mockResolvedValue(undefined),
}));

const total = () => screen.getByLabelText('Final total').textContent;

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  Element.prototype.scrollIntoView = vi.fn(); // not implemented in jsdom
  vi.spyOn(eventOptionsApi, 'fetch').mockResolvedValue({
    functions: [{ id: 'f1', name: 'Sangeet', lms_id: 20 }],
    venues: [{ id: 'v1', name: 'Ambria Exotica', lms_id: 19 }],
    subVenues: [{ id: 'sv1', venue_id: 'v1', name: 'The Aura', lms_id: null }],
    sessions: [{ id: 's1', name: 'Dinner' }],
  });
  vi.spyOn(quotesApi, 'save').mockResolvedValue({
    id: 'q1',
    quote_no: 'ENT-2026-00007',
  });
  vi.mocked(downloadPdf).mockClear();
  setQuoteDraft(testProfile.id, () => ({
    ...EMPTY_DRAFT,
    guest: {
      source: 'lms_contract',
      sourceRef: 'C-1042',
      sourceRaw: { demo: true },
      guestName: 'Mehta Family',
      phone: '9876543210',
      functionId: 'f1',
      venueId: 'v1',
      subVenueId: 'sv1',
      eventDate: '2027-01-10',
      sessionId: 's1',
    },
    packages: [
      {
        id: 'p1',
        name: 'Royal Package',
        tier: 'Premium',
        lines: ticked([
          {
            element_id: 'e1',
            name: 'Entrance Arch',
            unit: 'Nos',
            image_path: null,
            default_rate: 25000,
            default_qty: 1,
          },
          {
            element_id: 'e2',
            name: 'Sofa Lounge',
            unit: 'Set',
            image_path: null,
            default_rate: 15000,
            default_qty: 2,
          },
          {
            element_id: 'e3',
            name: 'Fog Machine',
            unit: null,
            image_path: null,
            default_rate: 3000,
            default_qty: 1,
          },
        ]).map((l) => (l.elementId === 'e3' ? { ...l, included: false } : l)),
      },
    ],
  }));
});

describe('Quotation step', () => {
  it('shows the full quotation with only included elements', async () => {
    renderApp('/studio/new?step=quote');
    const doc = await screen.findByRole('article', { name: 'Quotation' });
    expect(within(doc).getByText('Mehta Family')).toBeInTheDocument();
    const hero = screen.getByRole('region', { name: 'Quotation summary' });
    expect(hero).toHaveTextContent('Mehta Family');
    expect(hero).toHaveTextContent(total()!); // same total as the document
    expect(within(doc).getByText('+91 98765 43210')).toBeInTheDocument();
    expect(await within(doc).findByText('Sangeet')).toBeInTheDocument();
    expect(within(doc).getByText('Ambria Exotica · The Aura')).toBeInTheDocument();
    expect(within(doc).getByText('Royal Package')).toBeInTheDocument();
    expect(within(doc).getByText('Entrance Arch')).toBeInTheDocument();
    expect(within(doc).queryByText('Fog Machine')).not.toBeInTheDocument();
    expect(within(doc).getByText('Not saved yet')).toBeInTheDocument();
    expect(total()).toBe('₹55,000.00');
  });

  it('edits additional charges on the Customise step, next to the elements, with a final total', async () => {
    renderApp('/studio/new?step=customise');
    await userEvent.click(await screen.findByRole('button', { name: '+ Transportation' }));
    await userEvent.type(screen.getByLabelText('Charge 1 amount'), '5,000');
    expect(total()).toBe('₹60,000.00');

    await userEvent.click(screen.getByRole('button', { name: /Add charge/ }));
    await userEvent.type(screen.getByLabelText('Charge 2 description'), 'Labour');
    await userEvent.type(screen.getByLabelText('Charge 2 amount'), '2500');
    expect(total()).toBe('₹62,500.00');

    await userEvent.click(screen.getByRole('button', { name: 'Remove charge 1' }));
    expect(total()).toBe('₹57,500.00');
  });

  it('will not continue past Customise with an invalid charge', async () => {
    const { router } = renderApp('/studio/new?step=customise');
    await userEvent.click(await screen.findByRole('button', { name: /Add charge/ }));
    await userEvent.click(screen.getByRole('button', { name: /Continue to quotation/ }));
    expect(screen.getByText('Describe the charge')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Fix the highlighted charges.');
    expect(router.state.location.search).toBe('?step=customise');
  });

  it('the Quotation step shows charges but no longer edits them', async () => {
    setQuoteDraft(testProfile.id, (d) => ({
      ...d,
      charges: [{ key: 'k1', description: 'Transportation', amount: '5000' }],
    }));
    renderApp('/studio/new?step=quote');
    const doc = await screen.findByRole('article', { name: 'Quotation' });
    expect(within(doc).getByText('Transportation')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add charge/ })).not.toBeInTheDocument();
    expect(total()).toBe('₹60,000.00');
  });

  it('celebrates only a confirmed save — created first, then updated — and never a failed one', async () => {
    vi.mocked(quotesApi.save)
      .mockRejectedValueOnce({ code: 'P0429' })
      .mockResolvedValueOnce({ id: 'q1', quote_no: 'ENT-2026-00007' })
      .mockResolvedValueOnce({ id: 'q1', quote_no: 'ENT-2026-00007' });
    renderApp('/studio/new?step=quote');
    await userEvent.click(await screen.findByRole('button', { name: 'Save quote' }));
    expect(await screen.findByText(/Too many changes/)).toBeInTheDocument(); // error toast, no celebration
    expect(screen.queryByText('Quotation Saved Successfully')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save quote' }));
    expect(await screen.findByText('Quotation Saved Successfully')).toBeInTheDocument();
    expect(screen.getByText('ENT-2026-00007 · created')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('ENT-2026-00007 · updated')).toBeInTheDocument();
    expect(screen.getAllByText('Quotation Saved Successfully')).toHaveLength(1); // one celebration at a time
  });

  it('saves, shows the quote number, and re-saves the same draft', async () => {
    setQuoteDraft(testProfile.id, (d) => ({
      ...d,
      charges: [{ key: 'k1', description: 'Labour', amount: '2,500' }],
    }));
    renderApp('/studio/new?step=quote');
    await userEvent.click(await screen.findByRole('button', { name: 'Save quote' }));

    await waitFor(() => expect(quotesApi.save).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(quotesApi.save).mock.calls[0]![0];
    expect(payload).toMatchObject({
      quote_id: null,
      charges: [{ description: 'Labour', amount: 2500 }],
      guest: {
        source: 'lms_contract',
        source_ref: 'C-1042',
        function_id: 'f1',
        sub_venue_id: 'sv1',
      },
    });
    expect(payload.packages).toHaveLength(1);
    expect(payload.packages[0]!.lines).toHaveLength(3);
    expect(payload).not.toHaveProperty('final_total');

    expect(await screen.findByText('Quote ENT-2026-00007 saved.')).toBeInTheDocument(); // toast
    // the side panel now shows the quote number (no "saved" banner any more)
    expect(within(screen.getByRole('complementary', { name: 'Quotation actions' })).getByText('ENT-2026-00007')).toBeInTheDocument();
    expect(within(screen.getByRole('article', { name: 'Quotation' })).getByText('ENT-2026-00007')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(quotesApi.save).toHaveBeenCalledTimes(2));
    expect(vi.mocked(quotesApi.save).mock.calls[1]![0].quote_id).toBe('q1');
  });

  it('explains a locked (confirmed) quote and saves the changes as a new quote', async () => {
    vi.mocked(quotesApi.save)
      .mockResolvedValueOnce({ id: 'q1', quote_no: 'ENT-2026-00007' })
      .mockRejectedValueOnce({
        code: '23514',
        message: 'Quote ENT-2026-00007 is confirmed and can no longer be edited.',
      })
      .mockResolvedValueOnce({ id: 'q2', quote_no: 'ENT-2026-00008' });
    renderApp('/studio/new?step=quote');
    await userEvent.click(await screen.findByRole('button', { name: 'Save quote' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(/already confirmed and locked/)).toBeInTheDocument();
    expect(screen.queryByText('One of the values is not valid.')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save as a new quote' }));
    await waitFor(() => expect(quotesApi.save).toHaveBeenCalledTimes(3));
    expect(vi.mocked(quotesApi.save).mock.calls[2]![0].quote_id).toBeNull();
    expect(await screen.findByText('Quote ENT-2026-00008 saved.')).toBeInTheDocument();
    expect(getQuoteDraft(testProfile.id).saved).toEqual({
      id: 'q2',
      quoteNo: 'ENT-2026-00008',
      status: 'draft',
    });
  });

  it('offers a PDF download of the saved copy only after saving', async () => {
    const savedQuote = { ...guestSnapshot };
    vi.spyOn(quotesApi, 'getGuestQuote').mockResolvedValue(savedQuote);
    renderApp('/studio/new?step=quote');
    await screen.findByRole('article', { name: 'Quotation' });
    expect(screen.queryByRole('button', { name: /Download/ })).not.toBeInTheDocument(); // not saved yet
    expect(screen.queryByRole('button', { name: /Mark as sent/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Save quote' }));
    await userEvent.click(await screen.findByRole('button', { name: /Download PDF/ }));
    await waitFor(() => expect(downloadPdf).toHaveBeenCalledTimes(1));
    expect(quotesApi.getGuestQuote).toHaveBeenCalledWith('q1');
    const [data, brand] = vi.mocked(downloadPdf).mock.calls[0]!;
    expect(data).toMatchObject({
      quoteNo: 'ENT-2026-00007',
      guestName: 'Mehta Family',
      total: 72000,
    });
    expect(brand.name).toBeTruthy();

    expect(screen.queryByRole('button', { name: /Excel/ })).not.toBeInTheDocument();
  });

  it('says so when a download fails', async () => {
    vi.spyOn(quotesApi, 'getGuestQuote').mockRejectedValue(new Error('offline'));
    setQuoteDraft(testProfile.id, (d) => ({
      ...d,
      saved: { id: 'q1', quoteNo: 'ENT-2026-00007', status: 'draft' },
    }));
    renderApp('/studio/new?step=quote');
    await userEvent.click(await screen.findByRole('button', { name: /Download PDF/ }));
    expect(await screen.findByText(/Couldn't create the PDF/)).toBeInTheDocument();
    expect(downloadPdf).not.toHaveBeenCalled();
  });

  it('shows a friendly message when saving fails', async () => {
    vi.mocked(quotesApi.save).mockRejectedValueOnce({ code: 'P0429' });
    renderApp('/studio/new?step=quote');
    await userEvent.click(await screen.findByRole('button', { name: 'Save quote' }));
    expect(await screen.findByText(/Too many changes in a short time/)).toBeInTheDocument();
  });

  it('has no Guest view button (removed on request)', async () => {
    renderApp('/studio/new?step=quote');
    await screen.findByRole('article', { name: 'Quotation' });
    expect(screen.queryByRole('button', { name: /Guest view/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Additional charges —|Optional — transport/)).not.toBeInTheDocument();
  });

  it('has an obvious way back to edit elements, rates and charges', async () => {
    const { router } = renderApp('/studio/new?step=quote');
    await userEvent.click(
      await screen.findByRole('button', {
        name: /Edit elements, rates & charges/,
      }),
    );
    await waitFor(() => expect(router.state.location.search).toBe('?step=customise'));
  });

  it('has no share button', async () => {
    renderApp('/studio/new?step=quote');
    await screen.findByRole('article', { name: 'Quotation' });
    expect(
      screen.queryByRole('button', {
        name: /share|whatsapp|email|Generate PDF/i,
      }),
    ).not.toBeInTheDocument();
  });

  it('goes to Studio home (header) after saving, with a fresh draft', async () => {
    const { router } = renderApp('/studio/new?step=quote');
    await userEvent.click(await screen.findByRole('button', { name: 'Save quote' }));
    await screen.findByText('Quote ENT-2026-00007 saved.');
    await userEvent.click(screen.getByRole('link', { name: /^Home$/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/studio'));
    await waitFor(() => expect(getQuoteDraft(testProfile.id)).toEqual(EMPTY_DRAFT)); // cleared as the step unmounts
  });

  it('starts a fresh quote after saving (Home, then Start a quotation)', async () => {
    const { router } = renderApp('/studio/new?step=quote');
    await userEvent.click(await screen.findByRole('button', { name: 'Save quote' }));
    await screen.findByText('Quote ENT-2026-00007 saved.');
    await userEvent.click(screen.getByRole('link', { name: /^Home$/ }));
    await userEvent.click(await screen.findByRole('link', { name: /Start a quotation/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/studio/new'));
    expect(await screen.findByRole('heading', { name: 'Guest & Event' })).toBeInTheDocument();
    expect(getQuoteDraft(testProfile.id)).toEqual(EMPTY_DRAFT);
  });
});

// What the database returns for the saved quote (also used by the download test).
const guestSnapshot: GuestQuote = {
  id: 'q1',
  quote_no: 'ENT-2026-00007',
  status: 'draft',
  created_at: '2026-10-26T10:00:00Z',
  guest_name: 'Mehta Family',
  guest_phone: '9876543210',
  function_name: 'Sangeet',
  venue_name: 'Ambria Exotica',
  sub_venue_name: null,
  event_date: '2027-01-10',
  session_name: 'Dinner',
  package_name: 'Royal Package',
  package_tier: 'Premium',
  elements_subtotal: 67000,
  charges_total: 5000,
  final_total: 72000,
  packages: [],
  items: [
    {
      quote_package_id: null,
      element_name: 'Entrance Arch',
      unit: 'Nos',
      qty: 1,
      rate: 25000,
      amount: 25000,
      is_included: true,
      sort_order: 1,
    },
    {
      quote_package_id: null,
      element_name: 'Sofa Lounge',
      remarks: 'Bride entry, Exotica lawn',
      unit: 'Set',
      qty: 3,
      rate: 14000,
      amount: 42000,
      is_included: true,
      sort_order: 2,
    },
    {
      quote_package_id: null,
      element_name: 'Fog Machine',
      unit: null,
      qty: 1,
      rate: 3000,
      amount: 3000,
      is_included: false,
      sort_order: 3,
    },
  ],
  charges: [{ description: 'Transportation', amount: 5000, sort_order: 1 }],
};

describe('Saved quote page', () => {
  const saved = guestSnapshot;

  it('shows the saved snapshot exactly as stored', async () => {
    vi.spyOn(quotesApi, 'getGuestQuote').mockResolvedValue(saved);
    renderApp('/studio/quotes/q1');
    const doc = await screen.findByRole('article', { name: 'Quotation' });
    expect(within(doc).getByText('ENT-2026-00007')).toBeInTheDocument();
    expect(within(doc).getByText('Draft')).toBeInTheDocument();
    expect(within(doc).getByText('Sofa Lounge')).toBeInTheDocument();
    expect(within(doc).getByText('Bride entry, Exotica lawn')).toBeInTheDocument();
    expect(within(doc).queryByText('Fog Machine')).not.toBeInTheDocument();
    expect(within(doc).getByText('Transportation')).toBeInTheDocument();
    expect(total()).toBe('₹72,000.00');
  });

  it('shows one section per package with its own subtotal', async () => {
    vi.spyOn(quotesApi, 'getGuestQuote').mockResolvedValue({
      ...saved,
      package_name: 'Royal Package + Classic Package',
      packages: [
        {
          id: 'qp1',
          package_name: 'Royal Package',
          package_tier: 'Premium',
          subtotal: 67000,
          sort_order: 1,
        },
        {
          id: 'qp2',
          package_name: 'Classic Package',
          package_tier: 'Standard',
          subtotal: 32000,
          sort_order: 2,
        },
      ],
      items: [
        { ...saved.items[0]!, quote_package_id: 'qp1' },
        { ...saved.items[1]!, quote_package_id: 'qp1' },
        {
          quote_package_id: 'qp2',
          element_name: 'DJ',
          unit: 'Hour',
          qty: 4,
          rate: 8000,
          amount: 32000,
          is_included: true,
          sort_order: 2001,
        },
      ],
      elements_subtotal: 99000,
      final_total: 104000,
    });
    renderApp('/studio/quotes/q1');
    const doc = await screen.findByRole('article', { name: 'Quotation' });
    const royal = within(doc).getByRole('region', { name: 'Royal Package' });
    const classic = within(doc).getByRole('region', {
      name: 'Classic Package',
    });
    expect(within(royal).getByText('Sofa Lounge')).toBeInTheDocument();
    expect(within(royal).queryByText('DJ')).not.toBeInTheDocument();
    expect(within(classic).getByText('DJ')).toBeInTheDocument();
    expect(within(royal).getByText('₹67,000.00')).toBeInTheDocument();
    expect(within(classic).getAllByText('₹32,000.00').length).toBeGreaterThan(0);
    expect(total()).toBe('₹1,04,000.00');
  });

  it('offers Edit for a draft, with no Mark as sent or PDF button on this page', async () => {
    vi.spyOn(quotesApi, 'getGuestQuote').mockResolvedValue(saved);
    renderApp('/studio/quotes/q1');
    expect(await screen.findByRole('button', { name: /Edit quote/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark as sent|PDF/ })).not.toBeInTheDocument();
  });

  it('hides Edit for a confirmed quote', async () => {
    vi.spyOn(quotesApi, 'getGuestQuote').mockResolvedValue({
      ...saved,
      status: 'confirmed',
    });
    renderApp('/studio/quotes/q1');
    await screen.findByRole('article', { name: 'Quotation' });
    expect(screen.queryByRole('button', { name: /Edit quote/ })).not.toBeInTheDocument();
  });

  it('says the database needs an update instead of "not found" when a column is missing', async () => {
    vi.spyOn(quotesApi, 'getGuestQuote').mockRejectedValue({ code: '42703', message: 'column quote_items_1.remarks does not exist' });
    renderApp('/studio/quotes/q1');
    expect(await screen.findByText("Couldn't open this quotation")).toBeInTheDocument();
    expect(screen.getByText(/database needs an update/)).toBeInTheDocument();
    expect(screen.queryByText('Quotation not found')).not.toBeInTheDocument();
  });

  it('has a Back button (Studio home when opened directly)', async () => {
    vi.spyOn(quotesApi, 'getGuestQuote').mockResolvedValue(saved);
    const { router } = renderApp('/studio/quotes/q1');
    await userEvent.click(await screen.findByRole('button', { name: /Back/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/studio'));
  });

  it('handles a missing quote', async () => {
    vi.spyOn(quotesApi, 'getGuestQuote').mockRejectedValue({
      code: 'PGRST116',
    });
    renderApp('/studio/quotes/nope');
    expect(await screen.findByText('Quotation not found')).toBeInTheDocument();
  });
});
