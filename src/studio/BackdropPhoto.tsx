/**
 * Full-bleed photo behind the Guest Studio: the background photo from Settings, else the
 * built-in concert shot (`public/concert-bg.webp`, optimised from `public/background1.png`).
 * Toned down a little (brightness 80 %, slight contrast/saturation) on the landing, with only a
 * light dark wash on the left for the headline; faint on the working steps. Shown as it is — no
 * zoom. Decorative only.
 */
import { m } from 'motion/react';
import { asset } from '@/lib/asset';
import { useSignedUrl } from '@/lib/storage';

const DEFAULT_PHOTO = asset('concert-bg.webp');

export function BackdropPhoto({ path, strength }: { path: string | null | undefined; strength: number }) {
  const own = useSignedUrl('brand', path);
  const src = path ? own.data : DEFAULT_PHOTO;
  if (!src) return null;
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <m.img
        key={src}
        src={src}
        alt=""
        initial={{ opacity: 0 }}
        animate={{ opacity: strength }}
        transition={{ duration: 1.2 }}
        className="absolute inset-0 h-full w-full object-cover object-center brightness-80 contrast-105 saturate-110"
      />
      {/* A light dark wash on the left edge for the headline (as in the user's demo); the rest stays vivid. */}
      <span className="absolute inset-0 bg-linear-to-r from-stage-950/85 via-stage-950/50 via-30% to-stage-950/15 to-60%" />
      <span className="absolute inset-0 bg-linear-to-t from-stage-950/60 via-transparent via-30% to-transparent" />
    </div>
  );
}
