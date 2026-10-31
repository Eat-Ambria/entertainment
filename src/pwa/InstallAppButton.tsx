/**
 * "Install app" control. Uses the native prompt where available (Android, desktop
 * Chrome/Edge); on iPhone/iPad shows the Share -> Add to Home Screen steps.
 * Renders nothing once installed or when the browser can't install.
 */
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { usePwaInstall } from './hooks';
import { promptInstall } from './installPrompt';

export function InstallAppButton({
  className = '',
  onDone,
  role,
}: {
  className?: string;
  onDone?: () => void;
  role?: string;
}) {
  const { canPrompt, installed, isIos } = usePwaInstall();
  const [showIosHelp, setShowIosHelp] = useState(false);

  if (installed || (!canPrompt && !isIos)) return null;

  return (
    <>
      <button
        type="button"
        role={role}
        className={className}
        onClick={async () => {
          if (canPrompt) {
            await promptInstall();
            onDone?.();
          } else {
            setShowIosHelp(true);
          }
        }}
      >
        <Icon name="download" size={16} /> Install app
      </button>
      {showIosHelp && (
        <div role="dialog" aria-modal="true" aria-labelledby="ios-install-title" className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="ios-install-title" className="font-semibold text-slate-900">
              Install on iPhone / iPad
            </h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
              <li>Open this page in Safari.</li>
              <li>
                Tap the <strong>Share</strong> button.
              </li>
              <li>
                Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
              </li>
            </ol>
            <button
              type="button"
              onClick={() => {
                setShowIosHelp(false);
                onDone?.();
              }}
              className="mt-5 w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
