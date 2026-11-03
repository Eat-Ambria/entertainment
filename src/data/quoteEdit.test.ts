/**
 * Tests for turning a saved quote back into an editable Studio draft.
 */
import { describe, expect, it } from 'vitest';
import { draftFromSavedQuote, QuoteNotEditableError } from './quoteEdit';

type Row = Parameters<typeof draftFromSavedQuote>[0];

const row = (o: Partial<Row> = {}): Row => ({
  id: 'q1',
  quote_no: 'ENT-2026-00007',
  status: 'draft',
  source: 'lms_contract',
  source_ref: 'C-1042',
  guest_name: 'Mehta Family',
  guest_phone: '9876543210',
  function_id: 'f1',
  venue_id: 'v1',
  sub_venue_id: null,
  event_date: '2027-01-10',
  session_id: 's1',
  quote_packages: [
    { id: 'qp2', package_id: 'p2', package_name: 'Classic', package_tier: 'Standard', sort_order: 2 },
    { id: 'qp1', package_id: 'p1', package_name: 'Royal', package_tier: 'Premium', sort_order: 1 },
  ],
  quote_items: [
    { quote_package_id: 'qp1', element_id: 'e1', element_name: 'Arch', unit: 'Nos', image_path: null, qty: '1.00', rate: '24000.00', is_included: true, sort_order: 1001 },
    { quote_package_id: 'qp1', element_id: 'e2', element_name: 'Fog', unit: null, image_path: null, qty: '1.00', rate: '3000.00', is_included: false, sort_order: 1002 },
    { quote_package_id: 'qp2', element_id: null, element_name: 'Deleted thing', unit: null, image_path: null, qty: '1.00', rate: '10.00', is_included: true, sort_order: 2001 },
    { quote_package_id: 'qp2', element_id: 'e3', element_name: 'DJ', unit: 'Hour', image_path: null, qty: '4.00', rate: '8000.00', is_included: true, sort_order: 2002 },
  ],
  quote_charges: [{ description: 'Transportation', amount: '5000.00', sort_order: 1 }],
  ...o,
});

describe('draftFromSavedQuote', () => {
  it('rebuilds guest, packages in order, lines (incl. excluded) and charges', () => {
    const { draft, droppedLines } = draftFromSavedQuote(row(), new Map([['e1', 25000]]));
    expect(droppedLines).toBe(1);
    expect(draft.guest).toMatchObject({ guestName: 'Mehta Family', functionId: 'f1', source: 'lms_contract', sourceRef: 'C-1042', sourceRaw: null });
    expect(draft.packages.map((p) => [p.id, p.name])).toEqual([
      ['p1', 'Royal'],
      ['p2', 'Classic'],
    ]);
    expect(draft.packages[0]!.lines).toEqual([
      { elementId: 'e1', name: 'Arch', unit: 'Nos', imagePath: null, defaultRate: 25000, defaultQty: 1, qty: '1', rate: '24000', included: true },
      { elementId: 'e2', name: 'Fog', unit: null, imagePath: null, defaultRate: 3000, defaultQty: 1, qty: '1', rate: '3000', included: false },
    ]);
    expect(draft.packages[1]!.lines!.map((l) => l.name)).toEqual(['DJ']);
    expect(draft.charges).toMatchObject([{ description: 'Transportation', amount: '5000' }]);
    expect(draft.saved).toEqual({ id: 'q1', quoteNo: 'ENT-2026-00007', status: 'draft' });
    expect(draft.autoChargesOff).toBe(true); // saved charges stay exactly as saved
  });

  it('refuses confirmed/cancelled quotes and quotes whose package was deleted', () => {
    expect(() => draftFromSavedQuote(row({ status: 'confirmed' }), new Map())).toThrow(QuoteNotEditableError);
    expect(() =>
      draftFromSavedQuote(row({ quote_packages: [{ id: 'qp1', package_id: null, package_name: 'Gone', package_tier: null, sort_order: 1 }] }), new Map()),
    ).toThrow(/package in this quote has been deleted/);
  });

  it('reopens a sent quote, and notes whose quote it is when it is a teammate’s', () => {
    expect(draftFromSavedQuote(row({ status: 'sent' }), new Map()).draft.saved).toEqual({ id: 'q1', quoteNo: 'ENT-2026-00007', status: 'sent' });
    expect(draftFromSavedQuote(row({ mine: false, owner_name: 'Rahul' }), new Map()).draft.saved).toMatchObject({ ownerName: 'Rahul' });
  });

  it('leaves missing option ids blank so the guest step asks again', () => {
    const { draft } = draftFromSavedQuote(row({ function_id: null, session_id: null }), new Map());
    expect(draft.guest).toMatchObject({ functionId: '', sessionId: '' });
  });
});
