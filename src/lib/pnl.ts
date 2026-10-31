/**
 * Profit & Loss maths (mirrors the quote_pnl / quote_item_pnl views):
 *   Total Cost          = Quantity × Unit Cost
 *   Total Selling       = Quantity × Selling Rate
 *   Profit              = Total Selling − Total Cost
 *   Profit Margin %     = Profit ÷ Total Selling × 100
 * A missing cost is null — never zero — and makes profit/margin null too.
 * Margin is null when selling is 0 (no division by zero).
 */
import { roundMoney } from './money';
import { lineAmount } from './pricing';

export function lineCost(qty: number, unitCost: number | null): number | null {
  return unitCost === null ? null : lineAmount(qty, unitCost);
}

export function profit(selling: number, cost: number | null): number | null {
  return cost === null ? null : roundMoney(selling - cost);
}

export function marginPct(selling: number, cost: number | null): number | null {
  if (cost === null || selling === 0) return null;
  return Math.round(((selling - cost) / selling) * 10000) / 100;
}

export function formatPct(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`;
}

/** Text colour for a profit/margin value. */
export function profitTone(value: number | null): string {
  if (value === null) return 'text-slate-400';
  if (value < 0) return 'text-rose-600';
  return 'text-emerald-700';
}
