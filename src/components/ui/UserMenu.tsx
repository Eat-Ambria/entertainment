/**
 * Signed-in user chip with a small dropdown: Settings, Change password, Sign out.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { formatPhone } from '@/lib/phone';
import { InstallAppButton } from '@/pwa/InstallAppButton';
import { Icon } from './Icon';

export function UserMenu({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const name = profile?.full_name || formatPhone(profile?.phone) || 'Account';
  const initial = name.charAt(0).toUpperCase();

  async function onSignOut() {
    setOpen(false);
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm transition-colors duration-200 ${tone === 'dark' ? 'text-white/80 hover:bg-white/10' : 'text-slate-700 hover:bg-slate-100'}`}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
          {initial}
        </span>
        <span className="hidden max-w-40 truncate font-medium sm:inline">{name}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-56 origin-top-right animate-pop rounded-xl border border-slate-200 bg-white py-1 text-slate-900 shadow-lg">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <p className="truncate text-sm font-medium text-slate-900">{name}</p>
            {profile?.phone && <p className="text-xs text-slate-500">+91 {formatPhone(profile.phone)}</p>}
          </div>
          <Link role="menuitem" to="/admin/settings" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <Icon name="settings" size={16} /> Settings
          </Link>
          <Link role="menuitem" to="/change-password" onClick={() => setOpen(false)} className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            <Icon name="lock" size={16} /> Change password
          </Link>
          <InstallAppButton
            role="menuitem"
            onDone={() => setOpen(false)}
            className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 lg:hidden"
          />
          <button role="menuitem" type="button" onClick={() => void onSignOut()} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50">
            <Icon name="logout" size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
