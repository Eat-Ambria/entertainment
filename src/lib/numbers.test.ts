/**
 * Tests for money/qty parsing and display.
 */
import { describe, expect, it } from 'vitest';
import { formatQty, parseMoney, parseQty, toInput } from './numbers';

describe('parseMoney', () => {
  it('accepts plain, comma-grouped and 2-decimal values', () => {
    expect(parseMoney('180')).toBe(180);
    expect(parseMoney(' 25,000 ')).toBe(25000);
    expect(parseMoney('0')).toBe(0);
    expect(parseMoney('99.5')).toBe(99.5);
    expect(parseMoney('9999999999.99')).toBe(9999999999.99);
  });

  it('rejects negatives, >2 decimals, text and values over the DB limit', () => {
    for (const bad of ['', '-1', '1.234', 'abc', '1e5', '10000000000', '₹100']) {
      expect(parseMoney(bad), bad).toBeNull();
    }
  });
});

describe('parseQty', () => {
  it('requires a positive number with up to 2 decimals', () => {
    expect(parseQty('1')).toBe(1);
    expect(parseQty('0.5')).toBe(0.5);
    expect(parseQty('0')).toBeNull();
    expect(parseQty('-2')).toBeNull();
    expect(parseQty('1.005')).toBeNull();
    expect(parseQty('100000000')).toBeNull();
  });
});

describe('display helpers', () => {
  it('formats qty with unit and converts to input strings', () => {
    expect(formatQty(0.5, 'Kg')).toBe('0.5 Kg');
    expect(formatQty(1000)).toBe('1,000');
    expect(formatQty(null)).toBe('—');
    expect(toInput(25000)).toBe('25000');
    expect(toInput(null)).toBe('');
  });
});
