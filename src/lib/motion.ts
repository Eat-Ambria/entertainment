/**
 * The app's motion system (Motion for React). One easing, two springs and a few shared
 * variants so every screen moves the same way — see the entertainment-presentation-ui skill.
 * Wrap screens in <MotionProvider> (components/ui/MotionProvider) and use `m.*`, not `motion.*`.
 */
import type { Transition, Variants } from 'motion/react';

/** Quick out, soft landing — same curve as `ease-premium` in index.css. */
export const EASE = [0.2, 0.8, 0.2, 1] as const;

/** Fast interactions (hover, press, small state changes). */
export const quick: Transition = { duration: 0.16, ease: EASE };
/** Standard transitions (content reveals, step changes). */
export const smooth: Transition = { duration: 0.24, ease: EASE };
/** Modals and drawers. */
export const modal: Transition = { duration: 0.26, ease: EASE };
/** For things that should feel physical (cards lifting, badges popping) — no visible bounce. */
export const spring: Transition = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 };

/** Parent of a staggered list: children rise one after another. */
export const listStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};

/** Child of `listStagger`. */
export const riseItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: smooth },
};

/**
 * Step-to-step transition; `custom` = +1 going forward, -1 going back. The old step drifts out
 * and dims; the new one is unveiled by a wipe from the direction of travel while it glides in.
 * The clip is removed once done so shadows, dropdowns and dialogs are never cut off.
 */
export const stepSlide: Variants = {
  enter: (dir: number) => ({
    opacity: 0,
    x: dir * 32,
    clipPath: dir > 0 ? 'inset(0% 100% 0% 0%)' : 'inset(0% 0% 0% 100%)',
  }),
  center: {
    opacity: 1,
    x: 0,
    clipPath: 'inset(0% 0% 0% 0%)',
    transition: { duration: 0.6, ease: EASE, opacity: { duration: 0.35, ease: EASE } },
    transitionEnd: { clipPath: 'none' },
  },
  exit: (dir: number) => ({ opacity: 0, x: dir * -36, scale: 0.985, transition: { duration: 0.22, ease: EASE } }),
};
