/**
 * App-wide PWA UI: "new version available" prompt (service worker update) and
 * an offline banner. The app needs the network for data, so we never claim offline support.
 * Updates are looked for every few minutes and whenever the tab comes back into view, so
 * people are offered a new deploy quickly; "Reload" switches to it (drafts are kept).
 */
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Icon } from '@/components/ui/Icon';
import { useOnline } from './hooks';

const CHECK_FOR_UPDATES_MS = 5 * 60 * 1000;

export function PwaStatus() {
  const online = useOnline();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => void registration.update().catch(() => undefined);
      setInterval(check, CHECK_FOR_UPDATES_MS);
      // Coming back to the tab (or the installed app) checks straight away.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('focus', check);
    },
  });

  return (
    <>
      {!online && (
        <div role="status" className="fixed inset-x-0 top-0 z-[70] flex items-center justify-center gap-2 bg-slate-900 px-4 py-2 text-sm text-white">
          <Icon name="alert" size={16} />
          You're offline. Changes can't be saved until you reconnect.
        </div>
      )}
      {needRefresh && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[70] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 animate-rise items-center gap-3 rounded-2xl bg-linear-to-br from-[#2e2214] to-[#17110b] p-4 text-ivory shadow-2xl shadow-black/40 ring-1 ring-brand-400/40"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-400/15 text-brand-300 ring-1 ring-brand-300/40">
            <Icon name="sparkles" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">A new version of the app is available.</p>
            <p className="text-xs text-ivory/65">Update to get the latest changes — your work is kept.</p>
          </div>
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
            className="shrink-0 rounded-xl bg-linear-to-b from-brand-300 to-brand-400 px-3.5 py-2 text-sm font-semibold text-stage-950 transition duration-150 hover:brightness-105"
          >
            Reload
          </button>
          <button type="button" onClick={() => setNeedRefresh(false)} className="shrink-0 text-sm text-ivory/60 hover:text-ivory">
            Later
          </button>
        </div>
      )}
    </>
  );
}
