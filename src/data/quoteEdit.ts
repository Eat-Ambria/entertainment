/**
 * Reopens a saved draft quote as a Guest Studio draft so it can be edited and
 * re-saved in place — or copies any saved quote into a new draft (asNew). Reads guest-safe columns only. Lines whose element was deleted are
 * dropped (reported back); a quote whose package was deleted can't be reopened.
 */
import { requireSupabase } from '@/lib/supabase';
import { toInput } from '@/lib/numbers';
import type { DraftLine, DraftPackageBlock, QuoteDraft } from '@/studio/quoteDraft';

export class QuoteNotEditableError extends Error {
  constructor(public reason: 'locked' | 'package_deleted', message: string) {
    super(message);
    this.name = 'QuoteNotEditableError';
  }
}

// FK hints: quote_items links quotes and quote_packages (see src/data/quotes.ts).
const COLUMNS = `id, quote_no, status, source, source_ref, guest_name, guest_phone,
  function_id, venue_id, sub_venue_id, event_date, session_id,
  quote_packages!quote_packages_owner_id_quote_id_fkey(id, package_id, package_name, package_tier, sort_order),
  quote_items!quote_items_owner_id_quote_id_fkey(quote_package_id, element_id, element_name, unit, image_path, remarks, qty, rate, is_included, sort_order),
  quote_charges!quote_charges_owner_id_quote_id_fkey(description, amount, sort_order)`;

interface Row {
  id: string;
  quote_no: string;
  status: 'draft' | 'sent' | 'confirmed' | 'cancelled';
  source: 'manual' | 'lms_lead' | 'lms_contract';
  source_ref: string | null;
  guest_name: string;
  guest_phone: string | null;
  function_id: string | null;
  venue_id: string | null;
  sub_venue_id: string | null;
  event_date: string | null;
  session_id: string | null;
  quote_packages: { id: string; package_id: string | null; package_name: string; package_tier: string | null; sort_order: number }[];
  quote_items: {
    quote_package_id: string | null;
    element_id: string | null;
    element_name: string;
    unit: string | null;
    image_path: string | null;
    remarks?: string | null;
    qty: number | string;
    rate: number | string;
    is_included: boolean;
    sort_order: number;
  }[];
  quote_charges: { description: string; amount: number | string; sort_order: number }[];
}

let keySeq = 0;

/**
 * Pure: turns a saved quote into a draft. `currentRates` = element id → today's guest rate (for "Reset").
 * `asNew`: a copy for a NEW quote (any status; saving creates a new quote). A past event date is left blank.
 */
export function draftFromSavedQuote(
  row: Row,
  currentRates: Map<string, number>,
  { asNew = false, today = '' }: { asNew?: boolean; today?: string } = {},
): { draft: QuoteDraft; droppedLines: number } {
  if (!asNew && row.status !== 'draft') {
    throw new QuoteNotEditableError('locked', `This quote is ${row.status} and can't be edited.`);
  }
  if (row.quote_packages.some((p) => !p.package_id)) {
    throw new QuoteNotEditableError('package_deleted', 'A package in this quote has been deleted, so it can no longer be edited.');
  }
  let droppedLines = 0;
  const byOrder = <T extends { sort_order: number }>(xs: T[]) => [...xs].sort((a, b) => a.sort_order - b.sort_order);

  const packages: DraftPackageBlock[] = byOrder(row.quote_packages).map((p) => {
    const lines: DraftLine[] = byOrder(row.quote_items.filter((i) => i.quote_package_id === p.id)).flatMap((i) => {
      if (!i.element_id) {
        droppedLines++;
        return [];
      }
      const qty = Number(i.qty);
      const rate = Number(i.rate);
      return [
        {
          elementId: i.element_id,
          name: i.element_name,
          unit: i.unit,
          imagePath: i.image_path,
          ...(i.remarks ? { remarks: i.remarks } : {}),
          defaultRate: currentRates.get(i.element_id) ?? rate,
          defaultQty: qty,
          qty: toInput(qty),
          rate: toInput(rate),
          included: i.is_included,
        },
      ];
    });
    return { id: p.package_id!, name: p.package_name, tier: p.package_tier ?? '', lines };
  });

  return {
    droppedLines,
    draft: {
      guest: {
        source: row.source,
        sourceRef: row.source_ref,
        sourceRaw: null, // kept server-side; save_quote preserves it
        guestName: row.guest_name,
        phone: row.guest_phone ?? '',
        functionId: row.function_id ?? '',
        venueId: row.venue_id ?? '',
        subVenueId: row.sub_venue_id,
        eventDate: asNew && (row.event_date ?? '') < today ? '' : (row.event_date ?? ''),
        sessionId: row.session_id ?? '',
      },
      packages,
      charges: byOrder(row.quote_charges).map((c) => ({
        key: `e${(keySeq++).toString(36)}`,
        description: c.description,
        amount: toInput(Number(c.amount)),
      })),
      autoChargesOff: true, // keep the saved charges as they are
      saved: asNew ? null : { id: row.id, quoteNo: row.quote_no, status: 'draft' },
    },
  };
}

async function load(id: string, opts?: { asNew?: boolean; today?: string }) {
  const sb = requireSupabase();
  const { data, error } = await sb.from('quotes').select(COLUMNS).eq('id', id).single();
  if (error) throw error;
  const row = data as unknown as Row;
  const ids = [...new Set(row.quote_items.map((i) => i.element_id).filter((x): x is string => Boolean(x)))];
  const rates = new Map<string, number>();
  if (ids.length) {
    const els = await sb.from('elements').select('id, selling_rate').in('id', ids);
    if (els.error) throw els.error;
    for (const e of els.data ?? []) rates.set(e.id, Number(e.selling_rate));
  }
  return draftFromSavedQuote(row, rates, opts);
}

/** Object so tests can mock the Supabase calls. */
export const quoteEditApi = { load };
