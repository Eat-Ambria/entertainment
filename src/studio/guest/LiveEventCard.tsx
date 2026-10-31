/**
 * The guest's event, taking shape while the form is filled in — an invitation-style card on the
 * stage beside the Guest & Event form: name, function, date, venue, session, a live countdown
 * and a gold progress line for the details still needed. Purely a preview; it saves nothing.
 */
import { m } from 'motion/react';
import type { EventOptions } from '@/data/eventOptions';
import { GoldDust } from '@/components/ui/GoldDust';
import { formatDate } from '@/lib/date';
import { smooth } from '@/lib/motion';
import { EventCountdown } from '../EventCountdown';
import type { GuestForm } from './guestValidation';

/** Re-keyed on change so each new value glides in. */
function Value({ value, placeholder, className = '' }: { value: string | null | undefined; placeholder: string; className?: string }) {
  return (
    <m.span
      key={value || placeholder}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={smooth}
      className={`block ${value ? '' : 'text-ivory/30'} ${className}`}
    >
      {value || placeholder}
    </m.span>
  );
}

export function LiveEventCard({ form, opts }: { form: GuestForm; opts: EventOptions }) {
  const fn = opts.functions.find((f) => f.id === form.functionId)?.name;
  const venue = opts.venues.find((v) => v.id === form.venueId)?.name;
  const sub = opts.subVenues.find((s) => s.id === form.subVenueId)?.name;
  const session = opts.sessions.find((s) => s.id === form.sessionId)?.name;

  const checks = [form.guestName.trim(), form.phone.length === 10, form.functionId, form.eventDate, form.venueId, form.sessionId];
  const filled = checks.filter(Boolean).length;

  return (
    <aside
      aria-label="Your event preview"
      className="relative flex flex-col overflow-hidden rounded-2xl border border-brand-300/25 bg-stage-900/80 p-5 shadow-2xl shadow-black/50"
    >
      <GoldDust />
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgb(226_183_102/0.18),transparent_55%)]" />
      <div className="relative flex flex-1 flex-col">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand-300">Your event</p>
        <p className="mt-3 font-display text-2xl leading-tight uppercase text-ivory">
          <Value value={form.guestName.trim()} placeholder="Guest name" />
        </p>
        <p className="mt-1 text-lg text-brand-200">
          <Value value={fn} placeholder="Function" />
        </p>

        <div className="gold-hairline my-4" />

        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs text-ivory/45">Date</dt>
            <dd className="mt-0.5 text-ivory">
              <Value value={form.eventDate ? formatDate(form.eventDate) : ''} placeholder="Choose a date" />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ivory/45">Session</dt>
            <dd className="mt-0.5 text-ivory">
              <Value value={session} placeholder="—" />
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-ivory/45">Venue</dt>
            <dd className="mt-0.5 text-ivory">
              <Value value={[venue, sub].filter(Boolean).join(' · ')} placeholder="Choose a venue" />
            </dd>
          </div>
        </dl>

        {form.eventDate ? (
          <div className="mt-6">
            <EventCountdown date={form.eventDate} size="sm" />
          </div>
        ) : (
          // Same shape as the countdown, so the card doesn't look empty before a date is picked.
          <div className="mt-6" aria-hidden="true">
            <div className="flex gap-6 sm:gap-8">
              {['Days', 'Hours', 'Minutes', 'Seconds'].map((label) => (
                <div key={label}>
                  <p className="num font-display text-2xl leading-none text-ivory/20">--</p>
                  <p className="mt-1 text-xs text-ivory/30">{label}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-white/12 px-3 py-2.5 text-xs text-ivory/45">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-300" />
              Search a guest or fill in the form — the event takes shape here and the countdown starts once a date is picked.
            </p>
          </div>
        )}

        <div className="mt-auto pt-6">
          <div className="flex items-center justify-between text-xs text-ivory/55">
            <span>Details</span>
            <span className="num">
              {filled} of {checks.length}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
            <m.span
              className="block h-full origin-left rounded-full bg-linear-to-r from-brand-500 to-brand-200"
              initial={false}
              animate={{ scaleX: filled / checks.length }}
              transition={smooth}
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
