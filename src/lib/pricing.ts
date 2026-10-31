/**
 * Shared pricing maths. Every amount on screen comes from here so the UI, PDFs and
 * the database (which recomputes on save) always agree.
 *   line amount = round(qty × rate, 2)   — same as Postgres round(numeric, 2), half away from zero
 *   subtotal    = Σ line amounts of included lines
 * qty and rate have at most 2 decimals (DB columns), so the product is computed exactly in
 * integer hundredths with BigInt — no floating-point drift.
 */
import { roundMoney } from './money';

export interface PricedLine {
  qty: number;
  rate: number;
  included?: boolean;
}

const toHundredths = (n: number) => BigInt(Math.round(n * 100));

export function lineAmount(qty: number, rate: number): number {
  if (!Number.isFinite(qty) || !Number.isFinite(rate)) throw new RangeError('qty and rate must be finite numbers');
  const product = toHundredths(qty) * toHundredths(rate); // in 1/10000 rupee
  const negative = product < 0n;
  const abs = negative ? -product : product;
  const paise = (abs + 50n) / 100n; // round half away from zero
  return Number(negative ? -paise : paise) / 100;
}

/** Sum of included lines (lines without `included` count as included). */
export function linesSubtotal(lines: readonly PricedLine[]): number {
  return roundMoney(lines.reduce((sum, l) => (l.included === false ? sum : sum + lineAmount(l.qty, l.rate)), 0));
}
