/**
 * The cinematic header above the quotation on the stage: quote number eyebrow, the guest's
 * name, the event line, a live countdown and the total in gold (re-keyed so a new total
 * glides in). Reads only the guest-safe document data.
 */
import { m } from 'motion/react';
import { GoldDust } from '@/components/ui/GoldDust';
import { formatINR } from '@/lib/money';
import { formatDate } from '@/lib/date';
import { listStagger, riseItem, quick } from '@/lib/motion';
import { EventCountdown } from '../EventCountdown';
import type { QuoteDocumentData } from './documentData';

export function QuotationHero({ data }: { data: QuoteDocumentData }) {
  const eventLine = [data.functionName, data.eventDate && formatDate(data.eventDate), data.sessionName, data.venueName]
    .filter(Boolean)
    .join(' · ');
  return (
    <m.section
      aria-label="Quotation summary"
      variants={listStagger}
      initial="hidden"
      animate="show"
      className="relative overflow-hidden rounded-2xl border border-brand-300/20 bg-stage-900/70 px-5 py-6 shadow-2xl shadow-black/40 sm:px-8"
    >
      <GoldDust />
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_10%,rgb(226_183_102/0.18),transparent_50%)]" />
      <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <m.p variants={riseItem} className="font-mono text-xs uppercase tracking-[0.2em] text-brand-300">
            Quotation · {data.quoteNo ?? 'Draft'}
          </m.p>
          <m.p variants={riseItem} className="mt-3 font-display text-4xl leading-none uppercase text-ivory [overflow-wrap:anywhere] sm:text-5xl">
            {data.guestName || 'Your celebration'}
          </m.p>
          {eventLine && (
            <m.p variants={riseItem} className="mt-3 text-sm text-ivory/65">
              {eventLine}
            </m.p>
          )}
          {data.eventDate && (
            <m.div variants={riseItem} className="mt-5">
              <EventCountdown date={data.eventDate} size="sm" />
            </m.div>
          )}
        </div>
        <m.div variants={riseItem} className="lg:text-right">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-ivory/50">Total</p>
          <p className="num mt-1 font-display text-4xl text-brand-300 sm:text-5xl">
            <m.span key={data.total} initial={{ opacity: 0.35, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={quick} className="inline-block">
              {formatINR(data.total)}
            </m.span>
          </p>
          <p className="mt-1 text-xs text-ivory/45">All amounts in Indian Rupees</p>
        </m.div>
      </div>
    </m.section>
  );
}
