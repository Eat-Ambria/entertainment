/**
 * Element form validation. Limits mirror the DB checks on public.elements.
 */
import { parseMoney, parseQty } from '@/lib/numbers';
import type { ElementInput } from './elementsApi';

export interface ElementForm {
  name: string;
  unit: string;
  default_rate: string;
  multiplier: string;
  default_qty: string;
  remarks: string;
  reason: string;
}

export type ElementFormErrors = Partial<Record<keyof ElementForm, string>>;

export const UNIT_SUGGESTIONS = ['Nos', 'Set', 'Piece', 'Hour', 'Day', 'Person', 'Sq ft', 'Kg', 'Metre'];

export function validateElement(
  form: ElementForm,
  imagePath: string | null,
): { ok: true; value: ElementInput; reason: string | null } | { ok: false; errors: ElementFormErrors } {
  const errors: ElementFormErrors = {};
  const name = form.name.trim().replace(/\s+/g, ' ');
  const unit = form.unit.trim();

  if (!name) errors.name = 'Enter a name.';
  else if (name.length > 120) errors.name = 'Keep the name under 120 characters.';

  if (unit.length > 30) errors.unit = 'Keep the unit under 30 characters.';

  const rate = parseMoney(form.default_rate);
  if (form.default_rate.trim() === '') errors.default_rate = 'Enter a rate.';
  else if (rate === null) errors.default_rate = 'Enter a valid amount (up to 2 decimals).';

  // Blank = 1 (no change to the rate).
  const multiplier = form.multiplier.trim() === '' ? 1 : parseQty(form.multiplier);
  if (multiplier === null) errors.multiplier = 'Enter a multiplier greater than 0.';
  else if (multiplier > 10000) errors.multiplier = 'Keep the multiplier at 10,000 or less.';

  let qty: number | null = null;
  if (form.default_qty.trim() !== '') {
    qty = parseQty(form.default_qty);
    if (qty === null) errors.default_qty = 'Enter a quantity greater than 0.';
  }


  const remarks = form.remarks.trim();
  if (remarks.length > 500) errors.remarks = 'Keep the remarks under 500 characters.';

  const reason = form.reason.trim();
  if (reason.length > 500) errors.reason = 'Keep the reason under 500 characters.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { name, unit: unit || null, default_rate: rate!, multiplier: multiplier!, default_qty: qty, remarks: remarks || null, image_path: imagePath },
    reason: reason || null,
  };
}
