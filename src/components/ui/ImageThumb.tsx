/**
 * Image from a private bucket via signed URL, with a neutral placeholder when
 * there is no image (or while it loads). Fixed size (or fixed aspect ratio in
 * `fill` mode) avoids layout shift.
 */
import { memo, useState } from 'react';
import { useSignedUrl, type Bucket } from '@/lib/storage';
import { Icon } from './Icon';

interface ImageThumbProps {
  bucket: Bucket;
  path: string | null | undefined;
  alt: string;
  size?: number;
  /** Full width, 4:3 — for cards. */
  fill?: boolean;
  /** Aspect ratio class in fill mode (default 4:3). */
  aspect?: string;
  className?: string;
  /** Dark placeholder for the Studio stage (instead of light grey). */
  dark?: boolean;
}

export const ImageThumb = memo(function ImageThumb({ bucket, path, alt, size = 44, fill = false, aspect = 'aspect-4/3', className = '', dark = false }: ImageThumbProps) {
  const url = useSignedUrl(bucket, path);
  const [loaded, setLoaded] = useState(false);
  const style = fill ? undefined : { width: size, height: size };
  const box = fill ? `${aspect} w-full` : '';
  if (url.data) {
    return (
      <img
        src={url.data}
        alt={alt}
        width={fill ? undefined : size}
        height={fill ? undefined : size}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        style={style}
        className={`shrink-0 ${dark ? 'bg-stage-800' : 'bg-slate-100'} object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${fill ? '' : 'rounded-lg'} ${box} ${className}`}
      />
    );
  }
  return (
    <span
      style={style}
      className={`flex shrink-0 items-center justify-center ${dark ? 'bg-linear-to-br from-stage-800 to-stage-950 text-brand-300/35' : 'bg-slate-100 text-slate-300'} ${fill ? '' : 'rounded-lg'} ${box} ${className}`}
      aria-hidden="true"
    >
      <Icon name="image" size={fill ? 36 : Math.round(size * 0.45)} />
    </span>
  );
});
