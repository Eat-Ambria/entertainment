/**
 * Per-user drafts kept in sessionStorage (survive refresh, die with the tab).
 * Keys are namespaced by user id; clearAllDrafts() runs on sign-out so nothing a
 * guest typed stays behind on a shared device.
 */
const PREFIX = 'draft:';

export function draftKey(name: string, userId: string): string {
  return `${PREFIX}${name}:${userId}`;
}

export function readDraft<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeDraft(key: string, value: unknown): void {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode) — the draft just won't survive a refresh.
  }
}

export function clearAllDrafts(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}
