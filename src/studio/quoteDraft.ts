/**
 * The quote being built in the Guest Studio, shared across the four steps.
 * Kept per user in sessionStorage so a refresh doesn't lose the guest's details;
 * wiped on sign-out (see AuthProvider) and when a quote is saved (Day 8).
 */
import { useCallback, useSyncExternalStore } from 'react';
import { draftKey, readDraft, writeDraft } from '@/lib/sessionDrafts';

export type GuestSource = 'manual' | 'lms_lead' | 'lms_contract';

export interface GuestDraft {
  source: GuestSource;
  sourceRef: string | null;
  sourceRaw: unknown;
  guestName: string;
  phone: string; // normalised 10 digits
  functionId: string;
  venueId: string;
  subVenueId: string | null;
  eventDate: string; // YYYY-MM-DD
  sessionId: string;
}

export interface DraftPackage {
  id: string;
  name: string;
  tier: string;
}

/** One element line of the quote. qty/rate are kept as typed (strings) and parsed for maths. */
export interface DraftLine {
  elementId: string;
  name: string;
  unit: string | null;
  imagePath: string | null;
  /** Element remarks — where it is used. Shown to the guest. */
  remarks?: string | null;
  defaultRate: number;
  defaultQty: number;
  qty: string;
  rate: string;
  included: boolean;
}

/** Additional charge row (transport, labour…). amount kept as typed. */
export interface DraftCharge {
  key: string;
  description: string;
  amount: string;
  /** Set for lines added from the master charge rates (e.g. 'labour'). */
  rule?: string;
  /** Staff changed the amount, so it no longer follows the package count. */
  adjusted?: boolean;
}

/** One chosen package and its element lines for this quote. */
export interface DraftPackageBlock extends DraftPackage {
  /** null = not loaded from the package yet. */
  lines: DraftLine[] | null;
}

export interface QuoteDraft {
  guest: GuestDraft | null;
  /** Chosen packages, in the order they were picked. */
  packages: DraftPackageBlock[];
  charges: DraftCharge[];
  /** Auto charges staff removed from this quote — not added back. */
  removedRules?: string[];
  /** Reopened saved quotes keep their charges exactly; no auto charges are added. */
  autoChargesOff?: boolean;
  /** Set after the first save; later saves update this draft quote in place. */
  /** snapshot = the saved payload (JSON, without the quote id) — used to tell if anything changed since. */
  saved: { id: string; quoteNo: string; status?: 'draft'; snapshot?: string } | null;
}

export const EMPTY_DRAFT: QuoteDraft = { guest: null, packages: [], charges: [], saved: null };

/** Accepts drafts saved by older versions (single package + lines) and fills missing fields. */
export function normaliseDraft(raw: Partial<QuoteDraft> & { package?: DraftPackage | null; lines?: DraftLine[] | null }): QuoteDraft {
  const packages =
    raw.packages ?? (raw.package ? [{ ...raw.package, lines: raw.lines ?? null }] : []);
  return {
    guest: raw.guest ?? null,
    packages,
    charges: raw.charges ?? [],
    ...(raw.removedRules?.length ? { removedRules: raw.removedRules } : {}),
    ...(raw.autoChargesOff ? { autoChargesOff: true } : {}),
    saved: raw.saved ?? null,
  };
}
const EMPTY = EMPTY_DRAFT;
// Parsed object per key, reused while the stored JSON is unchanged (stable snapshot for React).
// Re-checking storage on every read means clearAllDrafts() on sign-out is seen immediately.
const cache = new Map<string, { raw: string | null; value: QuoteDraft }>();
const listeners = new Set<() => void>();

function key(userId: string) {
  return draftKey('quote', userId);
}

function rawOf(k: string): string | null {
  try {
    return sessionStorage.getItem(k);
  } catch {
    return cache.get(k)?.raw ?? null;
  }
}

export function getQuoteDraft(userId: string): QuoteDraft {
  const k = key(userId);
  const raw = rawOf(k);
  const hit = cache.get(k);
  if (hit && hit.raw === raw) return hit.value;
  const value = raw ? normaliseDraft(readDraft<Parameters<typeof normaliseDraft>[0]>(k) ?? {}) : EMPTY;
  cache.set(k, { raw, value });
  return value;
}

export function setQuoteDraft(userId: string, update: (d: QuoteDraft) => QuoteDraft): void {
  const k = key(userId);
  const next = update(getQuoteDraft(userId));
  writeDraft(k, next);
  cache.set(k, { raw: rawOf(k), value: next });
  listeners.forEach((l) => l());
}

export function resetQuoteDraftCache(): void {
  cache.clear();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useQuoteDraft(userId: string) {
  const draft = useSyncExternalStore(
    subscribe,
    () => getQuoteDraft(userId),
    () => getQuoteDraft(userId),
  );
  const update = useCallback((fn: (d: QuoteDraft) => QuoteDraft) => setQuoteDraft(userId, fn), [userId]);
  return [draft, update] as const;
}
