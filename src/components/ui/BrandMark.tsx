/**
 * Brand logo + name. Uses the signed-in user's business profile (name, logo) when set,
 * otherwise the fallback in lib/brand.ts. Without an uploaded logo it shows the Ambria emblem
 * (`public/logo-mark.webp`, cut from `public/logo new.png`) as a round mark.
 * Shared by the workspace sidebar, Guest Studio header, login screens and the quote.
 */
import { useContext } from 'react';
import { AuthContext } from '@/auth/AuthContext';
import { BRAND } from '@/lib/brand';
import { useSignedUrl } from '@/lib/storage';
import { asset } from '@/lib/asset';

interface BrandMarkProps {
  subtitle?: string;
  size?: 'sm' | 'lg';
  tone?: 'light' | 'dark';
}

const DEFAULT_MARK = asset('logo-mark.webp');

export function BrandMark({ subtitle = BRAND.tagline, size = 'sm', tone = 'light' }: BrandMarkProps) {
  const profile = useContext(AuthContext)?.profile ?? null;
  const logo = useSignedUrl('brand', profile?.logo_path);
  const name = profile?.business_name?.trim() || `${BRAND.name} ${BRAND.product}`;
  const lg = size === 'lg';
  const box = lg ? 'h-12 w-12' : 'h-9 w-9';
  const dark = tone === 'dark';

  return (
    <div className="flex min-w-0 items-center gap-3">
      {logo.data ? (
        <img src={logo.data} alt="" className={`${box} shrink-0 rounded-full bg-white object-contain ring-1 ring-brand-300/60`} />
      ) : (
        <img src={DEFAULT_MARK} alt="" className={`${box} shrink-0 rounded-full bg-black object-cover ring-1 ring-brand-300/40 drop-shadow-[0_2px_10px_rgb(226_183_102/0.35)]`} />
      )}
      <div className="min-w-0 leading-tight">
        <p className={`truncate font-display ${dark ? 'brand-glow' : 'text-slate-900'} ${lg ? 'text-xl' : 'text-base'}`}>{name}</p>
        <p
          className={`mt-0.5 truncate font-mono uppercase tracking-[0.2em] ${dark ? 'text-brand-300' : 'text-brand-700'} ${lg ? 'text-[11px]' : 'text-[10px]'}`}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}
