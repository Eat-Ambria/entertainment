/**
 * Motion for React provider: LazyMotion keeps the bundle small (use `m.*`, never `motion.*`);
 * MotionConfig honours the user's reduced-motion setting (movement is dropped, fades stay).
 * Tokens and variants live in src/lib/motion.ts.
 */
import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig, domMax } from 'motion/react';
import { smooth } from '@/lib/motion';

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={smooth}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
