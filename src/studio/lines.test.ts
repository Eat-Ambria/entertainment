/**
 * Tests for quote line building, validation and totals.
 */
import { describe, expect, it } from 'vitest';
import { linesChanged, linesFromPackage, refreshLines, summariseBlocks, summariseLines } from './lines';
import { normaliseDraft } from './quoteDraft';

/** Package lines with every element ticked (elements start unticked in the Studio). */
const ticked = (pkg: Parameters<typeof linesFromPackage>[0]) => linesFromPackage(pkg).map((l) => ({ ...l, included: true }));

const PKG = [
  { element_id: 'e1', name: 'Entrance Arch', unit: 'Nos', image_path: null, default_rate: 25000, default_qty: 1 },
  { element_id: 'e2', name: 'Sofa Lounge', unit: 'Set', image_path: 'u/s.webp', default_rate: 15000, default_qty: 2 },
  { element_id: 'e3', name: 'Fresh Flowers', unit: 'Kg', image_path: null, default_rate: 190, default_qty: 0.5 },
];

describe('linesFromPackage', () => {
  it('starts every element unticked at the package defaults', () => {
    const lines = linesFromPackage(PKG);
    expect(lines[1]).toEqual({
      elementId: 'e2',
      name: 'Sofa Lounge',
      unit: 'Set',
      imagePath: 'u/s.webp',
      defaultRate: 15000,
      defaultQty: 2,
      qty: '2',
      rate: '15000',
      included: false,
    });
    expect(linesChanged(lines)).toBe(false);
    expect(linesChanged(lines.map((l, i) => (i === 0 ? { ...l, included: true } : l)))).toBe(true);
  });
});

describe('summariseLines', () => {
  it('totals included lines only (Amount = Qty × Rate)', () => {
    const lines = ticked(PKG);
    const s = summariseLines(lines);
    expect(s.subtotal).toBe(25000 + 30000 + 95);
    expect(s.includedCount).toBe(3);
    expect(s.amounts.get('e3')).toBe(95);

    lines[1]!.included = false;
    expect(summariseLines(lines).subtotal).toBe(25095);
    expect(summariseLines(lines).includedCount).toBe(2);
  });

  it('recalculates when quantity or rate changes', () => {
    const lines = ticked(PKG);
    lines[0]!.qty = '2';
    lines[0]!.rate = '24,500';
    const s = summariseLines(lines);
    expect(s.amounts.get('e1')).toBe(49000);
    expect(s.subtotal).toBe(49000 + 30000 + 95);
    expect(linesChanged(lines)).toBe(true);
  });

  it('flags invalid included lines but ignores excluded ones', () => {
    const lines = ticked(PKG);
    lines[0]!.qty = '0';
    lines[1]!.rate = 'abc';
    lines[2]!.included = false;
    lines[2]!.qty = '';
    const s = summariseLines(lines);
    expect(s.valid).toBe(false);
    expect(s.errors.get('e1')).toEqual({ qty: 'Enter a quantity above 0' });
    expect(s.errors.get('e2')).toEqual({ rate: 'Enter a valid rate' });
    expect(s.errors.has('e3')).toBe(false);
    expect(s.subtotal).toBe(0);
  });

  it('is invalid when nothing is included', () => {
    const lines = ticked(PKG).map((l) => ({ ...l, included: false }));
    expect(summariseLines(lines)).toMatchObject({ valid: false, includedCount: 0, subtotal: 0 });
  });

  it('allows a zero rate (complimentary element)', () => {
    const lines = ticked(PKG);
    lines[2]!.rate = '0';
    expect(summariseLines(lines)).toMatchObject({ valid: true, subtotal: 55000 });
  });
});

describe('summariseBlocks (several packages)', () => {
  const royal = { id: 'p1', name: 'Royal', tier: 'Premium', lines: ticked(PKG.slice(0, 2)) };
  const classic = { id: 'p2', name: 'Classic', tier: 'Standard', lines: ticked([PKG[0]!, PKG[2]!]) };

  it('gives each package its own subtotal and adds them up; a shared element counts in both', () => {
    const s = summariseBlocks([royal, classic]);
    expect(s.sections.get('p1')!.subtotal).toBe(55000);
    expect(s.sections.get('p2')!.subtotal).toBe(25095);
    expect(s.total).toBe(80095);
    expect(s.includedCount).toBe(4);
    expect(s.valid).toBe(true);
  });

  it('is invalid when a package has nothing included or is not loaded yet', () => {
    const emptied = { ...classic, lines: classic.lines.map((l) => ({ ...l, included: false })) };
    expect(summariseBlocks([royal, emptied])).toMatchObject({ valid: false, emptyPackages: ['p2'] });
    expect(summariseBlocks([royal, { ...classic, lines: null }]).valid).toBe(false);
    expect(summariseBlocks([]).valid).toBe(false);
  });
});

describe('normaliseDraft', () => {
  it('upgrades a single-package draft saved by an older version', () => {
    const old = { guest: null, package: { id: 'p1', name: 'Royal', tier: 'Premium' }, lines: ticked(PKG), linesEdited: true };
    expect(normaliseDraft(old)).toEqual({
      guest: null,
      packages: [{ id: 'p1', name: 'Royal', tier: 'Premium', lines: ticked(PKG) }],
      charges: [],
      saved: null,
    });
    expect(normaliseDraft({})).toEqual({ guest: null, packages: [], charges: [], saved: null });
  });
});

describe('refreshLines (catalogue changed after the package was opened)', () => {
  it('moves untouched lines to the new rate, keeps adjusted rates, and follows remarks', () => {
    const lines = ticked(PKG).map((l, i) => (i === 1 ? { ...l, rate: '14000' } : l)); // e2 adjusted on this quote
    const fresh = PKG.map((p) => ({ ...p, default_rate: p.default_rate * 2, remarks: p.element_id === 'e1' ? 'Gate' : null }));
    const next = refreshLines(lines, fresh)!;
    expect(next[0]).toMatchObject({ rate: '50000', defaultRate: 50000, remarks: 'Gate' });
    expect(next[1]).toMatchObject({ rate: '14000', defaultRate: 30000 });
    expect(refreshLines(next, fresh)).toBeNull(); // stable
  });
});

