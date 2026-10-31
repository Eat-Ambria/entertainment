/**
 * Captures the browser's "install app" prompt as early as possible (it can fire before
 * React mounts) and exposes it as a tiny store for usePwaInstall().
 * Android/desktop Chrome & Edge fire `beforeinstallprompt`; iOS Safari never does —
 * there the user installs via Share -> Add to Home Screen.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallSnapshot {
  canPrompt: boolean;
  installed: boolean;
  isIos: boolean;
}

let deferred: BeforeInstallPromptEvent | null = null;
let snapshot: InstallSnapshot = { canPrompt: false, installed: false, isIos: false };
const listeners = new Set<() => void>();

function emit(next: Partial<InstallSnapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

export function isStandalone(win: Window = window): boolean {
  return (
    win.matchMedia?.('(display-mode: standalone)').matches === true ||
    (win.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function detectIos(userAgent: string): boolean {
  return /iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && /mobile/i.test(userAgent));
}

/** Call once at startup. Returns a cleanup function (used by tests). */
export function initInstallPrompt(win: Window = window): () => void {
  emit({ installed: isStandalone(win), isIos: detectIos(win.navigator.userAgent), canPrompt: false });

  const onPrompt = (e: Event) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit({ canPrompt: true });
  };
  const onInstalled = () => {
    deferred = null;
    emit({ canPrompt: false, installed: true });
  };

  win.addEventListener('beforeinstallprompt', onPrompt);
  win.addEventListener('appinstalled', onInstalled);
  return () => {
    win.removeEventListener('beforeinstallprompt', onPrompt);
    win.removeEventListener('appinstalled', onInstalled);
  };
}

/** Shows the native install dialog. Resolves true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const evt = deferred;
  deferred = null;
  emit({ canPrompt: false });
  await evt.prompt();
  const { outcome } = await evt.userChoice;
  if (outcome === 'accepted') emit({ installed: true });
  return outcome === 'accepted';
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): InstallSnapshot {
  return snapshot;
}
