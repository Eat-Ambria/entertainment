/**
 * Tests for the query retry policy (no retries on 4xx / 429).
 */
import { describe, expect, it } from 'vitest';
import { shouldRetry } from './queryClient';

describe('shouldRetry', () => {
  it('does not retry rate-limited or client errors', () => {
    expect(shouldRetry(0, { status: 429 })).toBe(false);
    expect(shouldRetry(0, { status: 403 })).toBe(false);
  });

  it('retries network/5xx errors once', () => {
    expect(shouldRetry(0, { status: 500 })).toBe(true);
    expect(shouldRetry(0, new Error('network'))).toBe(true);
    expect(shouldRetry(1, new Error('network'))).toBe(false);
  });
});
