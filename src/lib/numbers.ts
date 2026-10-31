/**
 * Parsing for money and quantity inputs. Limits match the DB columns:
 *   money -> numeric(12,2)  (max 9,999,999,999.99)
 *   qty   -> numeric(10,2)  (max 99,999,999.99, must be > 0)
 * Accepts "25,000" / "25000.5" / " 180 ". Returns null when the input is invalid.
 */
const MONEY_RE = /^\d{1,10}(\.\d{1,2})?$/;
const QTY_RE = /^\d{1,8}(\.\d{1,2})?$/;

function clean(input: string): string {
  return input.trim().replace(/,/g, '');
}

export function parseMoney(input: string): number | null {
  const s = clean(input);
  return MONEY_RE.test(s) ? Number(s) : null;
}

export function parseQty(input: string): number | null {
  const s = clean(input);
  if (!QTY_RE.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n : null;
}

/** Number -> plain input string ("25000", "1.5"); empty for null. */
export function toInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/** "1", "0.5", "2.25" — trims trailing zeros for qty display. */
export function formatQty(value: number | null | undefined, unit?: string | null): string {
  if (value === null || value === undefined) return '—';
  const n = Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  return unit ? `${n} ${unit}` : n;
}
