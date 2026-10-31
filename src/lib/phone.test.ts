/**
 * Tests for phone normalisation (must match the SQL normalize_phone cases in db.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { formatPhone, maskPhone, normalizePhone, phoneToLoginEmail } from './phone';

describe('normalizePhone', () => {
  it('accepts common Indian formats', () => {
    expect(normalizePhone('9876543210')).toBe('9876543210');
    expect(normalizePhone('+91 98765-43210')).toBe('9876543210');
    expect(normalizePhone('09876543210')).toBe('9876543210');
  });

  it('rejects anything else', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('5876543210')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('98765432101')).toBeNull();
  });
});

describe('phoneToLoginEmail', () => {
  it('maps to the internal login email', () => {
    expect(phoneToLoginEmail('+91 98765 43210')).toBe('9876543210@phone.invalid');
    expect(phoneToLoginEmail('abc')).toBeNull();
  });
});

describe('maskPhone', () => {
  it('hides the middle digits', () => {
    expect(maskPhone('9876543210')).toBe('98765 •••10');
    expect(maskPhone(null)).toBe('');
    expect(maskPhone('123')).toBe('•••');
  });
});

describe('formatPhone', () => {
  it('groups 5+5 digits', () => {
    expect(formatPhone('9876543210')).toBe('98765 43210');
    expect(formatPhone(null)).toBe('');
  });
});
