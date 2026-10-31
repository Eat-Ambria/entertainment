/**
 * Tests for PostgREST filter builders (quoting and keyset cursors).
 */
import { describe, expect, it } from 'vitest';
import { ilikeAny, keysetAfterDesc, quoteValue } from './postgrestFilters';

describe('quoteValue', () => {
  it('wraps in double quotes and escapes quotes/backslashes', () => {
    expect(quoteValue('Mehta')).toBe('"Mehta"');
    expect(quoteValue('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});

describe('ilikeAny', () => {
  it('matches the term in each column, escaping wildcards and reserved characters', () => {
    expect(ilikeAny(['quote_no', 'guest_name'], 'meh')).toBe('quote_no.ilike."%meh%",guest_name.ilike."%meh%"');
    expect(ilikeAny(['guest_name'], '50%,x)')).toBe('guest_name.ilike."%50\\\\%,x)%"');
  });
});

describe('keysetAfterDesc', () => {
  it('builds a strict "after" cursor for desc ordering with an id tie-breaker', () => {
    expect(keysetAfterDesc('changed_at', '2026-10-26T10:00:00.123+00:00', 'abc')).toBe(
      'changed_at.lt."2026-10-26T10:00:00.123+00:00",and(changed_at.eq."2026-10-26T10:00:00.123+00:00",id.lt."abc")',
    );
  });
});
