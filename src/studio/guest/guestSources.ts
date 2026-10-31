/**
 * Guest lookup for the Guest Studio: `lmsAdapter` calls the `lms-proxy` Edge Function (LMS URL
 * and ids stay server-side) and returns at most 5 normalised results; the UI masks phone numbers.
 * There is no demo data — tests pass their own adapter.
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { requireSupabase } from '@/lib/supabase';
import { MAX_RESULTS, type GuestLookupResult, type LmsSource } from '../../../supabase/functions/_shared/lms';

export type { GuestLookupResult, LmsSource };

export type LookupErrorCode =
  | 'lms_mapping_pending'
  | 'lms_not_configured'
  | 'lms_unavailable'
  | 'rate_limited'
  | 'unauthorized'
  | 'unknown';

export class LookupError extends Error {
  constructor(public code: LookupErrorCode) {
    super(code);
    this.name = 'LookupError';
  }
}

export interface GuestSourceAdapter {
  search(source: LmsSource, query: string): Promise<GuestLookupResult[]>;
}

const KNOWN: LookupErrorCode[] = ['lms_mapping_pending', 'lms_not_configured', 'lms_unavailable', 'rate_limited', 'unauthorized'];

export const lmsAdapter: GuestSourceAdapter = {
  async search(source, query) {
    const { data, error } = await requireSupabase().functions.invoke<{ results: GuestLookupResult[] }>('lms-proxy', {
      body: { source, query },
    });
    if (error) {
      let code: LookupErrorCode = 'unknown';
      if (error instanceof FunctionsHttpError) {
        const payload = (await error.context.json().catch(() => null)) as { code?: string } | null;
        if (payload?.code && (KNOWN as string[]).includes(payload.code)) code = payload.code as LookupErrorCode;
      }
      throw new LookupError(code);
    }
    return (data?.results ?? []).slice(0, MAX_RESULTS);
  },
};

export function getGuestAdapter(): GuestSourceAdapter {
  return lmsAdapter;
}

/**
 * Searches contracts and leads together (contracts first), at most MAX_RESULTS overall.
 * If one side fails the other's results are still returned; only if both fail does it throw.
 */
export async function searchAllGuests(adapter: GuestSourceAdapter, query: string): Promise<{ results: GuestLookupResult[]; failed: LmsSource[] }> {
  const sources: LmsSource[] = ['contract', 'lead'];
  const settled = await Promise.allSettled(sources.map((s) => adapter.search(s, query)));
  const failed = sources.filter((_, i) => settled[i]!.status === 'rejected');
  if (failed.length === sources.length) throw (settled[0] as PromiseRejectedResult).reason;
  const results = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])).slice(0, MAX_RESULTS);
  return { results, failed };
}

export function lookupErrorMessage(err: unknown, source: LmsSource | 'any'): string {
  const what = source === 'lead' ? 'Lead' : source === 'contract' ? 'Contract' : 'Guest';
  const code = err instanceof LookupError ? err.code : 'unknown';
  switch (code) {
    case 'lms_mapping_pending':
    case 'lms_not_configured':
      return `${what} lookup isn't connected yet. Please enter the details manually.`;
    case 'rate_limited':
      return 'Too many searches in a short time. Please wait a minute and try again.';
    case 'lms_unavailable':
      return `Couldn't reach the ${source === 'any' ? 'LMS' : what.toLowerCase()} system. Try again, or enter the details manually.`;
    default:
      return 'Search failed. Try again, or enter the details manually.';
  }
}
