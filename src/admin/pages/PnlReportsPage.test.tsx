/**
 * Tests for the P&L Reports screen (pnlApi mocked).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '@/test/renderApp';
import { eventOptionsApi } from '@/data/eventOptions';
import { quoteLedgerApi } from '../quotes/quoteLedgerApi';
import { pnlApi, type PnlRow } from '../pnl/pnlApi';

const row = (o: Partial<PnlRow> = {}): PnlRow => ({
  id: 'q1',
  quote_no: 'ENT-2026-00002',
  status: 'confirmed',
  event_date: '2026-12-12',
  guest_name: 'Mehta Family',
  function_name: 'Sangeet',
  package_name: 'Royal Package',
  elements_selling: 2600,
  charges_total: 1000,
  known_cost: 1650,
  missing_cost_lines: 0,
  elements_cost: 1650,
  profit: 950,
  margin_pct: 36.54,
  ...o,
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(eventOptionsApi, 'fetch').mockResolvedValue({ functions: [{ id: 'f1', name: 'Sangeet', lms_id: 20 }], venues: [], subVenues: [], sessions: [] });
  vi.spyOn(quoteLedgerApi, 'packages').mockResolvedValue([{ id: 'p1', label: 'Royal Package · Premium' }]);
  vi.spyOn(pnlApi, 'totals').mockResolvedValue({
    quotes: 2,
    complete_quotes: 1,
    incomplete_quotes: 1,
    elements_selling: 2600,
    elements_cost: 1650,
    profit: 950,
    margin_pct: 36.54,
    charges_total: 1500,
    all_selling: 3100,
  });
  vi.spyOn(pnlApi, 'list').mockResolvedValue({
    rows: [row(), row({ id: 'q2', quote_no: 'ENT-2026-00003', guest_name: 'Kapoor Wedding', missing_cost_lines: 2, elements_cost: null, profit: null, margin_pct: null })],
    total: 2,
  });
  vi.spyOn(pnlApi, 'lines').mockResolvedValue([
    { id: 'l1', element_name: 'Entrance Arch', unit: 'Nos', qty: 2, rate: 1000, selling: 2000, unit_cost: 600, cost_source: 'fixed', cost: 1200, profit: 800, margin_pct: 40, package_name: 'Royal Package' },
    { id: 'l2', element_name: 'Fresh Flowers', unit: 'Kg', qty: 3, rate: 200, selling: 600, unit_cost: 150, cost_source: 'base_rate', cost: 450, profit: 150, margin_pct: 25, package_name: 'Royal Package' },
  ]);
});

describe('P&L Reports', () => {
  it('shows totals for confirmed quotes by default, with pass-through charges noted', async () => {
    renderApp('/admin/reports/pnl');
    expect(await screen.findByText('₹950.00', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('36.5%', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('1 of 2 quotes')).toBeInTheDocument();
    expect(screen.getByText(/Additional charges ₹1,500.00 are pass-through/)).toBeInTheDocument();
    expect(pnlApi.totals).toHaveBeenCalledWith({ status: 'confirmed', from: null, to: null, functionName: null, packageId: null });
  });

  it('flags quotes with missing cost instead of treating it as zero', async () => {
    renderApp('/admin/reports/pnl');
    expect(await screen.findByText('Cost missing (2 elements)')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 quote has elements without a cost');
    const kapoor = screen.getByText('Kapoor Wedding').closest('tr')!;
    expect(within(kapoor).getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('expands a quote into its element lines with cost source', async () => {
    renderApp('/admin/reports/pnl');
    await userEvent.click(await screen.findByRole('button', { name: 'Show lines for ENT-2026-00002' }));
    expect(await screen.findByText('Fresh Flowers')).toBeInTheDocument();
    expect(screen.getByText('Fixed cost')).toBeInTheDocument();
    expect(screen.getByText('Cost rate', { selector: 'span' })).toBeInTheDocument(); // cost = the element's cost rate (0026)
    expect(screen.getByRole('columnheader', { name: 'Cost rate' })).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument();
    expect(pnlApi.lines).toHaveBeenCalledWith('q1');
  });

  it('filters by status, function, package and event dates', async () => {
    renderApp('/admin/reports/pnl');
    await screen.findByText('Mehta Family');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'all');
    await screen.findByRole('option', { name: 'Royal Package · Premium' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Package' }), 'p1');
    await userEvent.type(screen.getByLabelText('Event from'), '2026-12-01');
    await waitFor(() =>
      expect(vi.mocked(pnlApi.totals).mock.calls.at(-1)![0]).toEqual({
        status: 'all',
        from: '2026-12-01',
        to: null,
        functionName: null,
        packageId: 'p1',
      }),
    );
  });
});
