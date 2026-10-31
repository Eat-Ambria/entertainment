/**
 * Messages for save_quote failures. The RPC raises a few plain-language messages of our
 * own (see supabase/migrations/0011_save_quote.sql); those are shown as-is. Anything
 * else falls back to the generic, guest-safe dbErrorMessage.
 */
import { dbErrorMessage } from '@/lib/dbErrors';

/** Exact messages raised by save_quote that are safe to show on screen. */
const OWN_MESSAGES = [
  'Guest details are missing.',
  'Too many lines in this quote.',
  'Include at least one element.',
  'Each element can appear only once.',
  'Enter a valid 10-digit mobile number.',
  'Choose the event date.',
  'Choose the function, venue and session again.',
  'The sub-venue does not belong to this venue.',
  'Choose the package again.',
  'One of the elements is no longer available.',
];

export interface SaveErrorInfo {
  message: string;
  /** The saved quote was sent/confirmed/cancelled meanwhile — it can only be saved as a new quote. */
  locked: boolean;
}

export function saveErrorInfo(err: unknown): SaveErrorInfo {
  const msg = String((err as { message?: unknown } | null)?.message ?? '');
  const locked = /^Quote \S+ is (sent|confirmed|cancelled) and can no longer be edited\.$/.exec(msg);
  if (locked) {
    return {
      locked: true,
      message: `This quote is already ${locked[1]} and locked, so it can't be changed. Save your changes as a new quote instead.`,
    };
  }
  if (OWN_MESSAGES.includes(msg)) return { locked: false, message: msg };
  return { locked: false, message: dbErrorMessage(err) };
}
