/**
 * Catalogue → Additional charges: the master rates the Guest Studio uses to pre-add
 * Transportation (fixed amount) and Labour (rate × labour per package × packages) to new
 * quotes. Transportation: a default plus an optional amount per venue (blank = use the
 * default; ₹0 = not charged at that venue). Labour: one rate for every venue. Saved quotes keep their own amounts, so changes here only
 * affect new quotes.
 */
import { useState, type FormEvent } from 'react';
import { useChargeRates, useSaveChargeRate, type ChargeRate, type ChargeVenueRate } from '@/data/chargeRates';
import { useEventOptions, type VenueOption } from '@/data/eventOptions';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { FormAlert } from '@/components/ui/FormAlert';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/toast';
import { formatINR, roundMoney } from '@/lib/money';
import { parseMoney, parseQty, toInput } from '@/lib/numbers';
import { dbErrorMessage } from '@/lib/dbErrors';

interface RowInput {
  rate: string;
  qty: string;
}
type Errors = Record<string, { rate?: string; qty?: string }>;

const DEFAULT = 'default';

const inputCls = (bad: boolean) =>
  `num w-full rounded-lg border bg-white py-2 pr-3 pl-7 text-right text-sm outline-none transition-colors duration-150 placeholder:text-slate-400 focus:ring-2 ${
    bad ? 'border-rose-400 focus:ring-rose-100' : 'border-slate-300 hover:border-slate-400 focus:border-brand-500 focus:ring-brand-100'
  }`;

