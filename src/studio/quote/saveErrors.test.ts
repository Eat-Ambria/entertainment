/**
 * Tests for save_quote error messages.
 */
import { describe, expect, it } from 'vitest';
import { saveErrorInfo } from './saveErrors';

describe('saveErrorInfo', () => {
  it('recognises a quote locked after being sent or confirmed', () => {
    expect(saveErrorInfo({ code: '23514', message: 'Quote ENT-2026-00007 is confirmed and can no longer be edited.' })).toEqual({
      locked: true,
      message: "This quote is already confirmed and locked, so it can't be changed. Save your changes as a new quote instead.",
    });
  });

  it("shows save_quote's own plain messages", () => {
    expect(saveErrorInfo({ code: '23514', message: 'Include at least one element.' })).toEqual({
      locked: false,
      message: 'Include at least one element.',
    });
  });

  it('hides anything else behind the generic message', () => {
    expect(saveErrorInfo({ code: '23514', message: 'new row violates check constraint "quote_items_amount_check"' }).message).toBe(
      'One of the values is not valid.',
    );
    expect(saveErrorInfo({ code: 'P0429', message: 'x' }).message).toMatch(/Too many changes/);
  });
});
