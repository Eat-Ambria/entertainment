/**
 * Guest Studio step 2 — choose one or more packages. Shows EVERY active package (never
 * filtered by the guest's function) as large cards, 12 at a time with "Show more".
 * Packages tagged with the guest's function are shown first, the rest under "Other packages".
 * Clicking a selected package removes it straight away — no confirmation.
 * Layout matches the Guest step: cards on a dark panel on the left, "Your selection" (chosen
 * packages + Back / Continue) on the right at the same height.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/auth/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchPackageLines, useActivePackages, type StudioPackage, type StudioPackageLine } from '@/data/studioCatalog';
import { linesFromPackage } from '../lines';
import { useEventOptions } from '@/data/eventOptions';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ImageThumb } from '@/components/ui/ImageThumb';
import { Spinner } from '@/components/ui/Spinner';
import { FormAlert } from '@/components/ui/FormAlert';
import { EmptyState } from '@/components/ui/EmptyState';
import { useQuoteDraft } from '../quoteDraft';
import { StepHeading } from '../StepHeading';
import { GuestSummary } from '../GuestSummary';
import { SIDE_STICKY } from '../steps';
import { AnimatePresence, m } from 'motion/react';
import { listStagger, riseItem, spring } from '@/lib/motion';

interface Props {
  onBack: () => void;
  onDone: () => void;
}

const GRID = 'grid gap-2 sm:gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';

export function PackageStep({ onBack, onDone }: Props) {
  const { session } = useAuth();
  const [draft, updateDraft] = useQuoteDraft(session?.user.id ?? 'anon');
  const qc = useQueryClient();

  // Warm up Customise while packages are being picked: lines and element images.
  const pickedIds = draft.packages.map((b) => b.id).join(',');
  useEffect(() => {
    if (pickedIds) prefetchPackageLines(qc, pickedIds.split(','));
  }, [pickedIds, qc]);

  // Seed lines that are already loaded before leaving, so Customise shows them on its first frame.
  function goNext() {
    updateDraft((d) => ({
      ...d,
      packages: d.packages.map((b) => {
        if (b.lines !== null) return b;
        const cached = qc.getQueryData<StudioPackageLine[]>(['studio', 'package-lines', b.id]);
        return cached ? { ...b, lines: linesFromPackage(cached) } : b;
      }),
    }));
    onDone();
  }
  const options = useEventOptions();
  const functionId = draft.guest?.functionId || null;
  const fnName = options.data?.functions.find((f) => f.id === functionId)?.name ?? 'this function';
  const packages = useActivePackages(functionId);
  const selected = new Set(draft.packages.map((b) => b.id));

  function toggle(p: StudioPackage) {
    updateDraft((d) =>
      d.packages.some((b) => b.id === p.id)
        ? { ...d, packages: d.packages.filter((b) => b.id !== p.id) }
        : { ...d, packages: [...d.packages, { id: p.id, name: p.name, tier: p.tier_name, lines: null }] },
    );
  }

  const wide = useWide();
  const actions = (
    <>
      <Button variant="outline-light" onClick={onBack}>
        <Icon name="arrowLeft" size={18} /> Back
      </Button>
      <Button variant="gold" full onClick={goNext} disabled={selected.size === 0}>
        Continue <Icon name="arrowRight" size={18} />
      </Button>
    </>
  );

  const rows = packages.data?.pages.flatMap((pg) => pg.rows) ?? [];
  // The guest's function first; everything else below (nothing is hidden).
  const forFunction = rows.filter((r) => r.for_function);
  const others = rows.filter((r) => !r.for_function);

  function card(p: StudioPackage) {
    const isSelected = selected.has(p.id);
    return (
      <m.div
        key={p.id}
        variants={riseItem}
        whileHover={{ y: -3, transition: spring }}
        whileTap={{ scale: 0.985, transition: spring }}
        className={`group relative flex flex-row items-stretch overflow-hidden rounded-xl border text-left sm:flex-col transition-[background-color,border-color,box-shadow] duration-300 ease-premium ${
          isSelected
            ? 'border-brand-400/70 bg-brand-500/12 ring-2 ring-brand-400 shadow-lg shadow-brand-500/20'
            : `${p.for_function ? 'border-brand-300/35' : 'border-white/10'} bg-stage-950/50 hover:border-brand-300/50 hover:bg-white/5 hover:shadow-lg hover:shadow-brand-500/10`
        }`}
      >
        <button
          type="button"
          role="checkbox"
          aria-checked={isSelected}
          aria-label={`${p.name}, ${p.tier_name}`}
          onClick={() => toggle(p)}
          className="flex min-w-0 flex-1 flex-row items-center gap-3 p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300 sm:flex-col sm:items-stretch sm:gap-0 sm:p-0"
        >
          {/* Phones: a small round photo with the name beside it. Larger screens: the full card. */}
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full ring-1 ring-brand-300/40 sm:h-auto sm:w-auto sm:rounded-none sm:ring-0">
            <ImageThumb
              bucket="package-images"
              path={p.image_path}
              alt=""
              fill
              dark
              aspect="aspect-square sm:aspect-16/10"
              className="transition-transform duration-500 ease-premium group-hover:scale-[1.04]"
            />
            <span className="pointer-events-none absolute inset-0 hidden bg-linear-to-t from-stage-950/95 via-stage-950/20 to-transparent sm:block" />
            <span className="absolute left-3 top-3 hidden items-center sm:flex gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-ivory ring-1 ring-white/20">
              {p.tier_name}
            </span>
            {p.for_function && (
              <span className="absolute bottom-11 left-3 hidden rounded-full bg-brand-400 sm:inline px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-stage-950 shadow-md shadow-black/30">
                Recommended
              </span>
            )}
            <AnimatePresence initial={false}>
              {isSelected && (
                <m.span
                  key="check"
                  initial={{ scale: 0.4, opacity: 0, rotate: -20 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0, transition: spring }}
                  exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.15 } }}
                  className="absolute right-3 top-3 hidden h-7 w-7 items-center justify-center rounded-full bg-brand-400 text-stage-950 shadow-lg shadow-black/40 sm:flex"
                >
                  <Icon name="check" size={16} />
                </m.span>
              )}
            </AnimatePresence>
            <h3 className="absolute inset-x-4 bottom-3 hidden truncate font-display text-lg font-semibold leading-snug text-ivory drop-shadow sm:block">{p.name}</h3>
          </div>
          {/* Phone row: name, tier (+ Recommended), and a round tick on the right. */}
          <div className="min-w-0 flex-1 sm:hidden">
            <p className="truncate font-display text-base font-semibold text-ivory">{p.name}</p>
            <p className="mt-0.5 flex items-center gap-2 text-xs text-ivory/55">
              {p.tier_name}
              {p.for_function && <span className="rounded-full bg-brand-400 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-stage-950">Recommended</span>}
            </p>
          </div>
          {/* Right column: the tick on top, room for the video icon (laid over it) below. */}
          <span aria-hidden="true" className={`flex shrink-0 flex-col items-center gap-2 self-stretch sm:hidden ${p.video_url ? 'justify-between' : 'justify-center'}`}>
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-200 ${isSelected ? 'bg-brand-400 text-stage-950' : 'ring-1 ring-white/25'}`}
            >
              {isSelected && <Icon name="check" size={16} />}
            </span>
            {p.video_url && <span className="h-7 w-7" />}
          </span>
          <div className="hidden flex-1 flex-col gap-2 px-4 py-3 sm:flex">
            {p.description && <p className="line-clamp-2 text-sm text-ivory/65">{p.description}</p>}
            <span className={`mt-auto text-xs font-semibold uppercase tracking-wider ${isSelected ? 'text-brand-300' : 'text-ivory/40'}`}>
              {isSelected ? 'Selected — tap to remove' : 'Tap to select'}
            </span>
          </div>
        </button>
        {p.video_url && (
          <a
            href={p.video_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Watch video of ${p.name}`}
            className="absolute right-3 bottom-3 z-10 flex h-7 w-7 items-center justify-center gap-1.5 rounded-full text-sm font-medium text-brand-300 ring-1 ring-brand-300/40 transition-colors duration-200 hover:bg-white/5 hover:text-brand-200 sm:static sm:h-auto sm:w-auto sm:justify-start sm:rounded-none sm:border-t sm:border-white/10 sm:px-4 sm:py-2.5 sm:ring-0"
          >
            <Icon name="present" size={15} /> <span className="hidden sm:inline">Watch video</span>
          </a>
        )}
      </m.div>
    );
  }

  return (
    // pb: room for the pinned Back / Continue bar on phones and tablets.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 pb-20 lg:grid-cols-[minmax(0,1fr)_22rem] lg:pb-0 xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="min-w-0 space-y-4">
      <StepHeading step="package" />
      <section aria-label="Packages" className="space-y-5 rounded-2xl border border-brand-300/25 bg-stage-900/80 p-3 text-ivory sm:space-y-6 sm:p-5 shadow-2xl shadow-black/50">
      {packages.isLoading ? (
        <Spinner label="Loading packages…" />
      ) : packages.isError ? (
        <div className="space-y-3">
          <FormAlert>We couldn't load the packages. Please try again.</FormAlert>
          <Button variant="secondary" onClick={() => void packages.refetch()}>
            Try again
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon="packages" title="No packages available yet" description="Packages will appear here once they're set up." />
      ) : (
        <>
          {forFunction.length > 0 ? (
            <>
              <section className="space-y-3">
                <SectionTitle gold label={`For ${fnName}`} count={forFunction.length} />
                <m.div role="group" aria-label={`Packages for ${fnName}`} variants={listStagger} initial="hidden" animate="show" className={GRID}>
                  {forFunction.map(card)}
                </m.div>
              </section>
              {others.length > 0 && (
                <section className="space-y-3 pt-2">
                  <SectionTitle label="Other packages" count={others.length} />
                  <m.div role="group" aria-label="Other packages" variants={listStagger} initial="hidden" animate="show" className={GRID}>
                    {others.map(card)}
                  </m.div>
                </section>
              )}
            </>
          ) : (
            <m.div role="group" aria-label="Packages" variants={listStagger} initial="hidden" animate="show" className={GRID}>
              {rows.map(card)}
            </m.div>
          )}
          {packages.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="outline-light" loading={packages.isFetchingNextPage} onClick={() => void packages.fetchNextPage()}>
                Show more packages
              </Button>
            </div>
          )}
        </>
      )}

      </section>
      </div>

      <div className={`space-y-4 ${SIDE_STICKY}`}>
      <GuestSummary />
      <aside aria-label="Your selection" className="flex flex-col rounded-2xl border border-brand-300/25 bg-stage-900/80 p-5 text-ivory shadow-2xl shadow-black/50">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-brand-300">Your selection</p>
        <p className="mt-2 font-display text-2xl leading-tight text-ivory" aria-live="polite">
          {selected.size === 0 ? 'No package yet' : `${selected.size} ${selected.size === 1 ? 'package' : 'packages'} selected`}
        </p>
        <div className="gold-hairline my-4" />
        <div className="max-h-[min(22rem,calc(100dvh-26rem))] min-h-[8.5rem] overflow-x-hidden overflow-y-auto pr-1 scheme-dark [scrollbar-width:thin]">
          {draft.packages.length === 0 ? (
            <p className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-4 py-8 text-center text-sm text-ivory/50">
              <Icon name="packages" size={22} className="text-brand-300/60" />
              Tap a package to add it to the quotation.
            </p>
          ) : (
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {draft.packages.map((b, i) => (
                  <m.li
                    key={b.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0, transition: spring }}
                    exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15 } }}
                    className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/4 px-3 py-2.5"
                  >
                    <span className="num flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-400 text-xs font-semibold text-stage-950">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ivory">{b.name}</span>
                      <span className="block text-xs text-ivory/50">{b.tier}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => updateDraft((d) => ({ ...d, packages: d.packages.filter((x) => x.id !== b.id) }))}
                      aria-label={`Remove ${b.name}`}
                      className="rounded-full p-1.5 text-ivory/45 transition-colors duration-150 hover:bg-white/10 hover:text-ivory"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
        <p className="mt-4 text-xs text-ivory/45">You can add or remove elements in the next step.</p>
        {wide ? (
          <div className="mt-3 flex gap-2">{actions}</div>
        ) : (
          // Phones / tablets: Back + Continue stay pinned to the bottom of the screen while scrolling
          // (rendered into <body>, so the step's slide-in can't move it).
          createPortal(
            <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-brand-300/20 bg-stage-950/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_30px_rgb(0_0_0/0.5)] backdrop-blur-md">
              {actions}
            </div>,
            document.body,
          )
        )}
      </aside>
      </div>
    </div>
  );
}

/** Large screens (lg+) show the actions in the side panel; smaller ones pin them to the bottom. */
function useWide() {
  const query = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => window.matchMedia?.(query).matches ?? true);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = () => setWide(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return wide;
}

function SectionTitle({ label, count, gold = false }: { label: string; count: number; gold?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <h2 className={`font-mono text-xs uppercase tracking-[0.22em] ${gold ? 'text-brand-300' : 'text-ivory/55'}`}>{label}</h2>
      <span className="num rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-ivory/60">{count}</span>
      <span className="h-px flex-1 bg-linear-to-r from-brand-300/30 to-transparent" />
    </div>
  );
}
