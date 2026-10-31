/**
 * Tests for pagination helpers.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE, pageWindow, parsePageState, rangeLabel, toRange, totalPages } from './pagination';

describe('parsePageState', () => {
  it('defaults when params are missing', () => {
    expect(parsePageState(new URLSearchParams())).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  });

  it('reads valid values', () => {
    expect(parsePageState(new URLSearchParams('page=3&size=50'))).toEqual({ page: 3, pageSize: 50 });
  });

  it('rejects invalid page and non-whitelisted sizes', () => {
    expect(parsePageState(new URLSearchParams('page=-2&size=1000'))).toEqual({ page: 1, pageSize: 25 });
    expect(parsePageState(new URLSearchParams('page=abc&size=x'))).toEqual({ page: 1, pageSize: 25 });
  });
});

describe('toRange', () => {
  it('returns inclusive Supabase range', () => {
    expect(toRange({ page: 1, pageSize: 25 })).toEqual([0, 24]);
    expect(toRange({ page: 3, pageSize: 50 })).toEqual([100, 149]);
  });
});

describe('totalPages', () => {
  it('is at least 1', () => {
    expect(totalPages(0, 25)).toBe(1);
  });
  it('rounds up', () => {
    expect(totalPages(26, 25)).toBe(2);
    expect(totalPages(50, 25)).toBe(2);
  });
});

describe('pageWindow', () => {
  it('lists all pages when few', () => {
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it('adds gaps around the current page', () => {
    expect(pageWindow(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
  });
  it('no leading gap near the start', () => {
    expect(pageWindow(2, 20)).toEqual([1, 2, 3, null, 20]);
  });
});

describe('rangeLabel', () => {
  it('handles empty and last partial page', () => {
    expect(rangeLabel({ page: 1, pageSize: 25 }, 0)).toBe('No results');
    expect(rangeLabel({ page: 2, pageSize: 25 }, 30)).toBe('26–30 of 30');
  });
});
