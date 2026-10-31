/**
 * Guest Studio step 3 — customise the chosen packages' elements for this quote.
 * One section per package (the same element can appear in two packages, separately).
 * Tick/untick, change quantity, and (staff only, behind "Adjust rates") change the rate.
 * "+ Add element" adds any active element to a section for this quote only.
 * Additional charges are edited here too, so the whole quote is adjusted on one screen.
 * Transportation / Labour are pre-added from the master charge rates (Labour follows the
 * number of packages); "Adjust rates" also unlocks their amounts.
 * Each package's subtotal and the elements total update instantly. Nothing here changes
 * the master element or the package defaults, and no internal hints are shown.
 * Dark stage panels like the Guest and Package steps; the price summary is as wide as the
 * guest card above it.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { studioCatalogApi } from '@/data/studioCatalog';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ImageThumb } from '@/components/ui/ImageThumb';
import { Spinner } from '@/components/ui/Spinner';
import { FormAlert } from '@/components/ui/FormAlert';
import { formatINR } from '@/lib/money';
import { useQuoteDraft, type DraftCharge, type DraftLine, type DraftPackageBlock } from '../quoteDraft';
import { linesChanged, linesFromPackage, refreshLines, summariseBlocks, type LineErrors, type LinesSummary } from '../lines';
import { AddElementDialog } from './AddElementDialog';
import { StepHeading } from '../StepHeading';
import { GuestSummary } from '../GuestSummary';
import { SIDE_STICKY } from '../steps';
import { ChargesEditor } from '../quote/ChargesEditor';
import { AnimatePresence, m } from 'motion/react';
import { quick, smooth } from '@/lib/motion';
import { summariseCharges } from '../quote/quoteTotals';
import { autoChargeAmount, ruleForVenue, syncAutoCharges } from '../quote/autoCharges';
import { useChargeRates } from '@/data/chargeRates';
import { roundMoney } from '@/lib/money';
import { parseMoney } from '@/lib/numbers';
import type { StudioElement } from '@/data/studioCatalog';

type OnLineChange = (blockId: string, elementId: string, patch: Partial<DraftLine>) => void;

interface RowProps {
  blockId: string;
  /** " in Royal Package" when several packages are shown, so labels stay unique. */
  labelSuffix: string;
  line: DraftLine;
  amount: number | null;
  errors: LineErrors | undefined;
  showErrors: boolean;
  editRates: boolean;
  onChange: OnLineChange;
}

const inputCls = (bad: boolean) =>
  `num w-full rounded-lg border px-3 py-2 text-right text-sm outline-none bg-white/5 text-ivory transition-colors duration-150 scheme-dark hover:bg-white/7 disabled:bg-transparent disabled:text-ivory/30 ${
    bad ? 'border-rose-400 focus:ring-2 focus:ring-rose-400/25' : 'border-white/15 focus:border-brand-300 focus:ring-2 focus:ring-brand-300/25'
  }`;

// Element keeps at least 11rem so names never collide with the other columns.
const GRID = 'sm:grid-cols-[auto_minmax(11rem,1fr)_minmax(0,9rem)_5rem_6.5rem_7rem]';

// Number boxes are right-aligned, so a click usually lands before the digits — put the caret at the end.
const caretToEnd = (e: React.FocusEvent<HTMLInputElement>) => {
  const el = e.currentTarget;
  requestAnimationFrame(() => el.setSelectionRange(el.value.length, el.value.length));
};

