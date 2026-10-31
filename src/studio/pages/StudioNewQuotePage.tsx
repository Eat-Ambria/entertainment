/**
 * Guest Studio quotation flow: stepper + current step.
 * All four steps are live: Guest & Event, Package, Customise, Quotation (save + PDF).
 * Leaving the flow after the quote was saved (Home / My workspace) clears the draft, so the
 * next quote starts fresh.
 * Each step needs the previous one: opening a later step directly sends you back.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { EASE, stepSlide } from '@/lib/motion';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Stepper } from '../Stepper';
import { parseStep, stepIndex, type StudioStepKey } from '../steps';
import { EMPTY_DRAFT, useQuoteDraft, type QuoteDraft } from '../quoteDraft';
import { GuestStep } from '../guest/GuestStep';
import { PackageStep } from '../package/PackageStep';
import { CustomiseStep } from '../package/CustomiseStep';
import { QuoteStep } from '../quote/QuoteStep';
import { StepHeading } from '../StepHeading';

/** Furthest step the draft allows. */
function reachable(d: QuoteDraft): StudioStepKey {
  if (!d.guest) return 'guest';
  if (d.packages.length === 0) return 'package';
  if (d.packages.some((b) => b.lines === null)) return 'customise';
  return 'quote';
}

export default function StudioNewQuotePage() {
  const { session } = useAuth();
  const [draft, updateDraft] = useQuoteDraft(session?.user.id ?? 'anon');
  // Clear only after this page has unmounted: clearing while here would redirect to ?step=guest.
  const savedRef = useRef(false);
  const isSaved = Boolean(draft.saved);
  useEffect(() => {
    savedRef.current = isSaved;
  }, [isSaved]);
  useEffect(
    () => () => {
      if (savedRef.current) updateDraft(() => EMPTY_DRAFT);
    },
    [updateDraft],
  );
  const [params, setParams] = useSearchParams();
  const step = parseStep(params.get('step'));
  // Which way the content slides: forward (+1) or back (-1). Derived when the step changes.
  const [trail, setTrail] = useState({ step, dir: 1 });
  if (trail.step !== step) setTrail({ step, dir: stepIndex(step) >= stepIndex(trail.step) ? 1 : -1 });
  const dir = trail.dir;

  const goTo = useCallback(
    (s: StudioStepKey) => {
      // The next step opens from the top. Jump (no smooth scroll), so scrolling never runs
      // at the same time as the step animation.
      if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'instant' });
      setParams((p) => {
        const n = new URLSearchParams(p);
        n.set('step', s);
        return n;
      });
    },
    [setParams],
  );

  const maxStep = reachable(draft);
  if (stepIndex(step) > stepIndex(maxStep)) return <Navigate to={`?step=${maxStep}`} replace />;

  return (
    <div className="space-y-4">
      {/* Stays in view right under the header while scrolling. The dark band behind it (full width,
          fading out below) hides content passing underneath, so nothing peeks through the gap.
          It starts exactly at its sticky spot (cancels the page padding), so it never moves. */}
      <div className="sticky top-18 z-10 -mx-[clamp(1rem,2.2vw,4rem)] -mt-6 bg-linear-to-b sm:-mt-8 from-stage-950 from-70% to-transparent px-[clamp(1rem,2.2vw,4rem)] pt-3 pb-3 -mb-2">
        <div className="rounded-2xl border border-white/10 bg-stage-900/90 px-4 py-2.5 shadow-lg shadow-black/40 sm:px-5">
          <Stepper current={step} onSelect={goTo} />
        </div>
      </div>

      {/* Package and Customise show the title in their own left column (and the guest card on the right). */}
      {(step === 'guest' || step === 'quote') && <StepHeading step={step} />}

      {/* Each step is unveiled from the direction of travel, with a gold light sweeping across. */}
      <div className="relative">
      {/* Clipped to the content box so the light never widens the page (no sideways scrollbar). */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <AnimatePresence initial={false}>
        <m.span
          key={`sweep-${step}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-20 w-1/3 will-change-transform"
          initial={{ x: dir > 0 ? '-100%' : '300%', opacity: 0 }}
          animate={{ x: dir > 0 ? '300%' : '-100%', opacity: [0, 1, 1, 0] }}
          transition={{ duration: 0.9, ease: EASE, delay: 0.18 }}
        >
          <span className="absolute inset-0 bg-linear-to-r from-transparent via-brand-300/12 to-transparent" />
          <span className="absolute inset-y-0 left-1/2 w-px bg-linear-to-b from-transparent via-brand-200/70 to-transparent" />
        </m.span>
        {/* A gold hairline draws across the top as the new step arrives. */}
        <m.span
          key={`line-${step}`}
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 z-20 h-px bg-linear-to-r from-transparent via-brand-300 to-transparent ${dir > 0 ? 'origin-left' : 'origin-right'}`}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: [0, 1, 1], opacity: [0, 1, 0] }}
          transition={{ duration: 1, ease: EASE, delay: 0.15 }}
        />
      </AnimatePresence>
      </span>
      <AnimatePresence mode="wait" custom={dir} initial={false}>
      <m.div key={step} custom={dir} variants={stepSlide} initial="enter" animate="center" exit="exit" className="step-stagger">
        {step === 'guest' && <GuestStep onDone={() => goTo('package')} />}
        {step === 'package' && <PackageStep onBack={() => goTo('guest')} onDone={() => goTo('customise')} />}
        {step === 'customise' && <CustomiseStep onBack={() => goTo('package')} onDone={() => goTo('quote')} />}
        {step === 'quote' && <QuoteStep onBack={() => goTo('customise')} />}
      </m.div>
      </AnimatePresence>
      </div>
    </div>
  );
}
