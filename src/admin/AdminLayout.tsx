/**
 * My Workspace shell (internal): sidebar + top bar + routed page content.
 * Lazy pages load inside Suspense.
 */
import { Suspense, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { navItemFor } from './nav';
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
    <div ref={rootRef} className="fixed inset-0 flex overflow-hidden bg-slate-50">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button
            type="button"
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Icon name="menu" />
          </button>
          <p className="truncate text-sm font-medium text-slate-500">{current?.label ?? ''}</p>
          <div className="flex-1" />
          <UserMenu />
        </header>
        <main className="flex-1 overflow-y-auto">
          {/* Re-keyed per page so each screen fades in (same motion system as the Guest Studio). */}
          <m.div
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={quick}
            className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8"
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