const LineRow = memo(function LineRow({ blockId, labelSuffix, line, amount, errors, showErrors, editRates, onChange }: RowProps) {
  const off = !line.included;
  const name = `${line.name}${labelSuffix}`;
  const set = (patch: Partial<DraftLine>) => onChange(blockId, line.elementId, patch);
  return (
    <m.li
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={smooth}
      className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-3 px-4 py-3 transition-colors duration-200 ease-premium ${GRID} sm:items-center ${
        off ? 'hover:bg-white/3' : 'bg-brand-400/8 shadow-[inset_3px_0_0_var(--color-brand-400)]'
      }`}
    >
      <span className="relative flex h-5 w-5">
        <input
          type="checkbox"
          checked={line.included}
          onChange={(e) => set({ included: e.target.checked })}
          aria-label={`Include ${name}`}
          className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border border-white/25 bg-white/5 transition-colors duration-150 hover:border-brand-300/70 checked:border-brand-400 checked:bg-brand-400 focus-visible:ring-2 focus-visible:ring-brand-300/40 focus-visible:outline-none"
        />
        <Icon name="check" size={14} className="pointer-events-none absolute inset-0 m-auto text-stage-950 opacity-0 transition-opacity duration-150 peer-checked:opacity-100" />
      </span>
      <div className={`flex min-w-0 items-center gap-3 ${off ? 'opacity-50' : ''}`}>
        <ImageThumb bucket="element-images" path={line.imagePath} alt="" size={44} dark className="ring-1 ring-white/10" />
        <div className="min-w-0">
          <p className="truncate font-medium text-ivory">{line.name}</p>
          {line.unit && <p className="text-xs text-ivory/45">per {line.unit}</p>}
          {line.remarks && <p className="text-xs text-ivory/55 italic sm:hidden">{line.remarks}</p>}
        </div>
      </div>
      {/* Remarks: own column on wider screens, under the name on phones */}
      <p className={`hidden text-sm text-ivory/65 sm:block ${off ? 'opacity-50' : ''}`} aria-label={`Remarks for ${name}`}>
        {line.remarks || <span className="text-ivory/25">—</span>}
      </p>
      <div className="col-span-2 grid grid-cols-3 gap-3 sm:contents">
        <label className="block">
          <span className="mb-1 block text-xs text-ivory/50 sm:sr-only">Qty</span>
          <input
            type="text"
            inputMode="decimal"
            value={line.qty}
            disabled={off}
            onChange={(e) => set({ qty: e.target.value })}
            onFocus={caretToEnd}
            aria-label={`Quantity for ${name}`}
            aria-invalid={showErrors && errors?.qty ? true : undefined}
            className={inputCls(showErrors && Boolean(errors?.qty))}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ivory/50 sm:sr-only">Rate</span>
          {editRates ? (
            <input
              type="text"
              inputMode="decimal"
              value={line.rate}
              disabled={off}
              onChange={(e) => set({ rate: e.target.value })}
              onFocus={caretToEnd}
              aria-label={`Rate for ${name}`}
              aria-invalid={showErrors && errors?.rate ? true : undefined}
              className={inputCls(showErrors && Boolean(errors?.rate))}
            />
          ) : (
            <p className={`num py-2 text-right text-sm text-ivory/75 ${off ? 'opacity-50' : ''}`} aria-label={`Rate for ${name}`}>
              {parseMoney(line.rate) === null ? '—' : formatINR(parseMoney(line.rate)!)}
            </p>
          )}
        </label>

        <div>
          <span className="mb-1 block text-xs text-ivory/50 sm:sr-only">Amount</span>
          <p className={`num py-2 text-right text-sm font-semibold ${off ? 'text-ivory/25 line-through' : 'text-brand-200'}`}>
            {amount === null ? '—' : formatINR(amount)}
          </p>
        </div>
      </div>
      {showErrors && errors && !off && (
        <p className="col-span-2 text-right text-xs text-rose-300 sm:col-span-6">{[errors.qty, errors.rate].filter(Boolean).join(' · ')}</p>
      )}
    </m.li>
  );
});

function PackageSection({
  block,
  summary,
  many,
  showErrors,
  editRates,
  onChange,
  onReset,
  onAdd,
}: {
  block: DraftPackageBlock & { lines: DraftLine[] };
  summary: LinesSummary;
  many: boolean;
  showErrors: boolean;
  editRates: boolean;
  onChange: OnLineChange;
  onReset: (blockId: string) => void;
  onAdd: (blockId: string) => void;
}) {
  const suffix = many ? ` in ${block.name}` : '';
  return (
    <section id={`pkg-${block.id}`} aria-label={block.name} className="scroll-mt-40 overflow-hidden rounded-2xl border border-brand-300/25 bg-stage-900/80 text-ivory shadow-2xl shadow-black/50 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-white/4 px-4 py-3.5">
        <div>
          <h3 className="font-display text-xl text-ivory">
            {block.name} <span className="font-sans text-sm text-brand-300">· {block.tier}</span>
          </h3>
          <p className="text-xs text-ivory/50">
            {summary.includedCount} of {block.lines.length} elements included
          </p>
        </div>
        <div className="flex items-center gap-3">
          {linesChanged(block.lines) && (
            <button type="button" onClick={() => onReset(block.id)} className="text-sm font-medium text-ivory/55 transition-colors duration-150 hover:text-ivory">
              Reset
            </button>
          )}
          <p className="text-right">
            <span className="block font-mono text-[11px] uppercase tracking-[0.2em] text-brand-300">Subtotal</span>
            <span className="num text-lg font-semibold text-ivory" aria-label={`${block.name} subtotal`}>
              <m.span key={summary.subtotal} initial={{ opacity: 0.35, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={quick} className="inline-block">
                {formatINR(summary.subtotal)}
              </m.span>
            </span>
          </p>
        </div>
      </div>
      <div className={`hidden gap-x-3 border-b border-white/10 px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ivory/45 sm:grid ${GRID}`}>
        <span className="w-5" />
        <span>Element</span>
        <span>Remarks</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Rate</span>
        <span className="text-right">Amount</span>
      </div>
      <ul className="divide-y divide-white/8" aria-label={`${block.name} elements`}>
        <AnimatePresence initial={false}>
        {block.lines.map((l) => (
          <LineRow
            key={l.elementId}
            blockId={block.id}
            labelSuffix={suffix}
            line={l}
            amount={summary.amounts.get(l.elementId) ?? null}
            errors={summary.errors.get(l.elementId)}
            showErrors={showErrors}
            editRates={editRates}
            onChange={onChange}
          />
        ))}
        </AnimatePresence>
      </ul>
      <div className="border-t border-white/10 px-4 py-3">
        <button type="button" onClick={() => onAdd(block.id)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-300 transition-colors duration-150 hover:text-brand-200">
          <Icon name="plus" size={16} /> Add element{many ? ` to ${block.name}` : ''}
        </button>
      </div>
    </section>
  );
}

export function CustomiseStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const { session } = useAuth();
  const [draft, updateDraft] = useQuoteDraft(session?.user.id ?? 'anon');
  const [editRates, setEditRates] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  // Each blocked "Continue" scrolls up to the error message (it sits at the top of the list).
  const [blocked, setBlocked] = useState(0);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (blocked) errorRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }, [blocked]);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  // Load lines for packages that haven't been seeded yet.
  const toLoad = draft.packages.filter((b) => b.lines === null);
  const sources = useQueries({
    queries: toLoad.map((b) => ({
      queryKey: ['studio', 'package-lines', b.id],
      queryFn: () => studioCatalogApi.packageLines(b.id),
    })),
  });
  const loadedKey = sources.map((s) => s.dataUpdatedAt).join(',');
  const failed = sources.some((s) => s.isError);

  // Packages already in the draft: re-read the catalogue so a rate / multiplier changed in the
  // workspace since then shows up (rates staff adjusted on this quote are kept).
  const loaded = draft.packages.filter((b) => b.lines !== null);
  const fresh = useQueries({
    queries: loaded.map((b) => ({
      queryKey: ['studio', 'package-lines', b.id],
      queryFn: () => studioCatalogApi.packageLines(b.id),
    })),
  });
  const freshKey = fresh.map((s) => s.dataUpdatedAt).join(',');
  useEffect(() => {
    const updates = new Map<string, DraftLine[]>();
    loaded.forEach((b, i) => {
      const data = fresh[i]?.data;
      const next = data && b.lines ? refreshLines(b.lines, data) : null;
      if (next) updates.set(b.id, next);
    });
    if (updates.size === 0) return;
    updateDraft((d) => ({ ...d, packages: d.packages.map((b) => (updates.has(b.id) ? { ...b, lines: updates.get(b.id)! } : b)) }));
    // freshKey changes exactly when a catalogue read arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshKey, updateDraft]);

  // Seed newly loaded packages from their defaults (external store, not React state).
  useEffect(() => {
    const ready = new Map<string, DraftLine[]>();
    toLoad.forEach((b, i) => {
      const data = sources[i]?.data;
      if (data) ready.set(b.id, linesFromPackage(data));
    });
    if (ready.size === 0) return;
    updateDraft((d) => ({
      ...d,
      packages: d.packages.map((b) => (b.lines === null && ready.has(b.id) ? { ...b, lines: ready.get(b.id)! } : b)),
    }));
    // loadedKey changes exactly when a query result arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey, updateDraft]);

  const onChange = useCallback<OnLineChange>(
    (blockId, elementId, patch) =>
      updateDraft((d) => ({
        ...d,
        packages: d.packages.map((b) =>
          b.id === blockId && b.lines ? { ...b, lines: b.lines.map((l) => (l.elementId === elementId ? { ...l, ...patch } : l)) } : b,
        ),
      })),
    [updateDraft],
  );

  const onReset = useCallback(
    (blockId: string) =>
      updateDraft((d) => ({
        ...d,
        packages: d.packages.map((b) =>
          b.id === blockId && b.lines
            ? { ...b, lines: b.lines.map((l) => ({ ...l, included: false, qty: String(l.defaultQty), rate: String(l.defaultRate) })) }
            : b,
        ),
      })),
    [updateDraft],
  );

  const onAddPick = useCallback(
    (blockId: string, el: StudioElement) => {
      updateDraft((d) => ({
        ...d,
        packages: d.packages.map((b) =>
          b.id === blockId && b.lines && !b.lines.some((l) => l.elementId === el.id)
            ? {
                ...b,
                lines: [
                  ...b.lines,
                  {
                    elementId: el.id,
                    name: el.name,
                    unit: el.unit,
                    imagePath: el.image_path,
                    ...(el.remarks ? { remarks: el.remarks } : {}),
                    defaultRate: el.default_rate,
                    defaultQty: el.default_qty ?? 1,
                    qty: String(el.default_qty ?? 1),
                    rate: String(el.default_rate),
                    included: true,
                  },
                ],
              }
            : b,
        ),
      }));
      setAddingTo(null);
    },
    [updateDraft],
  );

  const summary = useMemo(() => summariseBlocks(draft.packages), [draft.packages]);
  const charges = useMemo(() => summariseCharges(draft.charges), [draft.charges]);
  const setCharges = useCallback(
    (fn: (c: DraftCharge[]) => DraftCharge[]) => updateDraft((d) => ({ ...d, charges: fn(d.charges) })),
    [updateDraft],
  );

  // Pre-add Transportation / Labour from the master rates and keep Labour in step with the
  // package count, using the quote venue's rates (external store, not React state).
  // Rates not set up yet → nothing is added.
  const allRates = useChargeRates().data;
  const venueId = draft.guest?.venueId;
  const rates = useMemo(() => allRates?.map((r) => ruleForVenue(r, venueId)), [allRates, venueId]);
  const packageCount = draft.packages.length;
  const removedRules = draft.removedRules;
  useEffect(() => {
    if (!rates || draft.autoChargesOff) return;
    if (!syncAutoCharges(draft.charges, rates, packageCount, removedRules ?? [])) return;
    updateDraft((d) => ({ ...d, charges: syncAutoCharges(d.charges, rates, d.packages.length, d.removedRules ?? []) ?? d.charges }));
  }, [rates, draft.autoChargesOff, draft.charges, packageCount, removedRules, updateDraft]);

  const ruleLabels = useMemo(() => Object.fromEntries((rates ?? []).map((r) => [r.code, r.label])), [rates]);
  const onRuleRemoved = useCallback(
    (code: string) => updateDraft((d) => ({ ...d, removedRules: [...new Set([...(d.removedRules ?? []), code])] })),
    [updateDraft],
  );
  const onRuleRestore = useCallback(
    (code: string) => {
      const rule = rates?.find((r) => r.code === code);
      if (!rule || draft.autoChargesOff || autoChargeAmount(rule, packageCount) <= 0) return false;
      updateDraft((d) => ({ ...d, removedRules: (d.removedRules ?? []).filter((c) => c !== code) }));
      return true;
    },
    [rates, draft.autoChargesOff, packageCount, updateDraft],
  );
  const allLoaded = draft.packages.every((b) => b.lines !== null);

  function next() {
    if (!summary.valid || charges.errors.size > 0) {
      setShowErrors(true);
      setBlocked((n) => n + 1);
      return;
    }
    onDone();
  }

  if (failed) return <FormAlert>We couldn't load a package. Please go back and choose it again.</FormAlert>;
  if (!allLoaded) return <Spinner label="Loading packages…" />;

  const many = draft.packages.length > 1;
  const emptyNames = draft.packages.filter((b) => summary.emptyPackages.includes(b.id)).map((b) => b.name);

  const finalTotal = roundMoney(summary.total + charges.total);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="min-w-0 space-y-6">
        <StepHeading step="customise" />
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-stage-900/70 px-4 py-2.5 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-3 text-sm text-ivory/75">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-400/15 text-brand-300 ring-1 ring-brand-300/30">
              <Icon name={editRates ? 'edit' : 'check'} size={15} />
            </span>
            <span>
              {editRates ? 'Adjusting rates for this quote only — the master rates stay unchanged.' : 'Tick the elements the guest wants and set quantities.'}
              <span className="block text-xs text-ivory/45">
                {draft.packages.length} {draft.packages.length === 1 ? 'package' : 'packages'} · {summary.includedCount} elements included · additional charges below
              </span>
            </span>
          </p>
          <Button variant={editRates ? 'gold' : 'outline-light'} className="shrink-0 whitespace-nowrap py-2" onClick={() => setEditRates((v) => !v)} aria-pressed={editRates}>
            <Icon name={editRates ? 'lock' : 'edit'} size={16} />
            {editRates ? 'Done adjusting' : 'Adjust rates'}
          </Button>
        </div>

        {showErrors && (!summary.valid || charges.errors.size > 0) && (
          <div ref={errorRef} className="scroll-mt-44">
          <FormAlert dark>
            {emptyNames.length > 0
              ? `Include at least one element in ${emptyNames.join(' and ')}, or go back and remove ${emptyNames.length > 1 ? 'those packages' : 'that package'}.`
              : !summary.valid
                ? 'Fix the highlighted quantities or rates.'
                : 'Fix the highlighted charges.'}
          </FormAlert>
          </div>
        )}

        {draft.packages.map((b) => (
          <PackageSection
            key={b.id}
            block={b as DraftPackageBlock & { lines: DraftLine[] }}
            summary={summary.sections.get(b.id)!}
            many={many}
            showErrors={showErrors}
            editRates={editRates}
            onChange={onChange}
            onReset={onReset}
            onAdd={setAddingTo}
          />
        ))}

        {addingTo && (
          <AddElementDialog
            packageName={draft.packages.find((b) => b.id === addingTo)?.name ?? ''}
            existingIds={new Set((draft.packages.find((b) => b.id === addingTo)?.lines ?? []).map((l) => l.elementId))}
            onPick={(el) => onAddPick(addingTo, el)}
            onClose={() => setAddingTo(null)}
          />
        )}

        <ChargesEditor
          charges={draft.charges}
          errors={charges.errors}
          showErrors={showErrors}
          editRates={editRates}
          onChange={setCharges}
          ruleLabels={ruleLabels}
          onRuleRemoved={onRuleRemoved}
          onRuleRestore={onRuleRestore}
        />
      </div>

      {/* Price summary — stays in view while the elements and charges are changed. */}
      <div className={`space-y-4 ${SIDE_STICKY}`}>
      <GuestSummary />
      <aside aria-label="Price summary" className="relative overflow-hidden rounded-2xl border border-brand-300/25 bg-stage-900/80 text-ivory shadow-2xl shadow-black/50 backdrop-blur-md">
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgb(226_183_102/0.14),transparent_55%)]" />
        <h2 className="relative border-b border-white/10 px-5 py-3.5 font-mono text-[11px] font-normal uppercase tracking-[0.22em] text-brand-300">Price summary</h2>
        <div className="relative space-y-4 px-5 py-4">
          <ul className="space-y-1 text-sm">
            {draft.packages.map((b) => {
              const sec = summary.sections.get(b.id);
              return (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => document.getElementById(`pkg-${b.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="-mx-2 flex w-[calc(100%+1rem)] items-baseline justify-between gap-3 rounded-lg px-2 py-1 text-left transition-colors duration-150 hover:bg-white/5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-ivory/85">{b.name}</span>
                      <span className={`text-xs ${sec?.includedCount ? 'text-ivory/40' : 'text-amber-300'}`}>
                        {sec?.includedCount ? `${sec.includedCount} elements` : 'No element yet'}
                      </span>
                    </span>
                    <span className="num shrink-0 text-ivory">{formatINR(sec?.subtotal ?? 0)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <dl className="space-y-1.5 border-t border-white/10 pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ivory/55">{summary.includedCount} elements</dt>
              <dd className="num text-ivory" aria-label="Elements total">
                {formatINR(summary.total)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ivory/55">Additional charges</dt>
              <dd className="num text-ivory" aria-label="Charges total">
                {formatINR(charges.total)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-brand-300/30 pt-3" aria-live="polite">
              <dt className="font-semibold text-ivory">Final total</dt>
              <dd className="num text-3xl font-semibold text-brand-200" aria-label="Final total">
                <m.span key={finalTotal} initial={{ opacity: 0.35, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={quick} className="inline-block">
                {formatINR(finalTotal)}
              </m.span>
              </dd>
            </div>
          </dl>
          <div className="space-y-2">
            <Button variant="gold" onClick={next} full>
              Continue to quotation <Icon name="arrowRight" size={18} />
            </Button>
            <Button variant="outline-light" onClick={onBack} full>
              <Icon name="arrowLeft" size={18} /> Back to packages
            </Button>
          </div>
        </div>
      </aside>
      </div>
    </div>
  );
}
