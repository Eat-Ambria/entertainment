/**
 * Additional charges editor (transport, labour…): quick-add chips, description + amount rows,
 * remove. Lives on the Customise step next to the elements so everything is edited in one place.
 * Lines added from the master charge rates (Transportation, Labour) come pre-filled and are
 * read-only until staff choose "Adjust rates"; changing the amount stops it following the
 * package count. Manual lines are always editable. Dark stage panel (Customise step).
 */
import { memo } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Icon } from '@/components/ui/Icon';
import { smooth } from '@/lib/motion';
import { formatINR } from '@/lib/money';
import { parseMoney } from '@/lib/numbers';
import type { DraftCharge } from '../quoteDraft';
import type { ChargeErrors } from './quoteTotals';

const QUICK_CHARGES = ['Transportation', 'Labour', 'Additional services'];

let keySeq = 0;
const newChargeKey = () => `c${Date.now().toString(36)}${(keySeq++).toString(36)}`;

interface Props {
  charges: DraftCharge[];
  errors: Map<string, ChargeErrors>;
  showErrors: boolean;
  editRates: boolean;
  onChange: (update: (charges: DraftCharge[]) => DraftCharge[]) => void;
  /** Master-rate labels by code (e.g. labour → "Labour"), for the quick-add chips. */
  ruleLabels?: Record<string, string>;
  /** An auto line was removed — remember it so it isn't added back. */
  onRuleRemoved?: (code: string) => void;
  /** Quick-add of a master-rate charge; returns false when it can't be auto-filled (e.g. rate ₹0). */
  onRuleRestore?: (code: string) => boolean;
}

const fieldCls = (bad: boolean) =>
  `w-full rounded-lg border bg-white/5 px-3 py-2 text-sm text-ivory outline-none transition-colors duration-150 scheme-dark placeholder:text-ivory/30 hover:bg-white/7 focus:ring-2 ${
    bad ? 'border-rose-400 focus:ring-rose-400/25' : 'border-white/15 focus:border-brand-300 focus:ring-brand-300/25'
  }`;

export const ChargesEditor = memo(function ChargesEditor({
  charges,
  errors,
  showErrors,
  editRates,
  onChange,
  ruleLabels = {},
  onRuleRemoved,
  onRuleRestore,
}: Props) {
  const addManual = (description: string) => onChange((c) => [...c, { key: newChargeKey(), description, amount: '' }]);
  const patch = (key: string, p: Partial<DraftCharge>) => onChange((all) => all.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const codeOf = (label: string) => Object.keys(ruleLabels).find((code) => ruleLabels[code] === label);
  const present = new Set(charges.flatMap((c) => (c.rule ? [c.rule] : [])));

  function quickAdd(label: string) {
    const code = codeOf(label);
    if (code && onRuleRestore?.(code)) return;
    addManual(label);
  }

  function remove(c: DraftCharge) {
    if (c.rule) onRuleRemoved?.(c.rule);
    onChange((all) => all.filter((x) => x.key !== c.key));
  }

  return (
    <section aria-label="Additional charges" className="rounded-2xl border border-brand-300/25 bg-stage-900/80 text-ivory shadow-2xl shadow-black/50 backdrop-blur-md p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl text-ivory">Additional charges</h2>
          <p className="text-sm text-ivory/55">Transport and labour are added from your charge rates. Add other services if needed.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_CHARGES.filter((label) => {
            const code = codeOf(label);
            return !code || !present.has(code);
          }).map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => quickAdd(label)}
              className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-ivory/70 transition-colors duration-150 hover:border-brand-300/50 hover:bg-white/7 hover:text-ivory"
            >
              + {label}
            </button>
          ))}
        </div>
      </div>

      {charges.length > 0 && (
        <ul className="mt-4 space-y-3">
          <AnimatePresence initial={false}>
          {charges.map((c, i) => {
            const e = showErrors ? errors.get(c.key) : undefined;
            const locked = Boolean(c.rule) && !editRates;
            return (
              <m.li
                key={c.key}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={smooth}
                className="grid grid-cols-[1fr_9rem_auto] items-start gap-2"
              >
                <div>
                  {c.rule ? (
                    <p className="px-1 py-2 text-sm text-ivory" aria-label={`Charge ${i + 1} description`}>
                      {c.description}
                      <span className="ml-2 text-xs text-ivory/40">{c.adjusted ? 'Adjusted for this quote' : 'From your rates'}</span>
                    </p>
                  ) : (
                    <input
                      value={c.description}
                      onChange={(ev) => patch(c.key, { description: ev.target.value })}
                      aria-label={`Charge ${i + 1} description`}
                      aria-invalid={e?.description ? true : undefined}
                      placeholder="Description"
                      className={fieldCls(Boolean(e?.description))}
                    />
                  )}
                  {e?.description && <p className="mt-1 text-xs text-rose-300">{e.description}</p>}
                </div>
                <div>
                  {locked ? (
                    <p className="num px-3 py-2 text-right text-sm text-brand-200" aria-label={`Charge ${i + 1} amount`}>
                      {parseMoney(c.amount) === null ? '—' : formatINR(parseMoney(c.amount)!)}
                    </p>
                  ) : (
                    <input
                      value={c.amount}
                      inputMode="decimal"
                      onChange={(ev) => patch(c.key, { amount: ev.target.value, ...(c.rule ? { adjusted: true } : {}) })}
                      aria-label={`Charge ${i + 1} amount`}
                      aria-invalid={e?.amount ? true : undefined}
                      placeholder="₹ 0.00"
                      className={`num text-right ${fieldCls(Boolean(e?.amount))}`}
                    />
                  )}
                  {e?.amount && <p className="mt-1 text-right text-xs text-rose-300">{e.amount}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => remove(c)}
                  className="rounded-md p-2 text-ivory/40 transition-colors duration-150 hover:bg-white/10 hover:text-rose-300"
                  aria-label={`Remove charge ${i + 1}`}
                >
                  <Icon name="close" size={16} />
                </button>
              </m.li>
            );
          })}
          </AnimatePresence>
        </ul>
      )}
      <button
        type="button"
        onClick={() => addManual('')}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-300 transition-colors duration-150 hover:text-brand-200"
      >
        <Icon name="plus" size={16} /> Add charge
      </button>
    </section>
  );
});
