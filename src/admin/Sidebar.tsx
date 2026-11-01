/**
 * My Workspace sidebar, grouped by section (dividers between groups), the business name stacked
 * beside the emblem, a gold-framed active item, on the user's dark gold-wave artwork.
 * Fixed on desktop, slide-in drawer on mobile/tablet.
 */
import { Link, NavLink } from 'react-router-dom';
import { ADMIN_ROOT, NAV_ITEMS, NAV_SECTIONS } from './nav';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/auth/AuthContext';
import { asset } from '@/lib/asset';
import { BRAND } from '@/lib/brand';
import { STUDIO_ROOT } from '@/studio/steps';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const { profile } = useAuth();
  const name = profile?.business_name?.trim() || `${BRAND.name} ${BRAND.product}`;
  const [first, ...rest] = name.split(' ');
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col overflow-hidden border-r border-white/5 bg-[#0e0c0a] text-ivory transition-transform duration-200 ease-premium lg:static lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* The user's sidebar artwork (public/sidebar-bg.webp), animated: the gold waves sway slowly. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="sidebar-sway absolute inset-0">
            <img src={asset('sidebar-bg.webp')} alt="" className="h-full w-full object-cover object-bottom" />
          </div>
        </div>
        <div className="relative flex items-center justify-between px-6 pt-6 pb-5">
          <div className="flex min-w-0 items-center gap-3">
            <img src={asset('logo-mark.webp')} alt="" className="h-14 w-14 shrink-0 rounded-full bg-black object-cover ring-1 ring-brand-300/40 drop-shadow-[0_2px_12px_rgb(226_183_102/0.35)]" />
            <p className="min-w-0 font-display text-2xl leading-[1.1] text-ivory">
              {first}
              {rest.length > 0 && <span className="block truncate">{rest.join(' ')}</span>}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-ivory/60 hover:bg-white/10 lg:hidden"
            onClick={onClose}
            aria-label="Close menu"
          >
            <Icon name="close" />
          </button>
        </div>
        <nav className="relative flex-1 overflow-y-auto px-4 pb-6" aria-label="Main">
          {NAV_SECTIONS.map((section) => (
            <div key={section.key} className="border-t border-white/10 pt-5 pb-4 first:border-t-0 first:pt-3">
              <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-[0.22em] text-ivory/45">
                {section.label}
              </p>
              <div className="space-y-1">
                {NAV_ITEMS.filter((n) => n.section === section.key).map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === ADMIN_ROOT}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3.5 overflow-hidden rounded-xl px-3.5 py-2.5 text-[15px] transition-colors duration-200 ease-premium ${
                        isActive
                          ? 'bg-linear-to-r from-brand-500/35 to-brand-500/10 font-medium text-ivory ring-1 ring-brand-400/50 shadow-[0_6px_20px_-8px_rgb(226_183_102/0.45)]'
                          : 'text-ivory/75 hover:text-ivory'
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
        {/* Shortcut into the client-facing Guest Studio, on every Workspace page. */}
        <div className="relative px-4 pb-6">
          <Link
            to={STUDIO_ROOT}
            onClick={onClose}
            className="flex items-center justify-center gap-2 rounded-xl border border-ivory/60 bg-black/30 px-4 py-2.5 text-sm font-medium text-ivory backdrop-blur-sm transition-colors duration-150 hover:border-brand-300 hover:bg-white/10"
          >
            <Icon name="present" size={18} />
            Open Guest Studio
          </Link>
        </div>
      </aside>
    </>
  );
}
