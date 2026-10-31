/**
 * Tests for the Elements screen with the Supabase layer (elementsApi) mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '@/test/renderApp';
import { elementsApi, type Element } from '../elements/elementsApi';

vi.mock('../elements/elementsApi', () => ({
  elementsApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setActive: vi.fn(),
    remove: vi.fn(),
    rateHistory: vi.fn(),
  },
}));

const api = vi.mocked(elementsApi);

const el = (o: Partial<Element> = {}): Element => ({
  id: 'e1',
  name: 'Entrance Arch',
  unit: 'Nos',
  default_rate: 25000,
  multiplier: 1,
  selling_rate: 25000,
  default_qty: 1,
  remarks: null,
  image_path: null,
  is_active: true,
  updated_at: '2026-10-18T10:00:00Z',
  ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue({ rows: [el(), el({ id: 'e2', name: 'Stage Backdrop', default_rate: 20000, multiplier: 2, selling_rate: 40000, unit: null, remarks: 'Main stage, Pushpanjali' })], total: 2 });
  api.rateHistory.mockResolvedValue([
    { id: 'h1', old_rate: 20000, new_rate: 25000, reason: 'Vendor price increase', changed_at: '2026-10-18T10:00:00Z' },
  ]);
  api.create.mockImplementation(async (input) => el({ ...input, id: 'new' }));
  api.update.mockImplementation(async (id, input) => el({ ...input, id }));
  api.setActive.mockResolvedValue(undefined);
  api.remove.mockResolvedValue(undefined);
});

const lastListCall = () => api.list.mock.calls.at(-1)![0];

describe('ElementsPage', () => {
  it('lists active elements with formatted rates', async () => {
    renderApp('/admin/elements');
    expect(await screen.findByText('Entrance Arch')).toBeInTheDocument();
    expect(screen.getAllByText('₹25,000.00')).toHaveLength(2); // cost rate = guest rate at × 1
    const backdrop = screen.getByRole('row', { name: /Stage Backdrop/ });
    expect(backdrop).toHaveTextContent('₹20,000.00'); // cost rate
    expect(backdrop).toHaveTextContent('× 2'); // multiplier
    expect(backdrop).toHaveTextContent('₹40,000.00'); // guest rate
    expect(screen.getByRole('columnheader', { name: 'Remarks' })).toBeInTheDocument();
    expect(within(screen.getByRole('row', { name: /Stage Backdrop/ })).getByText('Main stage, Pushpanjali')).toBeInTheDocument();
    expect(lastListCall()).toEqual({ search: '', status: 'active', sort: 'name', page: 1, pageSize: 25 });
  });

  it('searches on the server after typing stops', async () => {
    renderApp('/admin/elements');
    await screen.findByText('Entrance Arch');
    await userEvent.type(screen.getByPlaceholderText('Search elements'), 'arch');
    await waitFor(() => expect(lastListCall()).toMatchObject({ search: 'arch', page: 1 }));
    expect(api.list.mock.calls.filter((c) => c[0].search === 'ar')).toHaveLength(0);
  });

  it('switches to archived, sorts and paginates via the URL', async () => {
    api.list.mockResolvedValue({ rows: [el()], total: 60 });
    const { router } = renderApp('/admin/elements');
    await screen.findByText('Entrance Arch');

    await userEvent.click(screen.getByRole('tab', { name: 'archived' }));
    await waitFor(() => expect(lastListCall()).toMatchObject({ status: 'archived' }));

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Sort by' }), 'rate_desc');
    await waitFor(() => expect(lastListCall()).toMatchObject({ sort: 'rate_desc' }));

    await userEvent.click(await screen.findByRole('button', { name: '2' }));
    await waitFor(() => expect(lastListCall()).toMatchObject({ page: 2, status: 'archived', sort: 'rate_desc' }));
    expect(router.state.location.search).toContain('page=2');
  });

  it('shows a helpful empty state', async () => {
    api.list.mockResolvedValue({ rows: [], total: 0 });
    renderApp('/admin/elements');
    expect(await screen.findByText('Add your first element')).toBeInTheDocument();
  });

  it('validates and creates an element', async () => {
    renderApp('/admin/elements');
    await screen.findByText('Entrance Arch');
    await userEvent.click(screen.getByRole('button', { name: /Add element/ }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Add element' }));
    expect(within(dialog).getByText('Enter a name.')).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();

    await userEvent.type(within(dialog).getByLabelText('Name'), 'Sofa Lounge');
    await userEvent.type(within(dialog).getByLabelText('Cost rate'), '15,000');
    await userEvent.type(within(dialog).getByLabelText('Unit'), 'Set');
    await userEvent.type(within(dialog).getByLabelText('Remarks'), 'Bride entry, Exotica lawn');
    await userEvent.type(within(dialog).getByLabelText('Multiplier'), '2');
    expect(within(dialog).getByRole('status', { name: 'Guest rate' })).toHaveTextContent('₹30,000.00'); // 15,000 × 2
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add element' }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        name: 'Sofa Lounge',
        unit: 'Set',
        default_rate: 15000,
        multiplier: 2,
        default_qty: 1,
        remarks: 'Bride entry, Exotica lawn',
        image_path: null,
      }),
    );
    expect(await screen.findByText('Element added.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('asks for a reason when the rate changes and shows recent changes', async () => {
    renderApp('/admin/elements');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Entrance Arch' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Vendor price increase')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Reason for rate change')).not.toBeInTheDocument();

    const rate = within(dialog).getByLabelText('Cost rate');
    await userEvent.clear(rate);
    await userEvent.type(rate, '27500');
    await userEvent.type(within(dialog).getByLabelText('Reason for rate change'), 'New vendor');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(
        'e1',
        { name: 'Entrance Arch', unit: 'Nos', default_rate: 27500, multiplier: 1, default_qty: 1, remarks: null, image_path: null },
        'New vendor',
      ),
    );
  });

  it('does not send a reason when only the name changes', async () => {
    renderApp('/admin/elements');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Entrance Arch' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Name'), ' XL');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('e1', expect.objectContaining({ name: 'Entrance Arch XL' }), null));
  });

  it('shows a clear message for a duplicate name', async () => {
    api.create.mockRejectedValue({ code: '23505' });
    renderApp('/admin/elements');
    await userEvent.click(await screen.findByRole('button', { name: /Add element/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Entrance Arch');
    await userEvent.type(within(dialog).getByLabelText('Cost rate'), '1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add element' }));
    expect(await within(dialog).findByText('An active element with this name already exists.')).toBeInTheDocument();
  });

  it('archives only after confirmation', async () => {
    renderApp('/admin/elements');
    await userEvent.click(await screen.findByRole('button', { name: 'Archive Entrance Arch' }));
    const dialog = await screen.findByRole('dialog', { name: 'Archive "Entrance Arch"?' });
    expect(api.setActive).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(api.setActive).toHaveBeenCalledWith('e1', false));
    expect(await screen.findByText('"Entrance Arch" archived.')).toBeInTheDocument();
  });

  it('deletes permanently only after confirmation', async () => {
    renderApp('/admin/elements');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Entrance Arch' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete "Entrance Arch" permanently?' });
    expect(within(dialog).getByText(/keep their copy/)).toBeInTheDocument();
    expect(api.remove).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('e1'));
    expect(await screen.findByText('"Entrance Arch" deleted.')).toBeInTheDocument();
  });

  it('explains why an element in a package cannot be deleted', async () => {
    api.remove.mockRejectedValue({
      code: '23503',
      hint: 'in_packages',
      message: 'This element is in 2 package(s). Remove it from those packages first, or archive it.',
    });
    renderApp('/admin/elements');
    await userEvent.click(await screen.findByRole('button', { name: 'Delete Entrance Arch' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete permanently' }));
    expect(
      await screen.findByText('This element is in 2 package(s). Remove it from those packages first, or archive it.'),
    ).toBeInTheDocument();
  });

  it('restores archived elements in one click', async () => {
    api.list.mockResolvedValue({ rows: [el({ is_active: false })], total: 1 });
    renderApp('/admin/elements?status=archived');
    await userEvent.click(await screen.findByRole('button', { name: 'Restore Entrance Arch' }));
    await waitFor(() => expect(api.setActive).toHaveBeenCalledWith('e1', true));
    expect(screen.queryByRole('button', { name: 'Edit Entrance Arch' })).not.toBeInTheDocument();
  });

  it('shows an error with retry when loading fails', async () => {
    api.list.mockRejectedValueOnce({ code: 'XX000', message: 'secret internals' });
    renderApp('/admin/elements');
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    expect(screen.queryByText(/secret internals/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Entrance Arch')).toBeInTheDocument();
  });
});
