/**
 * Guest Studio shell (client-facing): the dark "stage" (see the entertainment-presentation-ui
 * skill), glass header with the business brand, no sidebar, no internal data.
 * Code under src/studio must not import from src/admin (enforced by ESLint).
 */
import { Suspense, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/ui/Toaster';
import { BrandMark } from '@/components/ui/BrandMark';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { MotionProvider } from '@/components/ui/MotionProvider';
import { StageLights } from '@/components/ui/StageLights';
import { BackdropPhoto } from './BackdropPhoto';
import { Embers } from './Embers';

export function StudioLayout() {
  const { pathname } = useLocation();
  const landing = pathname === '/studio';
  // The Studio is shown to guests: the page still scrolls, but without a visible scrollbar.
  useEffect(() => {
    document.documentElement.classList.add('no-scrollbar');
    return () => document.documentElement.classList.remove('no-scrollbar');
  }, []);
  return (
    <MotionProvider>
    <div className="stage-bg relative isolate flex min-h-dvh flex-col overflow-x-clip text-ivory">
      {!landing && <StageLights />}
      <BackdropPhoto
        path={null} /* always the built-in concert photo (the Settings upload was removed) */
        strength={landing ? 1 : 0.14}
      />
      {landing && <Embers />}
      <header className="sticky top-0 z-20 overflow-hidden border-b border-brand-300/15 bg-stage-950/80 backdrop-blur-md">
        <span className="gold-hairline pointer-events-none absolute inset-x-0 bottom-0" aria-hidden="true" />
        <div className="relative mx-auto flex h-18 w-full items-center justify-between px-[clamp(1rem,2.2vw,4rem)]">
          <div className="relative">
            {/* Spotlights from both sides sweeping over the logo and name, like the brand banner. */}
            <span className="header-spot header-spot-left -left-6" aria-hidden="true" />
            <span className="header-spot header-spot-right -right-6" aria-hidden="true" />
            <div className="relative">
              <BrandMark size="lg" tone="dark" subtitle={null} />
            </div>
          </div>
          <div className="flex items-center gap-2">
          {/* Studio home (the landing page). */}
          {!landing && (
            <Link
              to="/studio"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-ivory/85 transition duration-200 ease-premium hover:bg-white/5 hover:text-ivory"
            >
              <Icon name="home" size={16} className="shrink-0" />
              <span className="hidden leading-none sm:inline">Home</span>
            </Link>
          )}
          {/* Way back to the staff workspace. */}
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-ivory/85 transition duration-200 ease-premium hover:bg-white/5 hover:text-ivory"
          >
            <Icon name="team" size={16} />
            <span className="hidden leading-none sm:inline">My workspace</span>
          </Link>
          </div>
        </div>
      </header>
      <main className="relative flex-1">
        <div className="w-full px-[clamp(1rem,2.2vw,4rem)] py-6 sm:py-8">
          <Suspense fallback={<Spinner full />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      <Toaster />
    </div>
    </MotionProvider>
  );
}
