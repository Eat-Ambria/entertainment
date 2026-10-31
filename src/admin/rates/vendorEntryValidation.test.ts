/**
 * Tests for vendor purchase-rate entry validation.
 */
import { describe, expect, it } from 'vitest';
import { validateVendorEntry, type VendorEntryForm } from './vendorEntryValidation';

const f = (o: Partial<VendorEntryForm> = {}): VendorEntryForm => ({
  element_id: 'e1',
  vendor_id: 'v1',
  new_vendor: '',
  purchase_date: '2026-10-18',
  qty: '0.5',
  unit: 'Kg',
  rate: '190',
  remarks: '',
  ...o,
});
const TODAY = '2026-10-26';

describe('validateVendorEntry', () => {
  it('parses a valid entry (rate is per unit)', () => {
    expect(validateVendorEntry(f(), false, TODAY)).toEqual({
      ok: true,
      newVendorName: null,
      value: { element_id: 'e1', vendor_id: 'v1', purchase_date: '2026-10-18', qty: 0.5, unit: 'Kg', rate_per_unit: 190, remarks: null },
    });
  });

  it('supports adding a new vendor inline', () => {
    const r = validateVendorEntry(f({ vendor_id: '', new_vendor: '  DIGANI   FRUITS & VEGETABLES ' }), true, TODAY);
    expect(r).toMatchObject({ ok: true, newVendorName: 'DIGANI FRUITS & VEGETABLES' });
    expect(validateVendorEntry(f({ vendor_id: '', new_vendor: ' ' }), true, TODAY)).toMatchObject({
      ok: false,
      errors: { new_vendor: 'Enter the vendor name.' },
    });
  });

  it('rejects future dates, zero qty, bad rates and missing picks', () => {
    const r = validateVendorEntry(f({ element_id: '', vendor_id: '', purchase_date: '2026-10-27', qty: '0', rate: '-1' }), false, TODAY);
    expect(r).toEqual({
      ok: false,
      errors: {
        element_id: 'Choose the element.',
        vendor_id: 'Choose the vendor.',
        purchase_date: "The purchase date can't be in the future.",
        qty: 'Enter a quantity above 0.',
        rate: 'Enter a valid rate.',
      },
    });
  });

  it('allows today and up to 3 decimals of quantity', () => {
    expect(validateVendorEntry(f({ purchase_date: TODAY, qty: '1.125' }), false, TODAY).ok).toBe(true);
    expect(validateVendorEntry(f({ qty: '1.1255' }), false, TODAY).ok).toBe(false);
  });
});
