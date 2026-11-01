/**
 * Tests for quotation totals, charge validation and the save payload.
 */
import { describe, expect, it } from 'vitest';
import { EMPTY_DRAFT, type QuoteDraft } from '../quoteDraft';
import { linesFromPackage } from '../lines';
import { buildSavePayload, summariseCharges, summariseQuote } from './quoteTotals';

/** Package lines with every element ticked (elements start unticked in the Studio). */
const ticked = (pkg: Parameters<typeof linesFromPackage>[0]) => linesFromPackage(pkg).map((l) => ({ ...l, included: true }));

const draft = (o: Partial<QuoteDraft> = {}): QuoteDraft => ({
  ...EMPTY_DRAFT,
  guest: {
    source: 'manual',
    sourceRef: null,
    sourceRaw: null,
    guestName: 'Mehta Family',
    phone: '9876543210',
    functionId: 'f1',
    venueId: 'v1',
    subVenueId: null,
    eventDate: '2027-01-10',
    sessionId: 's1',
  },
  packages: [
    {
      id: 'p1',
      name: 'Royal Package',
      tier: 'Premium',
      lines: ticked([
        { element_id: 'e1', name: 'Entrance Arch', unit: 'Nos', image_path: null, default_rate: 25000, default_qty: 1 },
        { element_id: 'e2', name: 'Sofa Lounge', unit: 'Set', image_path: null, default_rate: 15000, default_qty: 2 },
      ]),
    },
  ],
  ...o,
});

describe('summariseCharges', () => {
  it('totals valid charges and flags bad rows', () => {
    const r = summariseCharges([
      { key: 'a', description: 'Transportation', amount: '5,000' },
      { key: 'b', description: ' ', amount: '1200.50' },
      { key: 'c', description: 'Labour', amount: '-1' },
    ]);
    expect(r.total).toBe(6200.5);
    expect(r.errors.get('b')).toEqual({ description: 'Describe the charge' });
    expect(r.errors.get('c')).toEqual({ amount: 'Enter a valid amount' });
    expect(r.errors.has('a')).toBe(false);
  });
});

describe('summariseQuote', () => {
  it('Final = included elements subtotal (additional charges were removed and are ignored)', () => {
    const d = draft({ charges: [{ key: 'a', description: 'Transportation', amount: '5000' }] });
    d.packages[0]!.lines![1]!.included = false;
    expect(summariseQuote(d)).toMatchObject({ elementsSubtotal: 25000, chargesTotal: 0, finalTotal: 25000, valid: true });
  });

  it('works with no charges', () => {
    expect(summariseQuote(draft())).toMatchObject({ chargesTotal: 0, finalTotal: 55000, valid: true });
  });

  it('is invalid with a bad line', () => {
    const d = draft();
    d.packages[0]!.lines![0]!.qty = '0';
    expect(summariseQuote(d).valid).toBe(false);
  });
});

describe('buildSavePayload', () => {
  it('sends ids, numbers and the saved id — never names or totals', () => {
    const d = draft({ charges: [{ key: 'a', description: ' Labour ', amount: '2,500' }], saved: { id: 'q1', quoteNo: 'ENT-2026-00001' } });
    d.packages[0]!.lines![1]!.rate = '14,000';
    d.packages[0]!.lines![1]!.qty = '3';
    expect(buildSavePayload(d)).toEqual({
      quote_id: 'q1',
      guest: {
        source: 'manual',
        source_ref: null,
        source_raw: null,
        guest_name: 'Mehta Family',
        guest_phone: '9876543210',
        function_id: 'f1',
        venue_id: 'v1',
        sub_venue_id: null,
        event_date: '2027-01-10',
        session_id: 's1',
      },
      packages: [
        {
          package_id: 'p1',
          lines: [
            { element_id: 'e1', qty: 1, rate: 25000, included: true },
            { element_id: 'e2', qty: 3, rate: 14000, included: true },
          ],
        },
      ],
      charges: [],
      notes: null,
    });
  });

  it('sends one block per package, in the order chosen', () => {
    const d = draft();
    d.packages.push({ id: 'p2', name: 'Classic', tier: 'Standard', lines: d.packages[0]!.lines!.map((l) => ({ ...l })) });
    const p = buildSavePayload(d)!;
    expect(p.packages.map((b) => b.package_id)).toEqual(['p1', 'p2']);
    expect(summariseQuote(d).elementsSubtotal).toBe(110000);
  });

  it('returns null for an incomplete draft', () => {
    expect(buildSavePayload({ ...EMPTY_DRAFT })).toBeNull();
    expect(buildSavePayload(draft({ guest: null }))).toBeNull();
  });

  it('falls back to defaults for excluded lines with blank inputs', () => {
    const d = draft();
    d.packages[0]!.lines![0]!.included = false;
    d.packages[0]!.lines![0]!.qty = '';
    expect(buildSavePayload(d)!.packages[0]!.lines[0]).toEqual({ element_id: 'e1', qty: 1, rate: 25000, included: false });
  });
});
