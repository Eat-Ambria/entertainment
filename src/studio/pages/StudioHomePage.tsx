/**
 * Guest Studio landing — the first screen a guest sees, art-directed like an editorial event
 * site over the full-bleed concert photo (StudioLayout → BackdropPhoto): a gold mono eyebrow, a three-line serif headline ("Entertainment." in gold
 * italic, with a slow shimmer), a gold rule, one line of copy and a gold "Start a quotation" pill on the left; on the right the FeaturedReel (performer photos from Settings, changing
 * every few seconds).
 * No packages here; those come after the guest's details.
 */
import { Link } from 'react-router-dom';
import { useContext } from 'react';
import { m, type Variants } from 'motion/react';
import { AuthContext } from '@/auth/AuthContext';
import { Icon } from '@/components/ui/Icon';
import { BRAND } from '@/lib/brand';
import { formatDate } from '@/lib/date';
import { EASE, listStagger, riseItem } from '@/lib/motion';
import { FeaturedReel } from '../FeaturedReel';
import { STUDIO_NEW_QUOTE } from '../steps';

/** Headline lines rise out from behind a mask, one after another. */
const lines: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.14, delayChildren: 0.1 } } };
const lineUp: Variants = { hidden: { y: '130%' }, show: { y: '0%', transition: { duration: 0.9, ease: EASE } } };

function Line({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`block overflow-hidden pt-[0.12em] -mt-[0.12em] pb-[0.22em] -mb-[0.14em] pr-[0.08em] ${className}`}>
      <m.span variants={lineUp} className="block">
        {children}
      </m.span>
    </span>
  );
}

export default function StudioHomePage() {
  const profile = useContext(AuthContext)?.profile;
  const business = profile?.business_name?.trim() || `${BRAND.name} ${BRAND.product}`;

  return (
    <m.section
      variants={listStagger}
      initial="hidden"
      animate="show"
      className="grid grid-cols-[minmax(0,1fr)] items-center gap-10 pt-4 pb-8 sm:gap-12 sm:py-8 lg:min-h-[calc(100svh-8.5rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,40rem)] xl:gap-12 lg:pl-10 xl:pl-20"
    >
      <div className="max-w-3xl">
        <m.p
          variants={{ hidden: { opacity: 0, letterSpacing: '0.6em' }, show: { opacity: 1, letterSpacing: '0.28em', transition: { duration: 1.1, ease: EASE } } }}
          className="font-mono text-xs uppercase text-brand-300"
        >
          {formatDate(new Date())} · {business}
        </m.p>
        <m.h1 variants={lines} className="mt-5 font-display font-normal leading-[1.02] tracking-tight text-ivory sm:mt-7">
          <Line className="text-[clamp(2rem,10.4vw,3.75rem)] sm:text-7xl xl:text-8xl">Extraordinary</Line>
          <Line className="pr-3 text-[clamp(2rem,10.4vw,3.75rem)] sm:text-7xl xl:text-8xl">
            <em className="gold-shimmer">Entertainment.</em>
          </Line>
          <Line className="mt-1 text-[clamp(1.4rem,6.6vw,2.25rem)] sm:mt-2 sm:text-5xl xl:text-6xl">Unforgettable Celebrations</Line>
        </m.h1>
        <m.span
          variants={{ hidden: { scaleX: 0 }, show: { scaleX: 1, transition: { duration: 0.8, delay: 0.5, ease: EASE } } }}
          className="mt-6 block h-0.5 w-20 origin-left bg-brand-400 sm:mt-8"
          aria-hidden="true"
        />
        <m.p variants={riseItem} className="mt-5 max-w-xl text-[15px] leading-relaxed text-ivory/75 sm:mt-8 sm:text-lg">
          From soulful live bands to electrifying DJs, celebrity performances to bespoke entertainment — craft a
          celebration that&rsquo;s uniquely yours.
        </m.p>
        <m.div variants={riseItem} className="mt-7 sm:mt-10">
          <Link
            to={STUDIO_NEW_QUOTE}
            className="btn-shine cta-pulse group relative inline-flex items-center gap-2.5 overflow-hidden rounded-full bg-brand-400 px-9 py-4 text-sm font-semibold text-stage-950 shadow-lg shadow-black/40 transition duration-150 ease-premium hover:bg-brand-300 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
          >
            Start a quotation
            <Icon name="arrowRight" size={16} className="transition-transform duration-200 ease-premium group-hover:translate-x-1" />
          </Link>
        </m.div>
      </div>

      {/* min-w-0: on phones the card must never be wider than the screen. */}
      <m.div variants={riseItem} className="min-w-0">
        <FeaturedReel paths={profile?.performer_photo_paths ?? []} />
      </m.div>
    </m.section>
  );
}
