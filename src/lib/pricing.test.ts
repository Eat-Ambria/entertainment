/**
 * Tests for the shared pricing maths.
 */
import { describe, expect, it } from 'vitest';
import { lineAmount, linesSubtotal } from './pricing';

describe('lineAmount', () => {
  it('multiplies and rounds to paise', () => {
    expect(lineAmount(1, 25000)).toBe(25000);
    expect(lineAmount(0.5, 190)).toBe(95);
    expect(lineAmount(3, 33.33)).toBe(99.99);
    expect(lineAmount(0.1, 0.3)).toBe(0.03);
  });

  it('rounds half-up exactly like Postgres round(qty * rate, 2)', () => {
    expect(lineAmount(1.5, 333.33)).toBe(500); // 499.995
    expect(lineAmount(0.25, 0.1)).toBe(0.03); // 0.025
    expect(lineAmount(1.05, 1.05)).toBe(1.1); // 1.1025
  });

  it('stays exact for large realistic amounts', () => {
    expect(lineAmount(2, 9999999999.99)).toBe(19999999999.98);
    expect(lineAmount(1000.75, 99999.99)).toBe(100074989.99); // 100074989.9925
  });

  it('rejects non-finite input', () => {
    expect(() => lineAmount(Number.NaN, 1)).toThrow(RangeError);
  });
});

describe('linesSubtotal', () => {
  it('adds only included lines', () => {
    expect(
      linesSubtotal([
        { qty: 1, rate: 10000 },
        { qty: 4, rate: 5000, included: true },
        { qty: 2, rate: 99999, included: false },
      ]),
    ).toBe(30000);
  });

  it('is zero for no lines and avoids float drift', () => {
    expect(linesSubtotal([])).toBe(0);
    expect(linesSubtotal([{ qty: 1, rate: 0.1 }, { qty: 1, rate: 0.2 }])).toBe(0.3);
  });
});
