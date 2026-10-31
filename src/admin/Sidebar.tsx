/**
 * My Workspace sidebar, grouped by section, with a shortcut into the Guest Studio.
 * Fixed on desktop, slide-in drawer on mobile/tablet.
 */
import { Link, NavLink } from 'react-router-dom';
import { ADMIN_ROOT, NAV_ITEMS, NAV_SECTIONS } from './nav';
import { Icon } from '@/components/ui/Icon';
import { BrandMark } from '@/components/ui/BrandMark';
import { STUDIO_ROOT } from '@/studio/steps';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={`stage-bg fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/10 text-ivory transition-transform duration-200 ease-premium lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <BrandMark subtitle="My Workspace" tone="dark" />
          <button
            type="button"
            className="rounded-md p-1 text-ivory/60 hover:bg-white/10 lg:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            <Icon name="close" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
          {NAV_SECTIONS.map((section) => (
            <div key={section.key} className="mt-5 first:mt-2">
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-ivory/35">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {NAV_ITEMS.filter((n) => n.section === section.key).map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === ADMIN_ROOT}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 overflow-hidden rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ease-premium ${
                        isActive ? 'bg-brand-500/20 text-ivory shadow-[inset_3px_0_0_var(--color-brand-400)]' : 'text-ivory/65 hover:text-ivory'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* Hover: a soft gold wash sweeps in from the left and a gold edge grows. */}
                        {!isActive && (
                          <>
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-0 origin-left scale-x-0 rounded-lg bg-linear-to-r from-brand-400/20 via-brand-400/8 to-transparent transition-transform duration-300 ease-premium group-hover:scale-x-100"
                            />
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute top-1/2 left-0 h-0 w-0.75 -translate-y-1/2 rounded-full bg-brand-400 transition-[height] duration-300 ease-premium group-hover:h-5"
                            />
                          </>
                        )}
                        <Icon
                          name={item.icon}
                          size={18}
                          className={`relative transition-[color,transform] duration-300 ease-premium group-hover:scale-110 ${isActive ? 'text-brand-300' : 'group-hover:text-brand-300'}`}
                        />
                        <span className="relative transition-transform duration-300 ease-premium group-hover:translate-x-1">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          <Link
            to={STUDIO_ROOT}
            className="group flex items-center justify-center gap-2 rounded-lg bg-linear-to-r from-brand-500 to-brand-300 px-3 py-2.5 text-sm font-medium text-ivory shadow-lg shadow-brand-950/50 transition duration-200 ease-premium hover:-translate-y-0.5 hover:shadow-brand-500/30 hover:brightness-110"
          >
            <Icon name="present" size={18} />
            Open Guest Studio
          </Link>
        </div>
      </aside>
    </>
  );
}
