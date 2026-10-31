/**
 * App-wide PWA UI: "new version available" toast (service worker update) and
 * an offline banner. The app needs the network for data, so we never claim offline support.
 */
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Icon } from '@/components/ui/Icon';
import { useOnline } from './hooks';

const CHECK_FOR_UPDATES_MS = 60 * 60 * 1000;

export function PwaStatus() {
  const online = useOnline();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), CHECK_FOR_UPDATES_MS);
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
        <div role="status" className="fixed bottom-4 right-4 z-[70] flex max-w-sm items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <p className="text-sm text-slate-700">A new version of the app is available.</p>
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
            className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            className="shrink-0 text-sm text-slate-500 hover:text-slate-700"
          >
            Later
          </button>
        </div>
      )}
    </>
  );
}
