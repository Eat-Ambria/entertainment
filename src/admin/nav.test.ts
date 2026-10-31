/**
 * Tests for My Workspace nav lookup used by the top-bar title.
 */
import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, NAV_SECTIONS, navItemFor } from './nav';

describe('navItemFor', () => {
  it('matches exact paths', () => {
    expect(navItemFor('/admin')?.label).toBe('Dashboard');
    expect(navItemFor('/admin/quotes')?.label).toBe('Quote Ledger');
  });

  it('falls back to the longest prefix for nested paths', () => {
    expect(navItemFor('/admin/quotes/abc-123')?.label).toBe('Quote Ledger');
    expect(navItemFor('/admin/packages/xyz/edit')?.label).toBe('Packages');
  });

  it('returns undefined for unknown paths', () => {
    expect(navItemFor('/admin/nope')).toBeUndefined();
    expect(navItemFor('/studio')).toBeUndefined();
  });

  it('every nav item belongs to a known section and lives under /admin', () => {
    const keys = new Set(NAV_SECTIONS.map((s) => s.key));
    expect(NAV_ITEMS.every((n) => keys.has(n.section))).toBe(true);
    expect(NAV_ITEMS.every((n) => n.to.startsWith('/admin'))).toBe(true);
  });
});
