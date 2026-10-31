/**
 * Tests for money rounding and INR formatting.
 */
import { describe, expect, it } from 'vitest';
import { formatINR, roundMoney } from './money';

describe('roundMoney', () => {
  it('rounds to 2 decimals', () => {
    expect(roundMoney(10.004)).toBe(10);
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(1.255)).toBe(1.26);
  });

  it('fixes float noise', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it('rounds negatives symmetrically and never returns -0', () => {
    expect(roundMoney(-1.255)).toBe(-1.26);
    expect(Object.is(roundMoney(-0.001), 0)).toBe(true);
  });

  it('rejects non-finite values', () => {
    expect(() => roundMoney(Number.NaN)).toThrow(RangeError);
    expect(() => roundMoney(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('formatINR', () => {
  it('formats with rupee sign, Indian grouping and 2 decimals', () => {
    expect(formatINR(180)).toBe('₹180.00');
    expect(formatINR(1234567.5)).toBe('₹12,34,567.50');
  });
});
