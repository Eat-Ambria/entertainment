/**
 * Landing "Featured performances" card on the right: the performer photos from Settings, one
 * after another. Premium motion, all on transform/opacity/clip-path:
 * - enters from the right with a slight 3D turn; tilts toward the pointer with a soft glare;
 * - a gold light travels slowly around the frame;
 * - each new photo wipes in from the side it came from with a gentle zoom, and a light sweep
 *   crosses the card; caption and "01 / 05" counter rise in with it;
 * - a gold progress bar shows the time to the next photo; hovering pauses the reel.
 * Previous/next buttons and dots jump directly. Without photos the frame stays as a quiet
 * placeholder (mic medallion). Reduced motion: MotionConfig drops the movement.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, m, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { Icon } from '@/components/ui/Icon';
import { EASE } from '@/lib/motion';
import { useSignedUrl } from '@/lib/storage';

const SLIDE_MS = 5000;
const TILT = { stiffness: 140, damping: 18 };

const slide = {
  enter: (dir: number) => ({ clipPath: dir > 0 ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)', scale: 1.18, zIndex: 1 }),
  show: { clipPath: 'inset(0% 0% 0% 0%)', scale: 1.04, zIndex: 1 },
  exit: { scale: 1, opacity: 0.4, zIndex: 0 },
};

function Slide({ path, index, dir }: { path: string; index: number; dir: number }) {
  const url = useSignedUrl('brand', path);
  if (!url.data) return null;
  return (
    <m.img
      src={url.data}
      alt={`Featured performance, photo ${index + 1}`}
      custom={dir}
      variants={slide}
      initial="enter"
      animate="show"
      exit="exit"
      transition={{ clipPath: { duration: 1, ease: EASE }, scale: { duration: SLIDE_MS / 1000 + 1, ease: 'linear' }, opacity: { duration: 1 } }}
      className="absolute inset-0 h-full w-full object-cover object-center"
    />
  );
}

const arrow =
  'absolute top-1/2 z-20 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-brand-300/70 bg-stage-950/75 text-brand-300 backdrop-blur-sm transition duration-150 ease-premium hover:scale-105 hover:bg-brand-400 hover:text-stage-950 active:scale-95';

export function FeaturedReel({ paths }: { paths: string[] }) {
  const [[index, dir], setSlide] = useState<[number, number]>([0, 1]);
  const [paused, setPaused] = useState(false);
  const still = useReducedMotion() ?? false;
  const count = paths.length;
  const current = count > 0 ? index % count : 0;

  // Pointer tilt + glare.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-7, 7]), TILT);
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [6, -6]), TILT);
  const gx = useTransform(px, [-0.5, 0.5], [0, 100]);
  const gy = useTransform(py, [-0.5, 0.5], [0, 100]);
  const glare = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgb(255 240 210 / 0.16), transparent 55%)`;

  const go = (step: number) => setSlide(([i]) => [((((i % count) + step) % count) + count) % count, step]);
  const jump = (to: number) => setSlide(([i]) => [to, to >= i % count ? 1 : -1]);

  useEffect(() => {
    if (count < 2 || paused) return;
    const id = window.setTimeout(() => setSlide(([i]) => [((i % count) + 1) % count, 1]), SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [count, paused, index]);

  return (
    <m.div
      initial={{ opacity: 0, x: 60, rotateY: -14 }}
      animate={{ opacity: 1, x: 0, rotateY: 0 }}
      transition={{ duration: 0.9, delay: 0.25, ease: EASE }}
      className="mx-auto w-full max-w-xl perspective-[1400px] lg:max-w-none"
    >
      <m.div
        style={still ? undefined : { rotateX, rotateY }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          px.set((e.clientX - r.left) / r.width - 0.5);
          py.set((e.clientY - r.top) / r.height - 0.5);
        }}
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => {
          px.set(0);
          py.set(0);
          setPaused(false);
        }}
        className="relative overflow-hidden rounded-[1.9rem] bg-brand-300/25 p-0.5 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8),0_0_50px_rgb(226_183_102/0.25)]"
      >
        {/* Gold light travelling around the frame. */}
        <span
          className="absolute -inset-1/2 animate-[spin_7s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0deg,#f9edd0_40deg,#e2b766_70deg,transparent_120deg,transparent_180deg,#cf9f4c_230deg,transparent_290deg)]"
          aria-hidden="true"
        />

        <figure aria-label="Featured performances" className="relative aspect-7/5 w-full overflow-hidden rounded-[1.8rem] bg-stage-950">
          {count > 0 ? (
            <AnimatePresence initial={false} custom={dir}>
              <Slide key={paths[current]} path={paths[current]!} index={current} dir={dir} />
            </AnimatePresence>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_50%_20%,rgb(226_183_102/0.25),transparent_65%)]">
              <m.span
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="flex h-20 w-20 items-center justify-center rounded-full border border-brand-300/60 bg-stage-950/70 text-brand-300 shadow-[0_0_50px_rgb(226_183_102/0.3)]"
              >
                <Icon name="mic" size={34} />
              </m.span>
            </div>
          )}

          {/* Light sweep on every new photo. */}
          <m.span
            key={`sweep-${current}`}
            initial={{ x: '-150%' }}
            animate={{ x: '350%' }}
            transition={{ duration: 1.3, delay: 0.35, ease: EASE }}
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1/3 -skew-x-12 bg-linear-to-r from-transparent via-white/15 to-transparent"
            aria-hidden="true"
          />
          {!still && <m.span style={{ background: glare }} className="pointer-events-none absolute inset-0 z-10" aria-hidden="true" />}
          <span className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-3/5 bg-linear-to-t from-stage-950/95 via-stage-950/45 to-transparent" aria-hidden="true" />
          <span className="pointer-events-none absolute inset-x-0 top-0 z-10 h-1/4 bg-linear-to-b from-stage-950/55 to-transparent" aria-hidden="true" />

          {count > 0 && (
            <span className="absolute left-6 top-5 z-20 font-mono text-xs tracking-[0.2em] text-ivory/80">
              <span className="text-brand-300">{String(current + 1).padStart(2, '0')}</span> / {String(count).padStart(2, '0')}
            </span>
          )}

          {count > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className={`${arrow} left-4`}>
                <Icon name="arrowLeft" size={20} />
              </button>
              <button type="button" onClick={() => go(1)} aria-label="Next photo" className={`${arrow} right-4`}>
                <Icon name="arrowRight" size={20} />
              </button>
            </>
          )}

          <figcaption className="absolute inset-x-0 bottom-0 z-20 px-6 pb-12 pt-5">
            <AnimatePresence mode="wait" initial={false}>
              <m.span
                key={current}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.45, delay: 0.2, ease: EASE }}
                className="block"
              >
                <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.26em] text-brand-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-300 shadow-[0_0_8px_#ecc87f]" aria-hidden="true" />
                  Featured performance
                </span>
                <span className="mt-1.5 block font-display text-2xl text-ivory sm:text-3xl">
                  Our guests, <em className="text-brand-300">in the spotlight</em>
                </span>
              </m.span>
            </AnimatePresence>
            {count > 1 && (
              <span className="absolute bottom-[3.25rem] right-6 h-0.5 w-16 overflow-hidden rounded-full bg-ivory/20" aria-hidden="true">
                <m.span
                  key={`${current}-${paused}`}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: paused ? 0 : 1 }}
                  transition={{ duration: paused ? 0 : SLIDE_MS / 1000, ease: 'linear' }}
                  className="block h-full origin-left bg-brand-300"
                />
              </span>
            )}
          </figcaption>

          {count > 1 && (
            <div className="absolute inset-x-0 bottom-4 z-20 flex justify-center gap-2.5">
              {paths.map((p, i) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => jump(i)}
                  aria-label={`Show photo ${i + 1}`}
                  aria-current={i === current}
                  className={`h-2.5 rounded-full transition-all duration-300 ease-premium ${i === current ? 'w-7 bg-brand-300 shadow-[0_0_10px_#ecc87f]' : 'w-2.5 bg-ivory/40 hover:bg-ivory/70'}`}
                />
              ))}
            </div>
          )}
        </figure>
      </m.div>
    </m.div>
  );
}
