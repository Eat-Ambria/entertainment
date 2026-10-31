/**
 * Guest Studio progress: numbered steps joined by a line. Completed steps are clickable,
 * future steps are locked. Only the step name is shown here — the current step's hint is
 * in the page header, so nothing gets cut off.
 * Moving forward: the line to the new step fills in gold while a bright star with a comet tail flies along it, then
 * the new step's circle pops in with one ring ripple and the finished step's ✓ pops in.
 * Each piece is keyed on its state, so it only animates when the step really changes.
 */
import { Fragment, memo } from 'react';
import { m } from 'motion/react';
import { Icon } from '@/components/ui/Icon';
import { EASE, spring } from '@/lib/motion';
import { STUDIO_STEPS, stepIndex, type StudioStepKey } from './steps';

interface StepperProps {
  current: StudioStepKey;
  onSelect: (step: StudioStepKey) => void;
}

const FILL_S = 1.1;
// Small head start so the new step can render first — the star then runs without hitches.
const START_S = 0.15;

export const Stepper = memo(function Stepper({ current, onSelect }: StepperProps) {
  const currentIdx = stepIndex(current);

  return (
    <nav aria-label="Quotation progress">
      <ol className="flex items-center">
        {STUDIO_STEPS.map((step, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          const state = done ? 'done' : active ? 'active' : 'todo';
          return (
            <Fragment key={step.key}>
              {i > 0 && (
                <li aria-hidden="true" className="relative mx-2 h-0.5 flex-1 rounded-full bg-white/10 sm:mx-4">
                  <m.span
                    className="absolute inset-0 origin-left rounded-full bg-linear-to-r from-brand-500 via-brand-300 to-brand-400 shadow-[0_0_8px_rgb(226_183_102/0.5)]"
                    initial={false}
                    animate={{ scaleX: i <= currentIdx ? 1 : 0 }}
                    transition={{ duration: FILL_S, ease: EASE, delay: START_S }}
                  />
                  {/* A bright star with a gold comet tail flies along the line just filled. Only
                      transform + opacity are animated (GPU), and no CSS filters, so it stays smooth
                      while the new step renders. The track is as wide as the line, so x: 100% = the end. */}
                  {i === currentIdx && (
                    <m.span
                      key={`star-${currentIdx}`}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-10 will-change-transform"
                      initial={{ x: '0%', opacity: 0 }}
                      animate={{ x: '100%', opacity: [0, 1, 1, 1, 0] }}
                      transition={{ duration: FILL_S, ease: EASE, delay: START_S }}
                    >
                      <span className="absolute top-1/2 right-full h-1 w-20 -translate-y-1/2 rounded-full bg-linear-to-r from-transparent via-brand-300/60 to-ivory" />
                      <span className="absolute top-1/2 left-0 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgb(255_236_190/0.9),rgb(226_183_102/0.35)_40%,transparent_70%)]" />
                      <m.svg
                        viewBox="0 0 24 24"
                        className="absolute top-1/2 left-0 -mt-3 -ml-3 h-6 w-6 text-ivory will-change-transform"
                        initial={{ rotate: 0, scale: 0.6 }}
                        animate={{ rotate: 180, scale: [0.6, 1.25, 1] }}
                        transition={{ duration: FILL_S, ease: 'easeOut', delay: START_S }}
                      >
                        <path fill="currentColor" d="M12 0c.6 5.6 3.4 9.4 12 12-8.6 2.6-11.4 6.4-12 12-.6-5.6-3.4-9.4-12-12 8.6-2.6 11.4-6.4 12-12Z" />
                      </m.svg>
                    </m.span>
                  )}
                </li>
              )}
              <li className="shrink-0">
                <button
                  type="button"
                  disabled={!done}
                  onClick={() => onSelect(step.key)}
                  aria-current={active ? 'step' : undefined}
                  aria-label={`Step ${i + 1}: ${step.label}${done ? ' (done)' : ''}`}
                  className="group flex items-center gap-2.5 rounded-full py-1 pr-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-brand-300 disabled:cursor-default"
                >
                  <span className="relative">
                    {active && (
                      <m.span
                        key={`ripple-${currentIdx}`}
                        aria-hidden="true"
                        className="absolute inset-0 rounded-full ring-2 ring-brand-300"
                        initial={{ scale: 1, opacity: 0 }}
                        animate={{ scale: [1, 1.9], opacity: [0.7, 0] }}
                        transition={{ duration: 0.9, delay: START_S + FILL_S * 0.75, ease: 'easeOut' }}
                      />
                    )}
                    <m.span
                      key={state}
                      initial={state === 'todo' ? false : { scale: 0.6, opacity: 0.4 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ ...spring, delay: active ? START_S + FILL_S * 0.75 : 0 }}
                      className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors duration-200 ease-premium ${
                        done
                          ? 'bg-brand-400 text-stage-950 group-hover:bg-brand-300'
                          : active
                            ? 'bg-brand-400 text-stage-950 ring-4 ring-brand-400/25 shadow-[0_0_16px_rgb(226_183_102/0.45)]'
                            : 'border border-white/20 text-ivory/40'
                      }`}
                    >
                      {done ? (
                        <m.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring, delay: 0.1 }}>
                          <Icon name="check" size={16} />
                        </m.span>
                      ) : (
                        i + 1
                      )}
                    </m.span>
                  </span>
                  {/* On phones only the current step's name is shown, so the bar never wraps. */}
                  <m.span
                    key={`label-${state}`}
                    initial={active ? { opacity: 0, x: -6 } : false}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: active ? START_S + FILL_S * 0.75 : 0, ease: EASE }}
                    className={`whitespace-nowrap text-sm font-medium transition-colors duration-200 ${active ? 'text-ivory' : 'hidden sm:inline'} ${
                      done ? 'text-ivory/70 group-hover:text-ivory' : active ? '' : 'text-ivory/40'
                    }`}
                  >
                    {step.label}
                  </m.span>
                </button>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
});
