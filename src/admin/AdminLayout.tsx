/**
 * My Workspace shell (internal): sidebar + top bar + routed page content.
 * Lazy pages load inside Suspense. Every page uses the dashboard look: the user's artwork
 * (public/dashboard image.png → public/dashboard-bg.webp, dark stage top, cream below) behind a
 * light page title, and frosted cream cards (`.ws-theme` in index.css).
 */
import { Suspense, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { navItemFor } from './nav';
import { NotificationsMenu } from './notifications/NotificationsMenu';
import { asset } from '@/lib/asset';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { UserMenu } from '@/components/ui/UserMenu';
import { Toaster } from '@/components/ui/Toaster';
import { m } from 'motion/react';
import { MotionProvider } from '@/components/ui/MotionProvider';
import { quick } from '@/lib/motion';
import { useGlobalRipple } from '@/lib/useGlobalRipple';

export function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const current = navItemFor(pathname);

  // Every link, button and tab in the Workspace gets a press ripple.
  const rootRef = useRef<HTMLDivElement>(null);
  useGlobalRipple(rootRef);
  return (
    <MotionProvider>
    {/* Pinned to the viewport: only <main> scrolls, so the page itself can never scroll or shift. */}
    <div ref={rootRef} className="ws-theme fixed inset-0 flex overflow-hidden bg-cream-100">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="relative isolate flex min-w-0 flex-1 flex-col">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <img src={asset('dashboard-bg.webp')} alt="" className="h-full w-full object-cover object-top" />
        </div>
        <header
          className="relative z-20 flex h-16 shrink-0 items-center gap-3 border-b border-white/40 bg-linear-to-r from-cream-50 via-cream-50/85 to-cream-50/0 px-4 sm:px-6 lg:px-8"
        >
          <button
            type="button"
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Icon name="menu" />
          </button>
          <p className="flex min-w-0 items-center gap-2.5 truncate text-base font-medium text-slate-800">
            {/* Phones: just the page name (no icon). */}
            {current && <Icon name={current.icon} size={20} className="hidden shrink-0 text-slate-600 sm:block" />}
            {current?.label ?? ''}
          </p>
          <div className="flex-1" />
          <NotificationsMenu />
          <UserMenu tone="dark" />
        </header>
        <main className="flex-1 overflow-y-auto">
          {/* Re-keyed per page so each screen fades in (same motion system as the Guest Studio). */}
          <m.div
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={quick}
            className="mx-auto w-full max-w-[110rem] px-4 py-6 sm:px-6 sm:py-8"
          >
            <Suspense fallback={<Spinner full />}>
              <Outlet />
            </Suspense>
          </m.div>
        </main>
      </div>
      <Toaster />
    </div>
    </MotionProvider>
  );
}
