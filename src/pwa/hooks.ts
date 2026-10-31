/**
 * React hooks for PWA state: install availability and online/offline status.
 */
import { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe, type InstallSnapshot } from './installPrompt';

export function usePwaInstall(): InstallSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}
