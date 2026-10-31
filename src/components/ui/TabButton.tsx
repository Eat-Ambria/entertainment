/**
 * Segmented-control tab (Workspace pages: Elements, Packages, Rate History) with a gold press
 * ripple. Selected = white pill on the grey track.
 */
import type { ReactNode } from 'react';
import { useRipple } from '@/lib/useRipple';

interface TabButtonProps {
  selected: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}

export function TabButton({ selected, onClick, className = '', children }: TabButtonProps) {
  const ripple = useRipple();
  return (
    <button
      data-own-ripple
      role="tab"
      type="button"
      aria-selected={selected}
      onClick={onClick}
      onPointerDown={ripple.onPointerDown}
      className={`relative isolate overflow-hidden rounded-md px-3 py-1.5 font-medium transition-colors duration-200 ease-premium [--ripple:var(--color-brand-400)] ${
        selected ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
      } ${className}`}
    >
      {ripple.ripples}
      {children}
    </button>
  );
}
