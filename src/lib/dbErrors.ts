/**
 * Maps Supabase/PostgREST errors to short, user-facing messages.
 * Raw database text is never shown on screen.
 */
interface PgErrorLike {
  code?: string;
  status?: number;
  message?: string;
}

export function errorCode(error: unknown): string | undefined {
  return (error as PgErrorLike | null)?.code;
}

export const DB_OUTDATED_MESSAGE =
  'The database needs an update. Run the latest supabase/APPLY_ALL.sql in the Supabase SQL Editor, then refresh.';

export function dbErrorMessage(error: unknown, overrides: Record<string, string> = {}): string {
  const e = (error ?? {}) as PgErrorLike;
  const code = e.code ?? '';
  if (overrides[code]) return overrides[code];

  // Full details for developers only; never rendered on screen.
  if (import.meta.env.DEV && error) console.error('[db error]', error);

  switch (code) {
    case '42P01': // table/view missing
    case '42883': // function missing
    case 'PGRST202': // RPC not in schema cache
    case 'PGRST205': // table/view not in schema cache
      return DB_OUTDATED_MESSAGE;
    case '23505':
      return 'This already exists.';
    case '23514':
    case '22P02':
    case '22003':
      return 'One of the values is not valid.';
    case 'P0429':
      return 'Too many changes in a short time. Please wait a moment and try again.';
    case '42501':
      return "You don't have permission to do that.";
    case 'P0002':
    case 'PGRST116':
      return 'This item no longer exists. Refresh the page.';
  }
  if (e.status === 429) return 'Too many requests. Please wait a moment and try again.';
  const msg = (e.message ?? '').toLowerCase();
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Cannot reach the server. Check your internet connection.';
  }
  return 'Something went wrong. Please try again.';
}

/** Delete RPCs raise plain-language reasons (hint in_packages / has_vendor_rates) that are safe to show. */
export function deleteErrorMessage(error: unknown): string {
  const e = (error ?? {}) as PgErrorLike & { hint?: string };
  if (e.hint === 'in_packages' || e.hint === 'has_vendor_rates') return e.message ?? dbErrorMessage(error);
  return dbErrorMessage(error);
}

/** Escapes % _ \ so user text is matched literally inside ILIKE patterns. */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}
