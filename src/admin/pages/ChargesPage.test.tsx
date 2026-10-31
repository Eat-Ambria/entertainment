/**
 * Tests for Catalogue → Additional charges (Transportation / Labour master rates, per venue).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '@/test/renderApp';
import { chargeRatesApi } from '@/data/chargeRates';
import { eventOptionsApi } from '@/data/eventOptions';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(eventOptionsApi, 'fetch').mockResolvedValue({
    functions: [],
    venues: [
      { id: 'v-exo', name: 'Ambria Exotica', lms_id: 19 },
      { id: 'v-push', name: 'Ambria Pushpanjali', lms_id: 3 },
      { id: 'v-mk', name: 'Manaktala', lms_id: 6 },
    ],
    subVenues: [],
    sessions: [],
  });
  vi.spyOn(chargeRatesApi, 'list').mockResolvedValue([
    { id: 'r1', code: 'transportation', label: 'Transportation', mode: 'fixed', rate: 2000, qty_per_package: 1, auto_add: true, sort_order: 1, venues: [] },
    {
      id: 'r2',
      code: 'labour',
      label: 'Labour',
      mode: 'per_package',
      rate: 500,
      qty_per_package: 2,
      auto_add: true,
      sort_order: 2,
      venues: [{ venue_id: 'v-push', rate: 600, qty_per_package: 3 }],
    },
  ]);
  vi.spyOn(chargeRatesApi, 'save').mockResolvedValue(undefined);
});

describe('Additional charges page', () => {
  it('is listed under Catalogue', async () => {
    renderApp('/admin/charges');
    expect(await screen.findByRole('heading', { level: 1, name: 'Additional charges' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Additional charges/ })[0]).toHaveAttribute('href', '/admin/charges');
  });

  it('Transportation has a row per venue; Labour has one rate for every venue', async () => {
    renderApp('/admin/charges');
    const transport = await screen.findByRole('form', { name: 'Transportation rates' });
    expect(within(transport).getByLabelText('Transportation amount at Default')).toHaveValue('2000');
    expect(within(transport).getByLabelText('Transportation amount at Manaktala')).toHaveValue('');

    const labour = screen.getByRole('form', { name: 'Labour rates' });
    expect(within(labour).getByLabelText('Labour rate per labour at All venues')).toHaveValue('500');
    expect(within(labour).getByLabelText('Labour per package at All venues')).toHaveValue('2');
    expect(within(labour).queryByLabelText(/at Ambria Pushpanjali/)).not.toBeInTheDocument();
    expect(within(labour).getByText('1 package → ₹1,000.00')).toBeInTheDocument();
  });

  it('saving Labour clears any old venue rates', async () => {
    renderApp('/admin/charges');
    const labour = await screen.findByRole('form', { name: 'Labour rates' });
    const rate = within(labour).getByLabelText('Labour rate per labour at All venues');
    await userEvent.clear(rate);
    await userEvent.type(rate, '550');
    await userEvent.click(within(labour).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(chargeRatesApi.save).toHaveBeenCalledWith('r2', { rate: 550, qty_per_package: 2, venues: [] }));
  });

  it('saves Transportation per venue; blank venues use the default', async () => {
    renderApp('/admin/charges');
    const transport = await screen.findByRole('form', { name: 'Transportation rates' });
    await userEvent.type(within(transport).getByLabelText('Transportation amount at Ambria Exotica'), '2500');
    await userEvent.type(within(transport).getByLabelText('Transportation amount at Manaktala'), '0');
    await userEvent.click(within(transport).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(chargeRatesApi.save).toHaveBeenCalledWith('r1', {
        rate: 2000,
        qty_per_package: null,
        venues: [
          { venue_id: 'v-exo', rate: 2500, qty_per_package: null },
          { venue_id: 'v-mk', rate: 0, qty_per_package: null },
        ],
      }),
    );
  });

  it('refuses an invalid amount', async () => {
    renderApp('/admin/charges');
    const transport = await screen.findByRole('form', { name: 'Transportation rates' });
    await userEvent.type(within(transport).getByLabelText('Transportation amount at Ambria Exotica'), 'abc');
    await userEvent.click(within(transport).getByRole('button', { name: 'Save' }));
    expect(within(transport).getByText('Enter a valid amount')).toBeInTheDocument();
    expect(chargeRatesApi.save).not.toHaveBeenCalled();
  });
});
