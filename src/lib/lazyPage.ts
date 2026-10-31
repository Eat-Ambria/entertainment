/**
 * Lazy page loading that survives a new deploy. After a deploy the old page in an open tab still
 * asks for the previous build's chunk files (e.g. StudioNewQuotePage-<oldhash>.js), which no
 * longer exist — "Failed to fetch dynamically imported module". In that case the page reloads once
 * to pick up the new build instead of showing an error. A 10-second guard stops reload loops.
 */
import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'app:chunk-reload-at';

export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(msg);
}

/** Reloads the page unless it was just reloaded for the same reason. Returns whether it reloaded. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 10_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // storage blocked: still reload once
  }
  window.location.reload();
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same constraint as React.lazy
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().catch((err: unknown) => {
      if (isChunkLoadError(err) && reloadForNewVersion()) return new Promise<never>(() => undefined); // page is reloading
      throw err;
    }),
  );
}
