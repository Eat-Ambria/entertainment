/**
 * Tests for package editor validation.
 */
import { describe, expect, it } from 'vitest';
import { isValidHttpUrl, validatePackage, type PackageForm } from './packageValidation';

const form = (o: Partial<PackageForm> = {}): PackageForm => ({
  name: 'Royal Package',
  tier_id: 't1',
  display_price: '',
  description: '',
  video_url: '',
  is_active: true,
  function_ids: [],
  ...o,
});

describe('validatePackage', () => {
  it('builds the RPC input in selection order', () => {
    const r = validatePackage(form({ display_price: '1,50,000', video_url: 'https://youtu.be/x' }), new Map([['e2', '4'], ['e1', '1']]), 'u/p.webp');
    expect(r).toEqual({
      ok: true,
      value: {
        name: 'Royal Package',
        tier_id: 't1',
        display_price: 150000,
        description: null,
        image_path: 'u/p.webp',
        video_url: 'https://youtu.be/x',
        is_active: true,
        items: [
          { element_id: 'e2', default_qty: 4 },
          { element_id: 'e1', default_qty: 1 },
        ],
        function_ids: [],
      },
    });
  });

  it('needs a name, tier and at least one element', () => {
    const r = validatePackage(form({ name: ' ', tier_id: '' }), new Map(), null);
    expect(r).toMatchObject({
      ok: false,
      errors: { name: 'Enter a package name.', tier_id: 'Choose a tier.', items: 'Select at least one element.' },
    });
  });

  it('flags bad quantities per element and bad links', () => {
    const r = validatePackage(form({ video_url: 'youtube.com/x' }), new Map([['e1', '0'], ['e2', '2']]), null);
    expect(r).toMatchObject({ ok: false, errors: { itemQty: { e1: 'Qty > 0' }, video_url: expect.any(String) } });
  });
});

describe('isValidHttpUrl', () => {
  it('accepts only http(s) links', () => {
    expect(isValidHttpUrl('https://www.youtube.com/watch?v=1')).toBe(true);
    expect(isValidHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isValidHttpUrl('ftp://x.com')).toBe(false);
    expect(isValidHttpUrl('not a url')).toBe(false);
  });
});
