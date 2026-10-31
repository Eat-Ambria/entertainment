/**
 * Package editor validation. Limits mirror the DB checks on public.packages /
 * package_elements and the save_package RPC.
 */
import { parseMoney, parseQty } from '@/lib/numbers';
import type { PackageInput } from './packagesApi';

export interface PackageForm {
  name: string;
  tier_id: string;
  display_price: string;
  description: string;
  video_url: string;
  is_active: boolean;
  /** Optional; empty = the package suits any function. */
  function_ids: string[];
}

/** element_id -> qty text as typed. Presence in the map = included. */
export type SelectedItems = Map<string, string>;

export type PackageFormErrors = Partial<Record<keyof PackageForm | 'items', string>> & {
  itemQty?: Record<string, string>;
};

export function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !/\s/.test(value);
  } catch {
    return false;
  }
}

export function validatePackage(
  form: PackageForm,
  selected: SelectedItems,
  imagePath: string | null,
): { ok: true; value: PackageInput } | { ok: false; errors: PackageFormErrors } {
  const errors: PackageFormErrors = {};
  const name = form.name.trim().replace(/\s+/g, ' ');
  if (!name) errors.name = 'Enter a package name.';
  else if (name.length > 120) errors.name = 'Keep the name under 120 characters.';

  if (!form.tier_id) errors.tier_id = 'Choose a tier.';

  let displayPrice: number | null = null;
  if (form.display_price.trim()) {
    displayPrice = parseMoney(form.display_price);
    if (displayPrice === null) errors.display_price = 'Enter a valid amount (up to 2 decimals).';
  }

  const description = form.description.trim();
  if (description.length > 1000) errors.description = 'Keep the description under 1000 characters.';

  const video = form.video_url.trim();
  if (video && !isValidHttpUrl(video)) errors.video_url = 'Enter a full link starting with https://';

  const items: PackageInput['items'] = [];
  const itemQty: Record<string, string> = {};
  for (const [elementId, qtyText] of selected) {
    const qty = parseQty(qtyText);
    if (qty === null) itemQty[elementId] = 'Qty > 0';
    else items.push({ element_id: elementId, default_qty: qty });
  }
  if (Object.keys(itemQty).length) errors.itemQty = itemQty;
  if (selected.size === 0) errors.items = 'Select at least one element.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      tier_id: form.tier_id,
      display_price: displayPrice,
      description: description || null,
      image_path: imagePath,
      video_url: video || null,
      is_active: form.is_active,
      items,
      function_ids: [...new Set(form.function_ids)],
    },
  };
}
