/**
 * Tests for the Packages list and the package editor, with packagesApi mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '@/test/renderApp';
import { packagesApi, type PackageSummary, type PickerElement } from '../packages/packagesApi';
import { eventOptionsApi } from '@/data/eventOptions';

vi.mock('../packages/packagesApi', () => ({
  PICKER_LIMIT: 1000,
  packagesApi: {
    list: vi.fn(),
    get: vi.fn(),
    save: vi.fn(),
    setActive: vi.fn(),
    remove: vi.fn(),
    tiers: vi.fn(),
    pickerElements: vi.fn(),
  },
}));

const api = vi.mocked(packagesApi);

const summary = (o: Partial<PackageSummary> = {}): PackageSummary => ({
  id: 'p1',
  name: 'Royal Package',
  tier_id: 't2',
  tier_name: 'Premium',
  display_price: 250000,
  description: null,
  image_path: null,
  video_url: null,
  is_active: true,
  updated_at: '2026-10-20T10:00:00Z',
  element_count: 4,
  elements_total: 180000,
  functions: ['Wedding'],
  ...o,
});

const pick = (o: Partial<PickerElement>): PickerElement => ({
  id: 'e1',
  name: 'Entrance Arch',
  unit: 'Nos',
  default_rate: 25000,
  default_qty: 1,
  image_path: null,
  is_active: true,
  ...o,
});

const ELEMENTS = [
  pick({ id: 'e1', name: 'Entrance Arch', default_rate: 25000, default_qty: 1 }),
  pick({ id: 'e2', name: 'Sofa Lounge', default_rate: 15000, default_qty: 2, unit: 'Set', remarks: 'Bride entry' }),
  pick({ id: 'e3', name: 'Stage Backdrop', default_rate: 40000, default_qty: null }),
];

beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue({ rows: [summary(), summary({ id: 'p2', name: 'Classic Package', tier_name: 'Standard', display_price: null })], total: 2 });
  api.tiers.mockResolvedValue([
    { id: 't1', name: 'Standard' },
    { id: 't2', name: 'Premium' },
  ]);
  api.pickerElements.mockResolvedValue(ELEMENTS);
  api.save.mockResolvedValue('p-new');
  api.setActive.mockResolvedValue(undefined);
  api.remove.mockResolvedValue(undefined);
  api.get.mockResolvedValue({
    id: 'p1',
    name: 'Royal Package',
    tier_id: 't2',
    display_price: 250000,
    description: 'Grand setup',
    image_path: null,
    video_url: null,
    is_active: true,
    updated_at: '2026-10-20T10:00:00Z',
    items: [
      { element_id: 'e1', default_qty: 1 },
      { element_id: 'e9', default_qty: 3 },
    ],
    function_ids: ['f-wed'],
  });
  vi.spyOn(eventOptionsApi, 'fetch').mockResolvedValue({
    functions: [
      { id: 'f-wed', name: 'Wedding', lms_id: 3 },
      { id: 'f-san', name: 'Sangeet', lms_id: 20 },
    ],
    venues: [],
    subVenues: [],
    sessions: [],
  });
});

describe('PackagesPage', () => {
  it('shows package cards with tier, count and price', async () => {
    renderApp('/admin/packages');
    expect(await screen.findByText('Royal Package')).toBeInTheDocument();
    expect(screen.getByText('₹2,50,000.00')).toBeInTheDocument();
    expect(screen.getAllByText('4 elements', { selector: 'p' })).toHaveLength(2);
    expect(screen.getByText('Not set')).toBeInTheDocument(); // no display price
    expect(within(screen.getByRole('list', { name: 'Functions for Royal Package' })).getByText('Wedding')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Functions for Classic Package' })).getByText('Wedding')).toBeInTheDocument();
    expect(api.list).toHaveBeenLastCalledWith({ search: '', status: 'active', tierId: null, page: 1, pageSize: 25 });
  });

  it('filters by tier', async () => {
    renderApp('/admin/packages');
    await screen.findByText('Royal Package');
    await screen.findByRole('option', { name: 'Premium' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Tier' }), 't2');
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ tierId: 't2', page: 1 })));
  });

  it('deactivates a package', async () => {
    renderApp('/admin/packages');
    await screen.findByText('Royal Package');
    await userEvent.click(screen.getAllByRole('button', { name: 'Deactivate' })[0]!);
    await waitFor(() => expect(api.setActive).toHaveBeenCalledWith('p1', false));
    expect(await screen.findByText('"Royal Package" deactivated.')).toBeInTheDocument();
  });

  it('deletes a package only after confirmation', async () => {
    renderApp('/admin/packages');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Royal Package' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete "Royal Package" permanently?' });
    expect(api.remove).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('p1'));
    expect(await screen.findByText('"Royal Package" deleted.')).toBeInTheDocument();
  });

  it('invites creating the first package', async () => {
    api.list.mockResolvedValue({ rows: [], total: 0 });
    renderApp('/admin/packages');
    expect(await screen.findByText('Create your first package')).toBeInTheDocument();
  });
});

describe('PackageEditorPage', () => {
  it('creates a package from ticked elements with live total', async () => {
    const { router } = renderApp('/admin/packages/new');
    await userEvent.type(await screen.findByLabelText('Package name'), 'Elegant Package');
    await userEvent.selectOptions(screen.getByLabelText('Tier'), 't2');
    // functions are optional — pick one, then remove and re-add to prove the chips work
    await screen.findByRole('option', { name: 'Sangeet' });
    await userEvent.selectOptions(screen.getByLabelText(/Functions/), 'f-san');
    expect(within(screen.getByRole('list', { name: 'Chosen functions' })).getByText('Sangeet')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Include Sofa Lounge'));
    expect(screen.getByLabelText('Default quantity for Sofa Lounge')).toHaveValue('2');
    await userEvent.click(screen.getByLabelText('Include Entrance Arch'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByText('Bride entry')).toBeInTheDocument(); // element remarks under the name
    expect(screen.getByText(/Elements total/).parentElement).toHaveTextContent('₹55,000.00');

    const qty = screen.getByLabelText('Default quantity for Entrance Arch');
    await userEvent.clear(qty);
    await userEvent.type(qty, '2');
    expect(screen.getByText(/Elements total/).parentElement).toHaveTextContent('₹80,000.00');

    await userEvent.click(screen.getByRole('button', { name: 'Create package' }));
    await waitFor(() =>
      expect(api.save).toHaveBeenCalledWith(null, {
        name: 'Elegant Package',
        tier_id: 't2',
        display_price: null,
        description: null,
        image_path: null,
        video_url: null,
        is_active: true,
        items: [
          { element_id: 'e2', default_qty: 2 },
          { element_id: 'e1', default_qty: 2 },
        ],
        function_ids: ['f-san'],
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/packages'));
  });

  it('lets the function be left empty (suits any function)', async () => {
    renderApp('/admin/packages/new');
    await screen.findByLabelText('Package name');
    expect(screen.getByLabelText(/Functions/)).toHaveValue('');
    expect(screen.getByText(/No function = suits any function/)).toBeInTheDocument();
  });

  it('requires a name and at least one element, and flags bad quantities', async () => {
    renderApp('/admin/packages/new');
    await userEvent.click(await screen.findByRole('button', { name: 'Create package' }));
    expect(screen.getByText('Enter a package name.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Select at least one element.');

    await userEvent.type(screen.getByLabelText('Package name'), 'X');
    await userEvent.click(screen.getByLabelText('Include Stage Backdrop'));
    const qty = screen.getByLabelText('Default quantity for Stage Backdrop');
    await userEvent.clear(qty);
    await userEvent.type(qty, '0');
    await userEvent.click(screen.getByRole('button', { name: 'Create package' }));
    expect(screen.getByText('Qty > 0')).toBeInTheDocument();
    expect(api.save).not.toHaveBeenCalled();
  });

  it('loads an existing package, keeps archived elements and filters to selected', async () => {
    api.pickerElements.mockResolvedValue([...ELEMENTS, pick({ id: 'e9', name: 'Old Fog Machine', is_active: false, default_rate: 1000 })]);
    renderApp('/admin/packages/p1');
    expect(await screen.findByLabelText('Package name')).toHaveValue('Royal Package');
    await waitFor(() => expect(api.pickerElements).toHaveBeenCalledWith(['e1', 'e9']));
    expect(screen.getByLabelText('Include Old Fog Machine')).toBeChecked();
    expect(await screen.findByRole('button', { name: 'Remove Wedding' })).toBeInTheDocument(); // saved function
    expect(screen.getByText(/can't be re-added/)).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Selected only'));
    const rows = within(screen.getByRole('region', { name: 'Package elements' })).getAllByRole('checkbox', { name: /^Include/ });
    expect(rows).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Save package' }));
    await waitFor(() =>
      expect(api.save).toHaveBeenCalledWith('p1', expect.objectContaining({ items: [{ element_id: 'e1', default_qty: 1 }, { element_id: 'e9', default_qty: 3 }] })),
    );
  });

  it('warns before leaving with unsaved changes', async () => {
    const { router } = renderApp('/admin/packages/new');
    await userEvent.type(await screen.findByLabelText('Package name'), 'Draft');
    await userEvent.click(screen.getByRole('link', { name: 'Cancel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(router.state.location.pathname).toBe('/admin/packages/new');
    expect(screen.getByLabelText('Package name')).toHaveValue('Draft');

    await userEvent.click(screen.getByRole('link', { name: 'Cancel' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Discard changes' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/packages'));
  });

  it('shows the server message when a duplicate package exists', async () => {
    api.save.mockRejectedValue({ code: '23505' });
    renderApp('/admin/packages/new');
    await userEvent.type(await screen.findByLabelText('Package name'), 'Royal Package');
    await userEvent.click(screen.getByLabelText('Include Entrance Arch'));
    await userEvent.click(screen.getByRole('button', { name: 'Create package' }));
    expect(await screen.findByText('An active package with this name already exists in this tier.')).toBeInTheDocument();
  });
});
