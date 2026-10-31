/**
 * Tests for DB error messages and ILIKE escaping.
 */
import { describe, expect, it } from 'vitest';
import { dbErrorMessage, escapeLike } from './dbErrors';

describe('dbErrorMessage', () => {
  it('maps common Postgres codes', () => {
    expect(dbErrorMessage({ code: '23505' })).toBe('This already exists.');
    expect(dbErrorMessage({ code: 'P0429' })).toMatch(/Too many changes/);
    expect(dbErrorMessage({ code: '42501' })).toMatch(/permission/);
    expect(dbErrorMessage({ code: 'P0002' })).toMatch(/no longer exists/);
  });

  it('explains when a migration has not been applied yet', () => {
    for (const code of ['PGRST205', 'PGRST202', '42P01', '42883']) {
      expect(dbErrorMessage({ code }), code).toMatch(/needs an update.*APPLY_ALL\.sql/);
    }
  });

  it('allows per-screen overrides', () => {
    expect(dbErrorMessage({ code: '23505' }, { '23505': 'Name taken.' })).toBe('Name taken.');
  });

  it('never leaks raw server text', () => {
    expect(dbErrorMessage({ code: 'XX000', message: 'internal: relation foo' })).toBe(
      'Something went wrong. Please try again.',
    );
    expect(dbErrorMessage(new TypeError('Failed to fetch'))).toMatch(/internet/);
  });
});

describe('escapeLike', () => {
  it('escapes wildcard characters', () => {
    expect(escapeLike('50% off_now\\')).toBe('50\\% off\\_now\\\\');
    expect(escapeLike('Stage Backdrop')).toBe('Stage Backdrop');
  });
});
