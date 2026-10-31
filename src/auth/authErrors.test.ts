/**
 * Tests for auth error messages.
 */
import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './authErrors';

describe('authErrorMessage', () => {
  it('maps known Supabase errors', () => {
    expect(authErrorMessage({ status: 400, code: 'invalid_credentials' })).toBe('Phone number or password is incorrect.');
    expect(authErrorMessage({ status: 429, code: 'over_request_rate_limit' })).toMatch(/Too many attempts/);
    expect(authErrorMessage({ code: 'same_password' })).toMatch(/different/);
    expect(authErrorMessage({ code: 'weak_password' })).toMatch(/at least 6/);
  });

  it('maps network failures', () => {
    expect(authErrorMessage(new TypeError('Failed to fetch'))).toMatch(/Cannot reach the server/);
  });

  it('never leaks unknown server text', () => {
    expect(authErrorMessage({ message: 'relation "x" does not exist' })).toBe('Something went wrong. Please try again.');
    expect(authErrorMessage(undefined)).toBe('Something went wrong. Please try again.');
  });
});
