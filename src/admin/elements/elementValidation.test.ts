/**
 * Tests for element form validation.
 */
import { describe, expect, it } from 'vitest';
import { validateElement } from './elementValidation';

const form = (o: Partial<Record<string, string>> = {}) => ({
  name: 'Entrance Arch',
  unit: 'Nos',
  default_rate: '25,000',
  multiplier: '',
  default_qty: '1',
  remarks: '',
  reason: '',
  ...o,
});

describe('validateElement', () => {
  it('parses a valid form', () => {
    expect(validateElement(form(), 'u/elements/1.webp')).toEqual({
      ok: true,
      value: { name: 'Entrance Arch', unit: 'Nos', default_rate: 25000, multiplier: 1, default_qty: 1, remarks: null, image_path: 'u/elements/1.webp' },
      reason: null,
    });
  });

  it('tidies whitespace and treats blank unit/qty as empty', () => {
    const r = validateElement(form({ name: '  Stage   Backdrop ', unit: ' ', default_qty: '', reason: ' Vendor hike ' }), null);
    expect(r).toMatchObject({ ok: true, value: { name: 'Stage Backdrop', unit: null, default_qty: null }, reason: 'Vendor hike' });
  });

  it('allows a zero rate (complimentary element)', () => {
    expect(validateElement(form({ default_rate: '0' }), null).ok).toBe(true);
  });

  it('reports every invalid field', () => {
    const r = validateElement(form({ name: ' ', default_rate: '-5', default_qty: '0', unit: 'x'.repeat(31) }), null);
    expect(r).toEqual({
      ok: false,
      errors: {
        name: 'Enter a name.',
        unit: 'Keep the unit under 30 characters.',
        default_rate: 'Enter a valid amount (up to 2 decimals).',
        default_qty: 'Enter a quantity greater than 0.',
      },
    });
  });

  it('has no unit cost any more — the Default rate is the cost', () => {
    const r = validateElement(form(), null);
    expect(r.ok && 'unit_cost' in r.value).toBe(false);
  });

  it('requires a rate', () => {
    expect(validateElement(form({ default_rate: '' }), null)).toMatchObject({ ok: false, errors: { default_rate: 'Enter a rate.' } });
  });

  it('trims remarks and limits them to 500 characters', () => {
    const ok = validateElement(form({ remarks: '  Entrance gate, Exotica lawn  ' }), null);
    expect(ok.ok && ok.value.remarks).toBe('Entrance gate, Exotica lawn');
    expect(validateElement(form({ remarks: 'x'.repeat(501) }), null)).toMatchObject({ ok: false, errors: { remarks: expect.stringMatching(/500/) } });
  });

  it('accepts a multiplier (blank = 1) and refuses 0 or text', () => {
    const ok = validateElement(form({ multiplier: '2' }), null);
    expect(ok.ok && ok.value.multiplier).toBe(2);
    expect(validateElement(form({ multiplier: '0' }), null)).toMatchObject({ ok: false, errors: { multiplier: expect.any(String) } });
    expect(validateElement(form({ multiplier: 'x' }), null)).toMatchObject({ ok: false });
  });
});