function RateCard({ rate, venues: allVenues }: { rate: ChargeRate; venues: VenueOption[] }) {
  const save = useSaveChargeRate();
  const perPackage = rate.mode === 'per_package';
  // Only the fixed charge (Transportation) varies by venue; Labour has one rate everywhere.
  const venues = perPackage ? [] : allVenues;
  const initial = (): Record<string, RowInput> => {
    const rows: Record<string, RowInput> = { [DEFAULT]: { rate: toInput(rate.rate), qty: toInput(rate.qty_per_package) } };
    for (const v of venues) {
      const o = rate.venues.find((x) => x.venue_id === v.id);
      rows[v.id] = { rate: o ? toInput(o.rate) : '', qty: o?.qty_per_package != null ? toInput(o.qty_per_package) : '' };
    }
    return rows;
  };
  const [rows, setRows] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const set = (id: string, p: Partial<RowInput>) => setRows((r) => ({ ...r, [id]: { ...r[id]!, ...p } }));

  const def = rows[DEFAULT]!;
  const defRate = parseMoney(def.rate);
  const defQty = perPackage ? parseQty(def.qty) : rate.qty_per_package;

  function validate(): { errors: Errors; venues: ChargeVenueRate[] } {
    const errs: Errors = {};
    if (defRate === null) errs[DEFAULT] = { rate: 'Enter a valid amount' };
    if (perPackage && defQty === null) errs[DEFAULT] = { ...errs[DEFAULT], qty: 'Above 0' };
    const out: ChargeVenueRate[] = [];
    for (const v of venues) {
      const r = rows[v.id]!;
      const blankRate = r.rate.trim() === '';
      const blankQty = r.qty.trim() === '';
      if (blankRate && blankQty) continue; // uses the default
      const rr = blankRate ? defRate : parseMoney(r.rate);
      const qq = blankQty ? null : parseQty(r.qty);
      if (rr === null) errs[v.id] = { rate: 'Enter a valid amount' };
      if (!blankQty && qq === null) errs[v.id] = { ...errs[v.id], qty: 'Above 0' };
      if (rr !== null && (blankQty || qq !== null)) out.push({ venue_id: v.id, rate: rr, qty_per_package: perPackage ? qq : null });
    }
    return { errors: errs, venues: out };
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const v = validate();
    setErrors(v.errors);
    if (Object.keys(v.errors).length) return;
    try {
      await save.mutateAsync({ id: rate.id, save: { rate: defRate!, qty_per_package: perPackage ? defQty : null, venues: v.venues } });
      toast.success(`${rate.label} rates saved.`);
    } catch (err) {
      toast.error(dbErrorMessage(err));
    }
  }

  const preview = (r: number | null, q: number | null) =>
    perPackage ? `1 package → ${formatINR(roundMoney((r ?? 0) * (q ?? 0)))}` : (r ?? 0) > 0 ? 'Added to new quotes' : 'Not added (₹0)';
  const previewOn = (r: number | null) => (r ?? 0) > 0;

  const row = (id: string, name: string, hint: string, isDefault = false) => {
    const r = rows[id]!;
    const e = errors[id];
    const effRate = r.rate.trim() === '' ? defRate : parseMoney(r.rate);
    const effQty = !perPackage ? 1 : r.qty.trim() === '' ? defQty : parseQty(r.qty);
    return (
      <tr key={id} className={`border-t border-slate-100 transition-colors duration-150 hover:bg-slate-50/70 ${isDefault ? 'bg-brand-50/40' : ''}`}>
        <td className="py-3 pr-3 pl-1 align-middle">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                isDefault ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'
              }`}
              aria-hidden="true"
            >
              {isDefault ? '★' : name.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className={`truncate text-sm ${isDefault ? 'font-semibold text-slate-900' : 'font-medium text-slate-800'}`}>{name}</p>
              <span
                className={`mt-0.5 inline-block rounded-full px-2 py-px text-[11px] font-medium ${
                  hint === 'Own rate' ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {hint}
              </span>
            </div>
          </div>
        </td>
        <td className="w-48 px-2 py-2 align-middle">
          <span className="relative block">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-slate-400" aria-hidden="true">
            ₹
          </span>
          <input
            value={r.rate}
            inputMode="decimal"
            onChange={(ev) => set(id, { rate: ev.target.value })}
            placeholder={isDefault ? '0' : defRate === null ? 'Default' : `${formatINR(defRate).replace('₹', '')} (default)`}
            aria-label={`${rate.label} ${perPackage ? 'rate per labour' : 'amount'} at ${name}`}
            aria-invalid={e?.rate ? true : undefined}
            className={inputCls(Boolean(e?.rate))}
          />
          </span>
          {e?.rate && <p className="mt-1 text-right text-xs text-rose-600">{e.rate}</p>}
        </td>
        {perPackage && (
          <td className="w-28 px-2 py-2 align-middle">
            <input
              value={r.qty}
              inputMode="decimal"
              onChange={(ev) => set(id, { qty: ev.target.value })}
              placeholder={isDefault ? '1' : `Default ${defQty ?? ''}`}
              aria-label={`${rate.label} per package at ${name}`}
              aria-invalid={e?.qty ? true : undefined}
              className={`${inputCls(Boolean(e?.qty))} pl-3`}
            />
            {e?.qty && <p className="mt-1 text-right text-xs text-rose-600">{e.qty}</p>}
          </td>
        )}
        <td className="hidden py-3 pr-1 pl-2 text-right align-middle sm:table-cell">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              perPackage ? 'bg-brand-50 text-brand-800' : previewOn(effRate) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {!perPackage && <span className={`h-1.5 w-1.5 rounded-full ${previewOn(effRate) ? 'bg-emerald-500' : 'bg-slate-400'}`} />}
            {preview(effRate, effQty)}
          </span>
        </td>
      </tr>
    );
  };

  return (
    <form onSubmit={onSave} noValidate aria-label={`${rate.label} rates`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-brand-50 p-2.5 text-brand-600" aria-hidden="true">
            <Icon name={perPackage ? 'team' : 'receipt'} size={20} />
          </span>
          <div>
          <h3 className="font-semibold text-slate-900">{rate.label}</h3>
          <p className="text-xs text-slate-500">
            {perPackage
              ? 'Rate per labour × labour per package × packages chosen — same for every venue.'
              : 'One fixed amount per quote. Blank venue = default; ₹0 = not charged there.'}
          </p>
          </div>
        </div>
        <Button type="submit" loading={save.isPending}>
          Save
        </Button>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <th className="pb-2 pr-3 pl-1">{perPackage ? '' : 'Venue'}</th>
              <th className="px-2 pb-2 text-right">{perPackage ? 'Rate / labour' : 'Amount'}</th>
              {perPackage && <th className="px-2 pb-2 text-right">Per package</th>}
              <th className="hidden pb-2 pl-2 text-right sm:table-cell" />
            </tr>
          </thead>
          <tbody>
            {row(DEFAULT, perPackage ? 'All venues' : 'Default', perPackage ? 'Same rate everywhere' : 'Venues without their own rate', true)}
            {venues.map((v) => row(v.id, v.name, rate.venues.some((x) => x.venue_id === v.id) ? 'Own rate' : 'Uses default'))}
          </tbody>
        </table>
      </div>
    </form>
  );
}

export function ChargeRatesSection() {
  const rates = useChargeRates();
  const options = useEventOptions();
  if (rates.isLoading || options.isLoading) return <Spinner label="Loading charge rates…" />;
  if (rates.isError) return <FormAlert>{dbErrorMessage(rates.error)}</FormAlert>;
  if (options.isError) return <FormAlert>{dbErrorMessage(options.error)}</FormAlert>;
  const venues = options.data?.venues ?? [];
  return (
    <div className="space-y-4">
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      {(rates.data ?? []).map((r) => (
        <RateCard key={`${r.id}-${JSON.stringify([r.rate, r.qty_per_package, r.venues])}`} rate={r} venues={venues} />
      ))}
      </div>
      <p className="flex items-start gap-1.5 text-xs text-slate-500">
        Pre-added to new quotes in the Guest Studio using the quote’s venue. Staff can still change or remove them on a quote with “Adjust rates”.
      </p>
    </div>
  );
}
