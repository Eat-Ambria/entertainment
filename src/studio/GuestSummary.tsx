/**
 * The current quote's guest and event as a small glass card (guest name, then "Sangeet ·
 * 12 Dec 2026 · Dinner · Ambria Exotica"), shown in the step header once guest details exist.
 * Same width as the steps' right-hand panel so it sits right above it.
 */
import { useAuth } from '@/auth/AuthContext';
import { useEventOptions } from '@/data/eventOptions';
import { Icon } from '@/components/ui/Icon';
import { formatDate } from '@/lib/date';
import { useQuoteDraft } from './quoteDraft';

export function GuestSummary() {
  const { session } = useAuth();
  const [draft] = useQuoteDraft(session?.user.id ?? 'anon');
  const options = useEventOptions();
  const g = draft.guest;
  if (!g) return null;
  const fn = options.data?.functions.find((f) => f.id === g.functionId)?.name;
  const venue = options.data?.venues.find((v) => v.id === g.venueId)?.name;
  const sessionName = options.data?.sessions.find((x) => x.id === g.sessionId)?.name;
  return (
    <div className="flex w-full items-center gap-3 rounded-2xl border border-brand-300/25 bg-stage-900/80 px-4 py-3 shadow-xl shadow-black/40 lg:w-[22rem] xl:w-[26rem]">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-400/15 text-brand-300 ring-1 ring-brand-300/40">
        <Icon name="user" size={18} />
      </span>
      <div className="min-w-0">
        <p className="truncate font-display text-lg leading-tight text-ivory" title={g.guestName}>
          {g.guestName}
        </p>
        <p className="mt-0.5 truncate text-xs text-ivory/60">{[fn, formatDate(g.eventDate), sessionName, venue].filter(Boolean).join(' · ')}</p>
      </div>
    </div>
  );
}
