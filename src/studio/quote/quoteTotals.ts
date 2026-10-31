/**
 * Quotation maths + save payload.
 *   Final Quote Total = Σ package subtotals (included elements) + Additional Charges Total
 * The server recomputes everything on save; these numbers are what the guest sees meanwhile.
 */
import { parseMoney, parseQty } from '@/lib/numbers';
import { roundMoney } from '@/lib/money';
import type { DraftCharge, QuoteDraft } from '../quoteDraft';
import { summariseBlocks } from '../lines';

export interface ChargeErrors {
  description?: string;
  amount?: string;
}

export interface QuoteSummary {
  elementsSubtotal: number;
  chargesTotal: number;
  finalTotal: number;
  chargeErrors: Map<string, ChargeErrors>;
  linesValid: boolean;
  valid: boolean;
}

export function summariseCharges(charges: readonly DraftCharge[]) {
  const errors = new Map<string, ChargeErrors>();
  let total = 0;
  for (const c of charges) {
    const e: ChargeErrors = {};
    const desc = c.description.trim();
    const amount = parseMoney(c.amount);
    if (!desc) e.description = 'Describe the charge';
    else if (desc.length > 200) e.description = 'Keep it under 200 characters';
    if (amount === null) e.amount = 'Enter a valid amount';
    if (e.description || e.amount) errors.set(c.key, e);
    if (amount !== null) total += amount;
  }
  return { total: roundMoney(total), errors };
}

export function summariseQuote(draft: QuoteDraft): QuoteSummary {
  const blocks = summariseBlocks(draft.packages);
  const charges = summariseCharges(draft.charges);
  return {
    elementsSubtotal: blocks.total,
    chargesTotal: charges.total,
    finalTotal: roundMoney(blocks.total + charges.total),
    chargeErrors: charges.errors,
    linesValid: blocks.valid,
    valid: blocks.valid && charges.errors.size === 0 && draft.guest !== null,
  };
}

export interface SaveQuotePayload {
  quote_id: string | null;
  guest: {
    source: string;
    source_ref: string | null;
    source_raw: unknown;
    guest_name: string;
    guest_phone: string;
    function_id: string;
    venue_id: string;
    sub_venue_id: string | null;
    event_date: string;
    session_id: string;
  };
  packages: { package_id: string; lines: { element_id: string; qty: number; rate: number; included: boolean }[] }[];
  charges: { description: string; amount: number }[];
  notes: string | null;
}

/** Builds the save_quote payload, or null if the draft isn't complete and valid. */
export function buildSavePayload(draft: QuoteDraft): SaveQuotePayload | null {
  if (!summariseQuote(draft).valid) return null;
  const g = draft.guest!;
  return {
    quote_id: draft.saved?.id ?? null,
    guest: {
      source: g.source,
      source_ref: g.sourceRef,
      source_raw: g.sourceRaw,
      guest_name: g.guestName,
      guest_phone: g.phone,
      function_id: g.functionId,
      venue_id: g.venueId,
      sub_venue_id: g.subVenueId,
      event_date: g.eventDate,
      session_id: g.sessionId,
    },
    // Excluded lines are kept (with any valid numbers) so the saved quote mirrors the screen.
    packages: draft.packages.map((b) => ({
      package_id: b.id,
      lines: (b.lines ?? []).map((l) => ({
        element_id: l.elementId,
        qty: parseQty(l.qty) ?? l.defaultQty,
        rate: parseMoney(l.rate) ?? l.defaultRate,
        included: l.included,
      })),
    })),
    charges: draft.charges.map((c) => ({ description: c.description.trim(), amount: parseMoney(c.amount)! })),
    notes: null,
  };
}
