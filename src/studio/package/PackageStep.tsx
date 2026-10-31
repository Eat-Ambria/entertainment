/**
 * Guest Studio step 2 — choose one or more packages. Shows EVERY active package (never
 * filtered by the guest's function) as large cards, 12 at a time with "Show more".
 * Packages tagged with the guest's function are shown first, the rest under "Other packages".
 * Clicking a selected package removes it straight away — no confirmation.
 * Layout matches the Guest step: cards on a dark panel on the left, "Your selection" (chosen
 * packages + Back / Continue) on the right at the same height.
 */
import { useAuth } from '@/auth/AuthContext';
import { useActivePackages, type StudioPackage } from '@/data/studioCatalog';
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

const GRID = 'grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';

export function PackageStep({ onBack, onDone }: Props) {
  const { session } = useAuth();
  const [draft, updateDraft] = useQuoteDraft(session?.user.id ?? 'anon');
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
        className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition-[background-color,border-color,box-shadow] duration-300 ease-premium ${
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
          className="flex flex-1 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300"
        >
          <div className="relative overflow-hidden">
            <ImageThumb
              bucket="package-images"
              path={p.image_path}
              alt=""
              fill
              dark
              aspect="aspect-16/10"
              className="transition-transform duration-500 ease-premium group-hover:scale-[1.04]"
            />
            <span className="pointer-events-none absolute inset-0 bg-linear-to-t from-stage-950/95 via-stage-950/20 to-transparent" />
            <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-ivory ring-1 ring-white/20">
              {p.tier_name}
            </span>
            {p.for_function && (
              <span className="absolute bottom-11 left-3 rounded-full bg-brand-400 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-stage-950 shadow-md shadow-black/30">
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
                  className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-brand-400 text-stage-950 shadow-lg shadow-black/40"
                >
                  <Icon name="check" size={16} />
                </m.span>
              )}
            </AnimatePresence>
            <h3 className="absolute inset-x-4 bottom-3 truncate font-display text-lg font-semibold leading-snug text-ivory drop-shadow">{p.name}</h3>
          </div>
          <div className="flex flex-1 flex-col gap-2 px-4 py-3">
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
            className="flex items-center gap-1.5 border-t border-white/10 px-4 py-2.5 text-sm font-medium text-brand-300 transition-colors duration-200 hover:bg-white/5 hover:text-brand-200"
          >
            <Icon name="present" size={16} /> Watch video
          </a>
        )}
      </m.div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="min-w-0 space-y-4">
      <StepHeading step="package" />
      <section aria-label="Packages" className="space-y-6 rounded-2xl border border-brand-300/25 bg-stage-900/80 p-5 text-ivory shadow-2xl shadow-black/50">
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
        <div className="mt-3 flex gap-2">
          <Button variant="outline-light" onClick={onBack}>
            <Icon name="arrowLeft" size={18} /> Back
          </Button>
          <Button variant="gold" full onClick={onDone} disabled={selected.size === 0}>
            Continue <Icon name="arrowRight" size={18} />
          </Button>
        </div>
      </aside>
      </div>
    </div>
  );
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
