/**
 * Money helpers. All amounts are rupees (matches LMS).
 * Every stored/displayed total goes through roundMoney so the UI and DB agree.
 */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`Invalid amount: ${value}`);
  const rounded = Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatINR(value: number): string {
  return inr.format(roundMoney(value));
}
