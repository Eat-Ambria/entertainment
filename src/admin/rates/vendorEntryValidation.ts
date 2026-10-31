/**
 * Validation for logging a vendor purchase rate. Mirrors vendor_rate_entries checks:
 * qty > 0 (up to 3 decimals), rate ≥ 0 (2 decimals), purchase date not in the future (IST).
 */
import { parseMoney } from '@/lib/numbers';
import type { VendorEntryInput } from './ratesApi';

export interface VendorEntryForm {
  element_id: string;
  vendor_id: string; // '' when adding a new vendor
  new_vendor: string;
  purchase_date: string;
  qty: string;
  unit: string;
  rate: string;
  remarks: string;
}

export type VendorEntryErrors = Partial<Record<keyof VendorEntryForm, string>>;

const QTY3 = /^\d{1,7}(\.\d{1,3})?$/;

export function validateVendorEntry(
  f: VendorEntryForm,
  addingVendor: boolean,
  today: string,
): { ok: true; value: VendorEntryInput; newVendorName: string | null } | { ok: false; errors: VendorEntryErrors } {
  const errors: VendorEntryErrors = {};
  if (!f.element_id) errors.element_id = 'Choose the element.';

  const newVendor = f.new_vendor.trim().replace(/\s+/g, ' ');
  if (addingVendor) {
    if (!newVendor) errors.new_vendor = 'Enter the vendor name.';
    else if (newVendor.length > 120) errors.new_vendor = 'Keep it under 120 characters.';
  } else if (!f.vendor_id) errors.vendor_id = 'Choose the vendor.';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.purchase_date)) errors.purchase_date = 'Choose the purchase date.';
  else if (f.purchase_date > today) errors.purchase_date = "The purchase date can't be in the future.";

  const qtyText = f.qty.trim().replace(/,/g, '');
  const qty = QTY3.test(qtyText) ? Number(qtyText) : null;
  if (qty === null || qty <= 0) errors.qty = 'Enter a quantity above 0.';

  const rate = parseMoney(f.rate);
  if (rate === null) errors.rate = 'Enter a valid rate.';

  if (f.unit.trim().length > 30) errors.unit = 'Keep the unit under 30 characters.';
  if (f.remarks.trim().length > 500) errors.remarks = 'Keep remarks under 500 characters.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    newVendorName: addingVendor ? newVendor : null,
    value: {
      element_id: f.element_id,
      vendor_id: f.vendor_id,
      purchase_date: f.purchase_date,
      qty: qty!,
      unit: f.unit.trim() || null,
      rate_per_unit: rate!,
      remarks: f.remarks.trim() || null,
    },
  };
}
