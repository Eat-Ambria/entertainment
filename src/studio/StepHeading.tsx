/**
 * "STEP 02 / 04 · PACKAGE" + hint. The step page shows it above Guest and Quotation; Package and
 * Customise put it at the top of their left column so their right column (guest card + panel)
 * starts right under the stepper and can stay fixed while only the left side scrolls.
 */
import { m } from 'motion/react';
import { STUDIO_STEPS, stepIndex, type StudioStepKey } from './steps';

export function StepHeading({ step }: { step: StudioStepKey }) {
  const meta = STUDIO_STEPS[stepIndex(step)]!;
  return (
    <header>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand-300">
        Step {String(stepIndex(step) + 1).padStart(2, '0')} / {String(STUDIO_STEPS.length).padStart(2, '0')}
      </p>
      <m.h1 key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-1.5 font-display text-3xl font-normal uppercase leading-none text-ivory sm:text-4xl">
        {meta.label}
      </m.h1>
      <p className="mt-1.5 text-sm text-ivory/60">{meta.hint}</p>
    </header>
  );
}
