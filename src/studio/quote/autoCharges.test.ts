/**
 * Tests for Additional charges added from the master rates (Transportation, Labour).
 */
import { describe, expect, it } from 'vitest';
import { autoChargeAmount, autoChargeDescription, ruleForVenue, syncAutoCharges } from './autoCharges';

const transport = { code: 'transportation', label: 'Transportation', mode: 'fixed' as const, rate: 1500, qty_per_package: 1, auto_add: true };
const labour = { code: 'labour', label: 'Labour', mode: 'per_package' as const, rate: 500, qty_per_package: 2, auto_add: true };
const RULES = [transport, labour];

describe('autoChargeAmount / description', () => {
  it('fixed = rate; per package = rate × labour per package × packages', () => {
    expect(autoChargeAmount(transport, 3)).toBe(1500);
    expect(autoChargeAmount(labour, 1)).toBe(1000);
    expect(autoChargeAmount(labour, 3)).toBe(3000);
    expect(autoChargeDescription(transport, 3)).toBe('Transportation');
    expect(autoChargeDescription(labour, 3)).toBe('Labour (6 × ₹500.00)');
  });
});

describe('syncAutoCharges', () => {
  const manual = { key: 'm1', description: 'Decor shipping', amount: '700' };

  it('adds the auto lines first, keeping manual lines after them', () => {
    expect(syncAutoCharges([manual], RULES, 2, [])).toEqual([
      { key: 'auto-transportation', rule: 'transportation', description: 'Transportation', amount: '1500' },
      { key: 'auto-labour', rule: 'labour', description: 'Labour (4 × ₹500.00)', amount: '2000' },
      manual,
    ]);
  });

  it('updates Labour when the package count changes, and is stable otherwise', () => {
    const two = syncAutoCharges([], RULES, 2, [])!;
    expect(syncAutoCharges(two, RULES, 2, [])).toBeNull();
    expect(syncAutoCharges(two, RULES, 3, [])![1]).toMatchObject({ amount: '3000', description: 'Labour (6 × ₹500.00)' });
  });

  it('keeps an adjusted amount, skips removed rules, ₹0 rates and rules turned off', () => {
    const adjusted = { key: 'auto-labour', rule: 'labour', description: 'Labour (4 × ₹500.00)', amount: '1800', adjusted: true };
    expect(syncAutoCharges([adjusted], RULES, 5, ['transportation'])).toBeNull();
    expect(syncAutoCharges([], [{ ...transport, rate: 0 }, { ...labour, auto_add: false }], 2, [])).toBeNull();
    expect(syncAutoCharges([], RULES, 2, ['labour'])!.map((c) => c.rule)).toEqual(['transportation']);
  });

  it('drops a non-adjusted auto line once its rule is removed', () => {
    const two = syncAutoCharges([], RULES, 2, [])!;
    expect(syncAutoCharges(two, RULES, 2, ['labour'])!.map((c) => c.rule)).toEqual(['transportation']);
  });
});

describe('ruleForVenue', () => {
  const transportByVenue = { ...transport, venues: [{ venue_id: 'v1', rate: 2500, qty_per_package: null }, { venue_id: 'v2', rate: 0, qty_per_package: null }] };

  it('Transportation uses the venue amount, else the default', () => {
    expect(ruleForVenue(transportByVenue, 'v1')).toMatchObject({ rate: 2500 });
    expect(ruleForVenue(transportByVenue, 'other')).toMatchObject({ rate: 1500 });
    expect(ruleForVenue(transportByVenue, null)).toMatchObject({ rate: 1500 });
    expect(autoChargeAmount(ruleForVenue(transportByVenue, 'v2'), 2)).toBe(0); // ₹0 at that venue → not added
  });

  it('Labour uses one rate everywhere, even if old venue rates exist', () => {
    const old = { ...labour, venues: [{ venue_id: 'v1', rate: 700, qty_per_package: 3 }] };
    expect(ruleForVenue(old, 'v1')).toMatchObject({ rate: 500, qty_per_package: 2 });
  });
});
