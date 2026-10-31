/**
 * Shared button. `loading` disables it and shows a spinner (prevents double submits).
 * `gold` / `outline-light` are the pill buttons for the dark stage (Guest Studio).
 * Every press shows a soft ripple from the press point (useRipple).
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useRipple } from '@/lib/useRipple';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold' | 'outline-light';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700 focus-visible:outline-brand-600',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-brand-600',
  ghost: 'text-slate-600 hover:bg-slate-100 focus-visible:outline-brand-600',
  danger: 'bg-rose-600 text-white shadow-sm hover:bg-rose-700 focus-visible:outline-rose-600',
  gold: '[--ripple:rgb(92_58_12/0.75)] [--ripple-ms:1300ms] rounded-full! bg-brand-400 font-semibold text-stage-950 shadow-lg shadow-black/30 hover:bg-brand-300 enabled:active:bg-brand-500 enabled:active:shadow-[0_0_0_4px_rgb(226_183_102/0.25)] duration-300! focus-visible:outline-brand-300',
  'outline-light': 'rounded-full! border border-ivory/35 text-ivory hover:border-ivory/70 hover:bg-white/5 focus-visible:outline-brand-300',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  full?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  loading = false,
  full = false,
  disabled,
  className = '',
  children,
  type = 'button',
  onPointerDown,
  ...rest
}: ButtonProps) {
  const ripple = useRipple();
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      onPointerDown={(e) => {
        ripple.onPointerDown(e);
        onPointerDown?.(e);
      }}
      className={`relative isolate overflow-hidden inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-premium enabled:active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
        VARIANTS[variant]
      } ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {ripple.ripples}
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}
