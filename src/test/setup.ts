/**
 * Vitest setup: jest-dom matchers + DOM cleanup after each test.
 * findBy* waits up to 3 s: the first render of a lazy route can exceed the 1 s default
 * when the whole suite (including the PGlite DB tests) runs in parallel.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import { MotionGlobalConfig } from 'motion/react';
import { dismiss, toastStore } from '@/components/ui/toast';

// Animations finish instantly in tests, so assertions never race an enter/exit transition.
MotionGlobalConfig.skipAnimations = true;
// jsdom has no canvas: return no context quietly (Fireworks then shows just its message).
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
}

configure({ asyncUtilTimeout: 3000 });

afterEach(() => {
  cleanup();
  // Toasts live in a module-level store; clear them so one test never sees another's.
  toastStore.getSnapshot().forEach((t) => dismiss(t.id));
});
