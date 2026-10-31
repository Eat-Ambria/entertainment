/**
 * Tests for Settings profile validation.
 */
import { describe, expect, it } from 'vitest';
import { validateProfile } from './settingsValidation';

const base = { full_name: '', business_name: '', contact_line: '', lms_logged_user_id: '' };

describe('validateProfile', () => {
  it('trims values and turns blanks into null', () => {
    const r = validateProfile({ ...base, full_name: '  Uday  ', lms_logged_user_id: ' 42 ' });
    expect(r).toEqual({
      ok: true,
      errors: {},
      value: { full_name: 'Uday', business_name: null, contact_line: null, lms_logged_user_id: '42' },
    });
  });

  it('rejects non-numeric LMS ids and over-long text', () => {
    const r = validateProfile({ ...base, lms_logged_user_id: 'abc', business_name: 'x'.repeat(121) });
    expect(r.ok).toBe(false);
    expect(r.errors).toMatchObject({ lms_logged_user_id: 'Numbers only.', business_name: expect.any(String) });
  });
});
