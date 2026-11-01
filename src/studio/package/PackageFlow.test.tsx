/**
 * Tests for Guest Studio steps 2 (Packages, multi-select) and 3 (Customise, one section per
 * package), with catalogue reads mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp, testProfile } from '@/test/renderApp';
import { eventOptionsApi } from '@/data/eventOptions';
import { studioCatalogApi, type StudioPackage } from '@/data/studioCatalog';
import { getQuoteDraft, setQuoteDraft } from '../quoteDraft';

const pkg = (o: Partial<StudioPackage>): StudioPackage => ({
  id: 'p1',
  name: 'Royal Package',
  tier_name: 'Premium',
  display_price: 250000,
  description: 'Grand entrance and lounge',
  image_path: null,
  video_url: 'https://youtu.be/royal',
  ...o,
});

const LINES = {
  p1: [
    { element_id: 'e1', name: 'Entrance Arch', unit: 'Nos', image_path: null, default_rate: 25000, default_qty: 1 },
    { element_id: 'e2', name: 'Sofa Lounge', unit: 'Set', image_path: null, default_rate: 15000, default_qty: 2, remarks: 'Bride entry, Exotica lawn' },
  ],
  p2: [
    { element_id: 'e1', name: 'Entrance Arch', unit: 'Nos', image_path: null, default_rate: 25000, default_qty: 1 },
    { element_id: 'e3', name: 'DJ', unit: 'Hour', image_path: null, default_rate: 8000, default_qty: 4 },
  ],
} as const;

const draft = () => getQuoteDraft(testProfile.id);
const amountOf = (label: string) => screen.getByLabelText(label).textContent;

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.spyOn(eventOptionsApi, 'fetch').mockResolvedValue({
    functions: [{ id: 'f1', name: 'Sangeet', lms_id: 20 }],
    venues: [{ id: 'v1', name: 'Ambria Exotica', lms_id: 19 }],
    subVenues: [],
    sessions: [{ id: 's1', name: 'Dinner' }],
  });
  vi.spyOn(studioCatalogApi, 'listActivePackages').mockResolvedValue({
    rows: [pkg({}), pkg({ id: 'p2', name: 'Classic Package', tier_name: 'Standard', display_price: null, video_url: null })],
    total: 2,
  });
  vi.spyOn(studioCatalogApi, 'packageLines').mockImplementation(async (id) => LINES[id as 'p1' | 'p2'].map((l) => ({ ...l })));
  setQuoteDraft(testProfile.id, (d) => ({
    ...d,
    guest: {
      source: 'manual',
      sourceRef: null,
      sourceRaw: null,
      guestName: 'Mehta Family',
      phone: '9876543210',
      functionId: 'f1',
      venueId: 'v1',
      subVenueId: null,
      eventDate: '2027-01-10',
      sessionId: 's1',
    },
  }));
});

describe('Packages step (multi-select)', () => {
  it('shows every active package with tier and video (no price), and the guest summary', async () => {
    renderApp('/studio/new?step=package');
    expect(await screen.findByRole('checkbox', { name: 'Royal Package, Premium' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Classic Package, Standard' })).toBeInTheDocument();
    expect(screen.queryByText('₹2,50,000.00')).not.toBeInTheDocument();
    expect(screen.queryByText('Tailored to your event')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Watch video/ })).toHaveAttribute('href', 'https://youtu.be/royal');
    expect(await screen.findByText(/Sangeet/)).toBeInTheDocument();
    expect(studioCatalogApi.listActivePackages).toHaveBeenCalledWith(0, 'f1'); // guest's function first, nothing hidden
  });

  it('selects several packages in order and continues', async () => {
    const { router } = renderApp('/studio/new?step=package');
    const cont = await screen.findByRole('button', { name: /^Continue/ });
    expect(cont).toBeDisabled();
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Classic Package, Standard' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Royal Package, Premium' }));
    expect(screen.getByText('2 packages selected')).toBeInTheDocument();
    expect(draft().packages.map((b) => b.id)).toEqual(['p2', 'p1']);

    await userEvent.click(screen.getByRole('checkbox', { name: 'Classic Package, Standard' }));
    expect(draft().packages.map((b) => b.id)).toEqual(['p1']);

    await userEvent.click(cont);
    await waitFor(() => expect(router.state.location.search).toBe('?step=customise'));
  });

  it("shows the guest's function packages first and the rest under Other packages", async () => {
    vi.mocked(studioCatalogApi.listActivePackages).mockResolvedValue({
      rows: [pkg({ id: 'p2', name: 'Classic Package', tier_name: 'Standard', for_function: true }), pkg({ for_function: false })],
      total: 2,
    });
    renderApp('/studio/new?step=package');
    const mine = await screen.findByRole('group', { name: 'Packages for Sangeet' });
    expect(within(mine).getByRole('checkbox', { name: 'Classic Package, Standard' })).toBeInTheDocument();
    const rest = screen.getByRole('group', { name: 'Other packages' });
    expect(within(rest).getByRole('checkbox', { name: 'Royal Package, Premium' })).toBeInTheDocument();
  });
});

describe('Customise step', () => {
  const choose = (...ids: ('p1' | 'p2')[]) =>
    setQuoteDraft(testProfile.id, (d) => ({
      ...d,
      packages: ids.map((id) => ({ id, name: id === 'p1' ? 'Royal Package' : 'Classic Package', tier: id === 'p1' ? 'Premium' : 'Standard', lines: null })),
    }));

  it('loads one package at its defaults with nothing ticked; the user ticks elements', async () => {
    choose('p1');
    renderApp('/studio/new?step=customise');
    expect(await screen.findByText('Entrance Arch')).toBeInTheDocument();
    expect(screen.getByLabelText('Include Entrance Arch')).not.toBeChecked();
    expect(screen.getByLabelText('Include Sofa Lounge')).not.toBeChecked();
    expect(screen.getByText('0 of 2 elements included')).toBeInTheDocument();
    expect(screen.getByLabelText('Remarks for Sofa Lounge')).toHaveTextContent('Bride entry, Exotica lawn'); // own column next to Qty / Rate / Amount
    expect(screen.getByLabelText('Quantity for Sofa Lounge')).toHaveValue('2');
    expect(amountOf('Royal Package subtotal')).toBe('₹0.00');

    expect(screen.queryByRole('button', { name: /Select all|Clear all/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Include Entrance Arch'));
    await userEvent.click(screen.getByLabelText('Include Sofa Lounge'));
    expect(amountOf('Royal Package subtotal')).toBe('₹55,000.00');
    expect(amountOf('Elements total')).toBe('₹55,000.00');
  });

  it('shows a section per package with its own subtotal; a shared element appears in both', async () => {
    choose('p1', 'p2');
    renderApp('/studio/new?step=customise');
    const royal = await screen.findByRole('region', { name: 'Royal Package' });
    const classic = screen.getByRole('region', { name: 'Classic Package' });
    for (const cb of [...within(royal).getAllByRole('checkbox'), ...within(classic).getAllByRole('checkbox')]) await userEvent.click(cb);
    expect(within(royal).getByText('Entrance Arch')).toBeInTheDocument();
    expect(within(classic).getByText('Entrance Arch')).toBeInTheDocument();
    expect(amountOf('Royal Package subtotal')).toBe('₹55,000.00');
    expect(amountOf('Classic Package subtotal')).toBe('₹57,000.00');
    expect(amountOf('Elements total')).toBe('₹1,12,000.00');

    // editing the arch in Classic leaves the arch in Royal alone
    const qty = screen.getByLabelText('Quantity for Entrance Arch in Classic Package');
    await userEvent.clear(qty);
    await userEvent.type(qty, '2');
    expect(amountOf('Classic Package subtotal')).toBe('₹82,000.00');
    expect(amountOf('Royal Package subtotal')).toBe('₹55,000.00');
    expect(amountOf('Elements total')).toBe('₹1,37,000.00');
  });

  it('keeps rates read-only until staff choose Adjust rates', async () => {
    choose('p1');
    renderApp('/studio/new?step=customise');
    expect(await screen.findByLabelText('Rate for Entrance Arch')).toHaveTextContent('₹25,000.00');
    await userEvent.click(screen.getByLabelText('Include Entrance Arch'));
    await userEvent.click(screen.getByLabelText('Include Sofa Lounge'));
    expect(screen.queryByRole('textbox', { name: 'Rate for Entrance Arch' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Adjust rates/ }));
    const rate = screen.getByRole('textbox', { name: 'Rate for Entrance Arch' });
    await userEvent.clear(rate);
    await userEvent.type(rate, '20000');
    expect(amountOf('Elements total')).toBe('₹50,000.00');
    expect(screen.queryByText(/master|override|default rate/i)).not.toBeInTheDocument();
  });

  it('blocks continuing with an empty package or invalid line', async () => {
    choose('p1', 'p2');
    const { router } = renderApp('/studio/new?step=customise');
    await userEvent.click(await screen.findByLabelText('Include Entrance Arch in Royal Package'));
    await userEvent.click(screen.getByLabelText('Include Sofa Lounge in Royal Package'));
    await userEvent.click(screen.getByRole('button', { name: /Continue to quotation/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Include at least one element in Classic Package, or go back and remove that package.');
    expect(router.state.location.search).toBe('?step=customise');

    await userEvent.click(screen.getByLabelText('Include DJ in Classic Package'));
    const qty = screen.getByLabelText('Quantity for Sofa Lounge in Royal Package');
    await userEvent.clear(qty);
    await userEvent.click(screen.getByRole('button', { name: /Continue to quotation/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('Fix the highlighted quantities or rates.');
  });

  it('picks up a rate changed in the workspace after the package was opened', async () => {
    setQuoteDraft(testProfile.id, (d) => ({
      ...d,
      packages: [
        {
          id: 'p1',
          name: 'Royal Package',
          tier: 'Premium',
          lines: [
            { elementId: 'e1', name: 'Entrance Arch', unit: 'Nos', imagePath: null, defaultRate: 12500, defaultQty: 1, qty: '1', rate: '12500', included: true },
            { elementId: 'e2', name: 'Sofa Lounge', unit: 'Set', imagePath: null, defaultRate: 15000, defaultQty: 2, qty: '2', rate: '15000', included: false },
          ],
        },
      ],
    }));
    renderApp('/studio/new?step=customise');
    // catalogue now says 25,000 (e.g. multiplier 2 set in the workspace)
    await waitFor(() => expect(screen.getByLabelText('Rate for Entrance Arch')).toHaveTextContent('₹25,000.00'));
    expect(amountOf('Elements total')).toBe('₹25,000.00');
  });

  it('resets a package to its defaults', async () => {
    choose('p1');
    renderApp('/studio/new?step=customise');
    await userEvent.click(await screen.findByLabelText('Include Entrance Arch'));
    expect(amountOf('Elements total')).toBe('₹25,000.00');
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(amountOf('Elements total')).toBe('₹0.00');
    expect(screen.getByLabelText('Include Entrance Arch')).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
  });

  it('removes a package straight away, even after its elements were ticked', async () => {
    choose('p1', 'p2');
    renderApp('/studio/new?step=customise');
    await userEvent.click(await screen.findByLabelText('Include DJ in Classic Package'));
    await userEvent.click(screen.getByRole('button', { name: /Back/ }));

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Classic Package, Standard' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(draft().packages.map((b) => b.id)).toEqual(['p1']);
  });
});

describe('Add element (quote only)', () => {
  beforeEach(() => {
    vi.spyOn(studioCatalogApi, 'activeElements').mockResolvedValue([
      { id: 'e1', name: 'Entrance Arch', unit: 'Nos', image_path: null, default_rate: 25000, default_qty: 1 },
      { id: 'e2', name: 'Sofa Lounge', unit: 'Set', image_path: null, default_rate: 15000, default_qty: 2 },
      { id: 'e9', name: 'Fog Machine', unit: null, image_path: null, default_rate: 3000, default_qty: null },
    ]);
    setQuoteDraft(testProfile.id, (d) => ({ ...d, packages: [{ id: 'p1', name: 'Royal Package', tier: 'Premium', lines: null }] }));
  });

  it('adds an element that is not in the package, without offering ones already there', async () => {
    renderApp('/studio/new?step=customise');
    await userEvent.click(await screen.findByRole('button', { name: /Add element/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Add an element to Royal Package' });
    expect(await within(dialog).findByText('Fog Machine')).toBeInTheDocument();
    expect(within(dialog).queryByText('Entrance Arch')).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add Fog Machine' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Quantity for Fog Machine')).toHaveValue('1');
    expect(screen.getByLabelText('Include Fog Machine')).toBeChecked(); // added on purpose, so ticked
    expect(amountOf('Elements total')).toBe('₹3,000.00');
    expect(draft().packages[0]!.lines!.map((l) => l.elementId)).toEqual(['e1', 'e2', 'e9']);
  });
});
