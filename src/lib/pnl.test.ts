/**
 * Tests for the P&L formulas, including zero selling and missing cost.
 */
import { describe, expect, it } from 'vitest';
import { formatPct, lineCost, marginPct, profit, profitTone } from './pnl';

describe('P&L formulas', () => {
  it('Total Cost = Quantity × Unit Cost', () => {
    expect(lineCost(3, 150)).toBe(450);
    expect(lineCost(0.5, 190)).toBe(95);
  });

  it('Profit = Selling − Cost and Margin % = Profit ÷ Selling × 100', () => {
    expect(profit(2600, 1650)).toBe(950);
    expect(marginPct(2600, 1650)).toBe(36.54);
    expect(marginPct(1000, 600)).toBe(40);
  });

  it('handles losses', () => {
    expect(profit(500, 800)).toBe(-300);
    expect(marginPct(500, 800)).toBe(-60);
  });

  it('is safe when selling is zero', () => {
    expect(profit(0, 600)).toBe(-600);
    expect(marginPct(0, 600)).toBeNull();
    expect(marginPct(0, 0)).toBeNull();
  });

  it('never treats a missing cost as zero', () => {
    expect(lineCost(2, null)).toBeNull();
    expect(profit(1000, null)).toBeNull();
    expect(marginPct(1000, null)).toBeNull();
  });
});

describe('display helpers', () => {
  it('formats percentages and colours by sign', () => {
    expect(formatPct(36.54)).toBe('36.5%');
    expect(formatPct(null)).toBe('—');
    expect(profitTone(-1)).toContain('rose');
    expect(profitTone(10)).toContain('emerald');
    expect(profitTone(null)).toContain('slate');
  });
});
