/**
 * Renders toasts bottom-centre on phones, bottom-right on larger screens.
 */
import { useSyncExternalStore } from 'react';
import { Icon } from './Icon';
import { dismiss, toastStore } from './toast';

export function Toaster() {
  const items = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot, toastStore.getSnapshot);
  if (!items.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4 sm:items-end sm:pr-6">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white p-3.5 text-sm shadow-lg ${
            t.tone === 'error' ? 'border-rose-200 text-rose-700' : 'border-emerald-200 text-emerald-700'
          }`}
        >
          <Icon name={t.tone === 'error' ? 'alert' : 'check'} size={18} className="mt-0.5 shrink-0" />
          <span className="flex-1 text-slate-700">{t.message}</span>
          <button type="button" onClick={() => dismiss(t.id)} className="text-slate-400 hover:text-slate-600" aria-label="Dismiss">
            <Icon name="close" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
