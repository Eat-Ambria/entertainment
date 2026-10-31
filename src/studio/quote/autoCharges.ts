/**
 * Additional charges added automatically from the master rates (src/data/chargeRates.ts):
 *   fixed        → amount = rate                         (Transportation)
 *   per_package  → amount = rate × qty per package × packages   (Labour)
 * An auto line follows the package count until staff change its amount ("Adjust rates");
 * a line staff removed is not added back. A venue rate (0019) replaces the default for
 * quotes at that venue. Pure, so it is easy to test.
 */
import { roundMoney, formatINR } from '@/lib/money';
import { formatQty, toInput } from '@/lib/numbers';
import type { ChargeRate } from '@/data/chargeRates';
import type { DraftCharge } from '../quoteDraft';

type Rule = Pick<ChargeRate, 'code' | 'label' | 'mode' | 'rate' | 'qty_per_package' | 'auto_add'>;

/**
 * The rule with the quote's venue rate applied (default when the venue has none). Only fixed
 * charges (Transportation) vary by venue; per-package ones (Labour) use one rate everywhere.
 */
export function ruleForVenue(rule: Rule & Pick<ChargeRate, 'venues'>, venueId: string | null | undefined): Rule {
  const v = venueId && rule.mode === 'fixed' ? rule.venues.find((x) => x.venue_id === venueId) : undefined;
  return {
    code: rule.code,
    label: rule.label,
    mode: rule.mode,
    auto_add: rule.auto_add,
    rate: v ? v.rate : rule.rate,
    qty_per_package: v?.qty_per_package ?? rule.qty_per_package,
  };
}

export function autoChargeAmount(rule: Rule, packageCount: number): number {
  return rule.mode === 'fixed' ? roundMoney(rule.rate) : roundMoney(rule.rate * rule.qty_per_package * packageCount);
}

/** "Labour (4 × ₹500.00)" — what the guest sees; fixed charges show just the label. */
export function autoChargeDescription(rule: Rule, packageCount: number): string {
  if (rule.mode === 'fixed') return rule.label;
  return `${rule.label} (${formatQty(roundMoney(rule.qty_per_package * packageCount), null)} × ${formatINR(rule.rate)})`;
}

/**
 * Returns the updated charges, or null when nothing changes. Auto lines come first in
 * rule order; manual lines keep their order after them.
 */
export function syncAutoCharges(
  charges: readonly DraftCharge[],
  rules: readonly Rule[],
  packageCount: number,
  removed: readonly string[],
): DraftCharge[] | null {
  const known = new Set(rules.map((r) => r.code));
  const auto: DraftCharge[] = [];
  for (const rule of rules) {
    const existing = charges.find((c) => c.rule === rule.code);
    if (existing?.adjusted) {
      auto.push(existing);
      continue;
    }
    const amount = autoChargeAmount(rule, packageCount);
    if (!rule.auto_add || removed.includes(rule.code) || amount <= 0 || packageCount === 0) continue;
    auto.push({
      key: existing?.key ?? `auto-${rule.code}`,
      rule: rule.code,
      description: autoChargeDescription(rule, packageCount),
      amount: toInput(amount),
    });
  }
  const rest = charges.filter((c) => !c.rule || !known.has(c.rule));
  const next = [...auto, ...rest];
  return JSON.stringify(next) === JSON.stringify(charges) ? null : next;
}
