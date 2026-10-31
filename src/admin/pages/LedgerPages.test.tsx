/**
 * Tests for the Quote Ledger, quote detail and Rate History screens (Supabase layer mocked).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '@/test/renderApp';
import { eventOptionsApi } from '@/data/eventOptions';
import { quotesApi, type GuestQuote } from '@/data/quotes';
import { quoteLedgerApi, type LedgerRow } from '../quotes/quoteLedgerApi';
import { ratesApi, type VendorRateRow } from '../rates/ratesApi';
import { quoteEditApi } from '@/data/quoteEdit';
import { EMPTY_DRAFT, getQuoteDraft } from '@/studio/quoteDraft';
import { testProfile } from '@/test/renderApp';

const row = (o: Partial<LedgerRow> = {}): LedgerRow => ({
  id: 'q1',
  quote_no: 'ENT-2026-00007',
  status: 'draft',
  guest_name: 'Mehta Family',
  guest_phone: '9876543210',
  function_name: 'Sangeet',
  package_name: 'Royal Package',
  package_tier: 'Premium',
  event_date: '2027-01-10',
  final_total: 72000,
  created_at: '2026-10-26T10:00:00Z',
  ...o,
});

const guestQuote: GuestQuote = {
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
  items: [{ quote_package_id: null, element_name: 'Sofa Lounge', unit: 'Set', qty: 3, rate: 14000, amount: 42000, is_included: true, sort_order: 1 }],
  charges: [{ description: 'Transportation', amount: 5000, sort_order: 1 }],
};

const vrow = (o: Partial<VendorRateRow>): VendorRateRow => ({
  id: 'r1',
  element_id: 'e1',
  element_name: 'Fresh Fruits',
  vendor_id: 'v1',
  vendor_name: 'DIGANI FRUITS & VEGETABLES',
  purchase_date: '2026-10-18',
  qty: 1,
  unit: 'Kg',
  rate_per_unit: 180,
  remarks: null,
  logged_by_name: 'Uday Yadav',
  logged_at: '2026-10-21T10:00:00Z',
  void_reason: null,
  trend: 'up',
  ...o,
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(eventOptionsApi, 'fetch').mockResolvedValue({
    functions: [
      { id: 'f1', name: 'Sangeet', lms_id: 20 },
      { id: 'f2', name: 'Wedding', lms_id: 3 },
    ],
    venues: [],
    subVenues: [],
    sessions: [],
  });
  vi.spyOn(quoteLedgerApi, 'list').mockResolvedValue({ rows: [row(), row({ id: 'q2', quote_no: 'ENT-2026-00008', status: 'confirmed', guest_name: 'Kapoor Wedding' })], total: 2 });
  vi.spyOn(quoteLedgerApi, 'packages').mockResolvedValue([{ id: 'p1', label: 'Royal Package · Premium' }]);
  vi.spyOn(quoteLedgerApi, 'internal').mockResolvedValue({
    id: 'q1',
    quote_no: 'ENT-2026-00007',
    status: 'draft',
    source: 'lms_contract',
    source_ref: 'C-1042',
    created_at: '2026-10-26T10:00:00Z',
    updated_at: '2026-10-26T10:00:00Z',
    history: [],
    overrides: [{ element_name: 'Sofa Lounge', old_rate: 15000, new_rate: 14000, changed_at: '2026-10-26T10:00:00Z' }],
  });
  vi.spyOn(quoteLedgerApi, 'setStatus').mockResolvedValue(undefined);
  vi.spyOn(quotesApi, 'getGuestQuote').mockResolvedValue(guestQuote);
});

const lastList = () => vi.mocked(quoteLedgerApi.list).mock.calls.at(-1)![0];

describe('Quote Ledger', () => {
  it('lists quotes with the required columns', async () => {
    renderApp('/admin/quotes');
    expect(await screen.findByRole('link', { name: 'ENT-2026-00007' })).toHaveAttribute('href', '/admin/quotes/q1');
    expect(screen.getByText('Kapoor Wedding')).toBeInTheDocument();
    expect(screen.getAllByText('₹72,000.00')).toHaveLength(2);
    expect(within(screen.getByRole('table')).getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getAllByText('by Uday Yadav')).toHaveLength(2);
    expect(lastList()).toEqual({ search: '', status: null, functionName: null, packageId: null, from: null, to: null, page: 1, pageSize: 25 });
  });

  it('filters by search, status, function, package and date range', async () => {
    renderApp('/admin/quotes');
    await screen.findByText('Kapoor Wedding');
    await userEvent.type(screen.getByPlaceholderText('Quote no, guest or phone'), 'mehta');
    await waitFor(() => expect(lastList()).toMatchObject({ search: 'mehta' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'confirmed');
    await screen.findByRole('option', { name: 'Wedding' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Function' }), 'Wedding');
    await screen.findByRole('option', { name: 'Royal Package · Premium' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Package' }), 'p1');
    await userEvent.type(screen.getByLabelText('From date'), '2026-10-01');
    await waitFor(() =>
      expect(lastList()).toMatchObject({ search: 'mehta', status: 'confirmed', functionName: 'Wedding', packageId: 'p1', from: '2026-10-01', page: 1 }),
    );
  });

  it('shows each package on its own line with its tier', async () => {
    vi.mocked(quoteLedgerApi.list).mockResolvedValue({ rows: [row({ package_name: 'Royal Package + Classic Package', package_tier: 'Premium + Standard' })], total: 1 });
    renderApp('/admin/quotes');
    const cell = (await screen.findByText('Royal Package')).closest('ul')!;
    expect(within(cell).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Royal Package· Premium', 'Classic Package· Standard']);
  });

  it('clears every filter at once', async () => {
    const { router } = renderApp('/admin/quotes?status=draft&from=2026-10-01&to=2026-10-31&q=meh');
    await userEvent.click(await screen.findByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.getByPlaceholderText('Quote no, guest or phone')).toHaveValue('');
    // the pending search debounce must not put the old term back
    await new Promise((r) => setTimeout(r, 450));
    expect(router.state.location.search).toBe('');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
  });

  it('shows an empty state with a link to create a quote', async () => {
    vi.mocked(quoteLedgerApi.list).mockResolvedValue({ rows: [], total: 0 });
    renderApp('/admin/quotes');
    expect(await screen.findByText('No quotes yet')).toBeInTheDocument();
  });
});

describe('Quote detail', () => {
  it('shows the quotation, source, overrides and status actions', async () => {
    renderApp('/admin/quotes/q1');
    expect(await screen.findByRole('article', { name: 'Quotation' })).toBeInTheDocument();
    expect(screen.getByText('LMS contract · C-1042')).toBeInTheDocument();
    expect(screen.getByText('Rate changes in this quote').parentElement).toHaveTextContent('₹15,000.00 → ₹14,000.00');
    expect(screen.queryByRole('button', { name: /Mark as sent/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark confirmed' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open in Guest Studio/ })).toHaveAttribute('href', '/studio/quotes/q1');
  });

  it('changes status only after confirmation', async () => {
    renderApp('/admin/quotes/q1');
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel quote' }));
    expect(quoteLedgerApi.setStatus).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: 'Cancel quote?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel quote' }));
    await waitFor(() => expect(quoteLedgerApi.setStatus).toHaveBeenCalledWith('q1', 'cancelled'));
  });

  it('still labels old Sent history entries', async () => {
    vi.mocked(quoteLedgerApi.internal).mockResolvedValue({
      ...(await quoteLedgerApi.internal('q1')),
      history: [
        { at: '2026-10-27T10:00:00Z', action: 'sent', from: 'sent', to: 'sent', sentCount: 2 },
        { at: '2026-10-26T11:00:00Z', action: 'status_change', from: 'draft', to: 'sent', sentCount: null },
      ],
    });
    renderApp('/admin/quotes/q1');
    expect(await screen.findByText('Sent again (2nd time)')).toBeInTheDocument();
    expect(screen.getByText('Draft → Sent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Edit quote/ })).toBeInTheDocument();
  });

  it('locks a confirmed quote: no edit', async () => {
    vi.mocked(quoteLedgerApi.internal).mockResolvedValue({ ...(await quoteLedgerApi.internal('q1')), status: 'confirmed' });
    renderApp('/admin/quotes/q1');
    expect(await screen.findByText(/locked so the booked price/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit quote/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel quote' })).toBeInTheDocument();
  });

  it('Edit quote opens it in the Guest Studio on the Quotation step', async () => {
    sessionStorage.clear();
    vi.spyOn(quoteEditApi, 'load').mockResolvedValue({
      droppedLines: 0,
      draft: { ...EMPTY_DRAFT, saved: { id: 'q1', quoteNo: 'ENT-2026-00007', status: 'draft' } },
    });
    const { router } = renderApp('/admin/quotes/q1');
    await userEvent.click(await screen.findByRole('button', { name: /Edit quote/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/studio/new'));
    expect(quoteEditApi.load).toHaveBeenCalledWith('q1');
    expect(getQuoteDraft(testProfile.id).saved).toEqual({ id: 'q1', quoteNo: 'ENT-2026-00007', status: 'draft' });
  });

  it('offers no actions for a cancelled quote', async () => {
    vi.mocked(quoteLedgerApi.internal).mockResolvedValue({ ...(await quoteLedgerApi.internal('q1')), status: 'cancelled' });
    renderApp('/admin/quotes/q1');
    expect(await screen.findByText(/cancelled and can't change/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark/ })).not.toBeInTheDocument();
  });
});

describe('Rate History', () => {
  beforeEach(() => {
    vi.spyOn(ratesApi, 'vendorHistory').mockResolvedValue({
      rows: [
        vrow({ id: 'r1', purchase_date: '2026-10-18', rate_per_unit: 180, trend: 'up' }),
        vrow({ id: 'r2', purchase_date: '2026-10-15', rate_per_unit: 160, trend: 'down' }),
        vrow({ id: 'r3', purchase_date: '2026-10-01', qty: 0.5, rate_per_unit: 190, trend: 'up' }),
        vrow({ id: 'r4', purchase_date: '2026-09-21', rate_per_unit: 150, trend: 'new', logged_by_name: 'David' }),
      ],
      total: 4,
    });
    vi.spyOn(ratesApi, 'vendorLatest').mockResolvedValue({
      rows: [
        {
          id: 'r1',
          element_id: 'e1',
          element_name: 'Fresh Fruits',
          vendor_id: 'v1',
          vendor_name: 'DIGANI FRUITS & VEGETABLES',
          new_date: '2026-10-18',
          new_rate: 180,
          old_date: '2026-10-15',
          old_rate: 160,
          qty: 1,
          unit: 'Kg',
          purchases: 4,
          trend: 'up',
        },
        {
          id: 'r9',
          element_id: 'e2',
          element_name: 'Roses',
          vendor_id: 'v2',
          vendor_name: 'CITY FLOWERS',
          new_date: '2026-10-10',
          new_rate: 40,
          old_date: null,
          old_rate: null,
          qty: 1,
          unit: 'Bunch',
          purchases: 1,
          trend: 'new',
        },
      ],
      total: 2,
    });
    vi.spyOn(ratesApi, 'elements').mockResolvedValue([{ id: 'e1', name: 'Fresh Fruits', unit: 'Kg' }]);
    vi.spyOn(ratesApi, 'vendors').mockResolvedValue([{ id: 'v1', name: 'DIGANI FRUITS & VEGETABLES' }]);
    vi.spyOn(ratesApi, 'addEntry').mockResolvedValue(undefined);
    vi.spyOn(ratesApi, 'createVendor').mockResolvedValue({ id: 'v9', name: 'New Vendor' });
    vi.spyOn(ratesApi, 'voidEntry').mockResolvedValue(undefined);
    vi.spyOn(ratesApi, 'logs').mockResolvedValue([
      { id: 'l1', element_name: 'Sofa Lounge', old_rate: 15000, new_rate: 14000, reason: 'Rate changed for quote ENT-2026-00007', changed_at: '2026-10-26T10:00:00Z', quote_id: 'q1', quote_no: 'ENT-2026-00007' },
    ]);
  });

  it('shows one row per element + vendor: old rate → new rate and the change', async () => {
    renderApp('/admin/rate-history');
    const row = (await screen.findByRole('cell', { name: /Fresh Fruits/ })).closest('tr')!;
    expect(within(row).getByText('DIGANI FRUITS & VEGETABLES')).toBeInTheDocument();
    expect(row).toHaveTextContent('₹160.00'); // old
    expect(row).toHaveTextContent('₹180.00'); // new
    expect(row).toHaveTextContent('+₹20.00 (+13%)');
    expect(within(row).getByRole('img', { name: 'Rate went up' })).toBeInTheDocument();
    const roses = screen.getByRole('cell', { name: /Roses/ }).closest('tr')!;
    expect(within(roses).getByText('NEW')).toBeInTheDocument();
    expect(screen.queryByText('Logged 21 Oct 2026')).not.toBeInTheDocument(); // the long list is behind History
  });

  it('opens the full purchase history of a row', async () => {
    renderApp('/admin/rate-history');
    await userEvent.click(await screen.findByRole('button', { name: /History \(4\)/ }));
    const list = await screen.findByRole('table', { name: 'Purchase history from DIGANI FRUITS & VEGETABLES' });
    expect(within(list).getByText('0.5 Kg')).toBeInTheDocument();
    expect(within(list).getByText('by David')).toBeInTheDocument();
    expect(ratesApi.vendorHistory).toHaveBeenCalledWith({ elementId: 'e1', vendorId: 'v1', page: 1, pageSize: 100 });
  });

  it('logs a purchase rate with a new vendor', async () => {
    renderApp('/admin/rate-history');
    await userEvent.click(await screen.findByRole('button', { name: /Log purchase rate/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Log purchase rate' });
    await within(dialog).findByRole('option', { name: 'Fresh Fruits' });
    await userEvent.selectOptions(within(dialog).getByLabelText('Element'), 'e1');
    expect(within(dialog).getByLabelText('Unit')).toHaveValue('Kg');
    await userEvent.click(within(dialog).getByRole('button', { name: '+ Add a new vendor' }));
    await userEvent.type(within(dialog).getByLabelText('New vendor name'), 'New Vendor');
    await userEvent.type(within(dialog).getByLabelText('Rate per unit'), '175');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save entry' }));
    await waitFor(() => expect(ratesApi.createVendor).toHaveBeenCalledWith('New Vendor'));
    expect(ratesApi.addEntry).toHaveBeenCalledWith(expect.objectContaining({ element_id: 'e1', vendor_id: 'v9', qty: 1, unit: 'Kg', rate_per_unit: 175 }));
  });

  it('voids an entry only with a reason', async () => {
    renderApp('/admin/rate-history');
    await userEvent.click(await screen.findByRole('button', { name: /History \(4\)/ }));
    await userEvent.click((await screen.findAllByRole('button', { name: /^Void DIGANI/ }))[0]!);
    const dialog = await screen.findByRole('dialog', { name: 'Void this entry?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Void entry' }));
    expect(within(dialog).getByText('Give a reason for voiding.')).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText('Reason'), 'Wrong rate typed');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Void entry' }));
    await waitFor(() => expect(ratesApi.voidEntry).toHaveBeenCalledWith('r1', 'Wrong rate typed'));
  });

  it('shows quote overrides in their own tab with a link to the quote', async () => {
    renderApp('/admin/rate-history?tab=override');
    expect(await screen.findByRole('link', { name: 'ENT-2026-00007' })).toHaveAttribute('href', '/admin/quotes/q1');
    expect(ratesApi.logs).toHaveBeenCalledWith('quote_override', null);
    expect(screen.getByText('Standard rate')).toBeInTheDocument();
  });

  it('keeps master rate changes separate', async () => {
    renderApp('/admin/rate-history');
    await userEvent.click(await screen.findByRole('tab', { name: 'Master rate changes' }));
    await waitFor(() => expect(ratesApi.logs).toHaveBeenCalledWith('master_rate', null));
  });
});
