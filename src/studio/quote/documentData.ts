/**
 * The data a quotation document shows — built either from the live draft (preview)
 * or from a saved quote snapshot. One section per package, each with its included
 * elements and subtotal. No internal fields exist here.
 */
import type { EventOptions } from '@/data/eventOptions';
import type { GuestQuote } from '@/data/quotes';
import { parseMoney, parseQty } from '@/lib/numbers';
import { lineAmount, linesSubtotal } from '@/lib/pricing';
import type { QuoteDraft } from '../quoteDraft';
import type { QuoteSummary } from './quoteTotals';

export interface DocumentItem {
  name: string;
  /** Where the element is used (element remarks). */
  remarks?: string | null;
  unit: string | null;
  qty: number;
  rate: number;
  amount: number;
}

export interface DocumentSection {
  name: string;
  tier: string | null;
  items: DocumentItem[];
  subtotal: number;
}

export interface QuoteDocumentData {
  quoteNo: string | null;
  status: GuestQuote['status'];
  date: string; // ISO
  guestName: string;
  phone: string | null;
  functionName: string;
  venueName: string | null;
  subVenueName: string | null;
  eventDate: string | null;
  sessionName: string | null;
  sections: DocumentSection[];
  charges: { description: string; amount: number }[];
  subtotal: number;
  chargesTotal: number;
  total: number;
}

export function documentFromDraft(draft: QuoteDraft, options: EventOptions | undefined, summary: QuoteSummary, now = new Date()): QuoteDocumentData {
  const g = draft.guest;
  const find = <T extends { id: string; name: string }>(list: T[] | undefined, id: string | null | undefined) =>
    id ? (list?.find((x) => x.id === id)?.name ?? null) : null;
  return {
    quoteNo: draft.saved?.quoteNo ?? null,
    status: 'draft',
    date: now.toISOString(),
    guestName: g?.guestName ?? '',
    phone: g?.phone ?? null,
    functionName: find(options?.functions, g?.functionId) ?? '',
    venueName: find(options?.venues, g?.venueId),
    subVenueName: find(options?.subVenues, g?.subVenueId),
    eventDate: g?.eventDate ?? null,
    sessionName: find(options?.sessions, g?.sessionId),
    sections: draft.packages.map((b) => {
      const items = (b.lines ?? []).flatMap((l) => {
        const qty = parseQty(l.qty);
        const rate = parseMoney(l.rate);
        if (!l.included || qty === null || rate === null) return [];
        return [{ name: l.name, ...(l.remarks ? { remarks: l.remarks } : {}), unit: l.unit, qty, rate, amount: lineAmount(qty, rate) }];
      });
      return { name: b.name, tier: b.tier, items, subtotal: linesSubtotal(items) };
    }),
    charges: [], // additional charges were removed
    subtotal: summary.elementsSubtotal,
    chargesTotal: 0,
    total: summary.finalTotal,
  };
}

export function documentFromSaved(q: GuestQuote): QuoteDocumentData {
  const toItem = (i: GuestQuote['items'][number]): DocumentItem => ({
    name: i.element_name,
    ...(i.remarks ? { remarks: i.remarks } : {}),
    unit: i.unit,
    qty: i.qty,
    rate: i.rate,
    amount: i.amount,
  });
  const included = q.items.filter((i) => i.is_included);
  const sections: DocumentSection[] =
    q.packages.length > 0
      ? q.packages.map((p) => ({
          name: p.package_name,
          tier: p.package_tier,
          items: included.filter((i) => i.quote_package_id === p.id).map(toItem),
          subtotal: p.subtotal,
        }))
      : // Quotes saved before package sections existed: one section with everything.
        [{ name: q.package_name ?? 'Package', tier: q.package_tier, items: included.map(toItem), subtotal: q.elements_subtotal }];
  return {
    quoteNo: q.quote_no,
    status: q.status,
    date: q.created_at,
    guestName: q.guest_name,
    phone: q.guest_phone,
    functionName: q.function_name,
    venueName: q.venue_name,
    subVenueName: q.sub_venue_name,
    eventDate: q.event_date,
    sessionName: q.session_name,
    sections,
    charges: q.charges.map((c) => ({ description: c.description, amount: c.amount })),
    subtotal: q.elements_subtotal,
    chargesTotal: q.charges_total,
    total: q.final_total,
  };
}
