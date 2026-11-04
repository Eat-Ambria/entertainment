/**
 * Quote element lines: build from a package, validate, and total.
 * All maths goes through lib/pricing so the Studio, the quotation and the DB agree.
 *   amount   = qty × rate (per line)
 *   subtotal = Σ amounts of included lines
 * Package elements start unticked — staff tick what the guest wants.
 * Editing a line never changes the master element or the package defaults.
 */
import { parseMoney, parseQty, toInput } from '@/lib/numbers';
import { lineAmount, linesSubtotal } from '@/lib/pricing';
import type { StudioPackageLine } from '@/data/studioCatalog';
import { roundMoney } from '@/lib/money';
import type { DraftLine, DraftPackageBlock } from './quoteDraft';

export function linesFromPackage(pkgLines: StudioPackageLine[]): DraftLine[] {
  return pkgLines.map((l) => ({
    elementId: l.element_id,
    name: l.name,
    unit: l.unit,
    imagePath: l.image_path,
    ...(l.remarks ? { remarks: l.remarks } : {}),
    defaultRate: l.default_rate,
    defaultQty: l.default_qty,
    qty: toInput(l.default_qty),
    rate: toInput(l.default_rate),
    included: false,
  }));
}

/**
 * Applies today's catalogue to lines already in the draft (e.g. a rate or multiplier changed
 * in the workspace after the package was opened). Lines whose rate staff haven't changed take
 * the new rate; changed lines keep their rate but Reset will use the new one. Remarks follow
 * the catalogue. Returns null when nothing changes.
 */
export function refreshLines(lines: readonly DraftLine[], fresh: readonly StudioPackageLine[]): DraftLine[] | null {
  const byId = new Map(fresh.map((f) => [f.element_id, f]));
  let changed = false;
  const next = lines.map((l) => {
    const f = byId.get(l.elementId);
    if (!f) return l;
    const untouched = parseMoney(l.rate) === l.defaultRate;
    const remarks = f.remarks ?? null;
    if (f.default_rate === l.defaultRate && remarks === (l.remarks ?? null)) return l;
    changed = true;
    const next: DraftLine = { ...l, defaultRate: f.default_rate, rate: untouched ? toInput(f.default_rate) : l.rate };
    if (remarks) next.remarks = remarks;
    else delete next.remarks;
    return next;
  });
  return changed ? next : null;
}

export interface LineErrors {
  qty?: string;
  rate?: string;
}

export interface LinesSummary {
  subtotal: number;
  includedCount: number;
  /** Amount per line, null when its qty/rate can't be parsed. */
  amounts: Map<string, number | null>;
  errors: Map<string, LineErrors>;
  valid: boolean;
}

/** Largest amount the database stores for a line (numeric(14,2)). */
const MAX_LINE_AMOUNT = 999_999_999_999.99;

export function summariseLines(lines: readonly DraftLine[]): LinesSummary {
  const amounts = new Map<string, number | null>();
  const errors = new Map<string, LineErrors>();
  const priced: { qty: number; rate: number }[] = [];

  for (const l of lines) {
    const qty = parseQty(l.qty);
    const rate = parseMoney(l.rate);
    amounts.set(l.elementId, qty !== null && rate !== null ? lineAmount(qty, rate) : null);
    if (!l.included) continue;
    const e: LineErrors = {};
    if (qty === null) e.qty = 'Enter a quantity above 0';
    if (rate === null) e.rate = 'Enter a valid rate';
    else if (qty !== null && lineAmount(qty, rate) > MAX_LINE_AMOUNT) e.qty = 'Amount is too large — lower the quantity or rate';
    if (e.qty || e.rate) errors.set(l.elementId, e);
    else priced.push({ qty: qty!, rate: rate! });
  }

  const includedCount = lines.filter((l) => l.included).length;
  return {
    subtotal: linesSubtotal(priced),
    includedCount,
    amounts,
    errors,
    valid: includedCount > 0 && errors.size === 0,
  };
}

export interface BlocksSummary {
  /** Per package id. */
  sections: Map<string, LinesSummary>;
  total: number;
  includedCount: number;
  /** Package ids with no element included. */
  emptyPackages: string[];
  /** Every package loaded, each with ≥1 included element and no invalid lines. */
  valid: boolean;
}

/** Package-wise totals: each package's subtotal, and the elements total across all of them. */
export function summariseBlocks(blocks: readonly DraftPackageBlock[]): BlocksSummary {
  const sections = new Map<string, LinesSummary>();
  let total = 0;
  let includedCount = 0;
  const emptyPackages: string[] = [];
  let valid = blocks.length > 0;
  for (const b of blocks) {
    if (!b.lines) {
      valid = false;
      continue;
    }
    const s = summariseLines(b.lines);
    sections.set(b.id, s);
    total += s.subtotal;
    includedCount += s.includedCount;
    if (s.includedCount === 0) emptyPackages.push(b.id);
    if (!s.valid) valid = false;
  }
  return { sections, total: roundMoney(total), includedCount, emptyPackages, valid };
}

/** True when any line differs from the package defaults (used to warn before switching package). */
export function linesChanged(lines: readonly DraftLine[]): boolean {
  return lines.some(
    (l) => l.included || parseQty(l.qty) !== l.defaultQty || parseMoney(l.rate) !== l.defaultRate,
  );
}
