/**
 * Accessible modal dialog: overlay, Esc to close, focus moves into the dialog
 * and returns to the trigger on close. Full-screen sheet on phones.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { m } from 'motion/react';
import { Icon } from './Icon';
import { quick, spring } from '@/lib/motion';

interface ModalProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Block closing (e.g. while saving). */
  locked?: boolean;
}

const WIDTHS = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' };

export function Modal({ title, description, onClose, children, footer, size = 'md', locked = false }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ onClose, locked });

  useEffect(() => {
    latest.current = { onClose, locked };
  });

  // On open: focus inside, lock page scroll, close on Esc. On close: restore focus.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !latest.current.locked) latest.current.onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={quick}
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 backdrop-blur-[2px] sm:items-center sm:p-4"
    >
      <div className="absolute inset-0" onClick={() => !locked && onClose()} aria-hidden="true" />
      <m.div
        ref={panelRef}
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={spring}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white text-slate-900 shadow-2xl sm:rounded-2xl ${WIDTHS[size]}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-slate-900">
              {title}
            </h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <button
            type="button"
            data-close
            onClick={onClose}
            disabled={locked}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
            aria-label="Close"
          >
            <Icon name="close" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</div>}
      </m.div>
    </m.div>
  );
}
