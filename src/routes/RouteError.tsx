/**
 * Friendly error screen for the router (instead of React Router's developer message). A missing
 * chunk after a new deploy reloads the page once (see lib/lazyPage); anything else offers Reload
 * and a way home.
 */
import { useEffect } from 'react';
import { useRouteError } from 'react-router-dom';
import { isChunkLoadError, reloadForNewVersion } from '@/lib/lazyPage';
import { Icon } from '@/components/ui/Icon';

export function RouteError() {
  const error = useRouteError();
  const newVersion = isChunkLoadError(error);

  useEffect(() => {
    if (newVersion) reloadForNewVersion();
  }, [newVersion]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-stage-950 px-6 text-center text-ivory">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-400/15 text-brand-300 ring-1 ring-brand-300/40">
        <Icon name={newVersion ? 'sparkles' : 'alert'} size={26} />
      </span>
      <h1 className="font-display text-3xl">{newVersion ? 'A new version is ready' : 'Something went wrong'}</h1>
      <p className="max-w-md text-sm text-ivory/65">
        {newVersion ? 'The app was just updated. Reload to continue — your quote draft is kept.' : 'Please reload the page. If it keeps happening, go back to the start.'}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-brand-400 px-5 py-2.5 text-sm font-semibold text-stage-950 transition-colors duration-150 hover:bg-brand-300"
        >
          Reload
        </button>
        <a href={import.meta.env.BASE_URL} className="rounded-full border border-ivory/35 px-5 py-2.5 text-sm font-medium text-ivory hover:bg-white/5">
          Go to start
        </a>
      </div>
    </div>
  );
}
