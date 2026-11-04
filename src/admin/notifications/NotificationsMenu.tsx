/**
 * Header bell: opens a small notifications panel (does not navigate). Shows teammates who opened
 * or edited your quotes, your events in the next 7 days and drafts waiting for a follow-up; each
 * row links to the quote. The badge counts teammate activity you haven't seen yet (remembered per
 * user in this browser); a dot marks events coming up that you haven't looked at today.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Icon } from '@/components/ui/Icon';
import { formatDate, todayIst } from '@/lib/date';
import { ADMIN_ROOT } from '../nav';
import { useNotifications } from './notificationsApi';

const timeAgo = (iso: string) => {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDate(iso);
};

function readSeen(key: string): { at: string; day: string } {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as { at: string; day: string };
  } catch {
    // storage blocked — everything counts as unseen
  }
  return { at: '', day: '' };
}

export function NotificationsMenu() {
  const { session } = useAuth();
  const today = todayIst();
  const n = useNotifications(today);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const seenKey = `notifications-seen:${session?.user.id ?? 'anon'}`;
  const [seen, setSeen] = useState(() => readSeen(seenKey));

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

  const data = n.data;
  const unseen = (data?.activity ?? []).filter((a) => a.at > seen.at).length;
  const eventsDot = (data?.upcoming.length ?? 0) > 0 && seen.day !== today;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && data) {
      const mark = { at: data.activity[0]?.at ?? seen.at, day: today };
      setSeen(mark);
      try {
        localStorage.setItem(seenKey, JSON.stringify(mark));
      } catch {
        // not remembered — fine
      }
    }
  }

  const close = () => setOpen(false);
  const empty = data && !data.activity.length && !data.upcoming.length && !data.drafts;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unseen ? `Notifications (${unseen} new)` : 'Notifications'}
        className="relative rounded-full p-2 text-ivory transition-colors duration-150 hover:bg-white/10"
      >
        <Icon name="bell" size={20} />
        {unseen > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white ring-2 ring-cream-50">
            {unseen > 9 ? '9+' : unseen}
          </span>
        ) : (
          eventsDot && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-brand-500 ring-2 ring-cream-50" />
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] origin-top-right animate-pop overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-lg"
        >
          <p className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Notifications</p>
          <div className="max-h-[70vh] overflow-y-auto">
            {n.isLoading ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Loading…</p>
            ) : n.isError ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">Couldn't load notifications. Try again in a moment.</p>
            ) : empty ? (
              <p className="px-4 py-6 text-center text-sm text-slate-500">You're all caught up.</p>
            ) : (
              data && (
                <>
                  {data.activity.length > 0 && (
                    <Group title="Team activity on your quotes">
                      {data.activity.map((a) => (
                        <Row key={a.id} to={`${ADMIN_ROOT}/quotes/${a.quoteId}`} onClick={close} icon={a.action === 'edited_by_other' ? 'edit' : 'eye'} fresh={a.at > seen.at}>
                          <span className="font-medium">{a.by}</span> {a.action === 'edited_by_other' ? 'edited' : 'opened'}{' '}
                          <span className="num">{a.quoteNo}</span> · {a.guestName}
                          <span className="block text-xs text-slate-400">{timeAgo(a.at)}</span>
                        </Row>
                      ))}
                    </Group>
                  )}
                  {data.upcoming.length > 0 && (
                    <Group title="Events in the next 7 days">
                      {data.upcoming.map((e) => (
                        <Row key={e.id} to={`${ADMIN_ROOT}/quotes/${e.id}`} onClick={close} icon="calendar">
                          <span className="font-medium">{e.guestName}</span> · {e.functionName}
                          <span className="block text-xs text-slate-400">
                            {e.eventDate === today ? 'Today' : formatDate(e.eventDate)} · <span className="num">{e.quoteNo}</span>
                          </span>
                        </Row>
                      ))}
                    </Group>
                  )}
                  {data.drafts > 0 && (
                    <Group title="Follow up">
                      <Row to={`${ADMIN_ROOT}/quotes?status=draft`} onClick={close} icon="clock">
                        {data.drafts} draft {data.drafts === 1 ? 'quote is' : 'quotes are'} waiting to be sent
                      </Row>
                    </Group>
                  )}
                </>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-slate-100 py-1 last:border-b-0">
      <p className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      {children}
    </section>
  );
}

function Row({
  to,
  onClick,
  icon,
  fresh = false,
  children,
}: {
  to: string;
  onClick: () => void;
  icon: 'edit' | 'eye' | 'calendar' | 'clock';
  fresh?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link to={to} onClick={onClick} className="flex items-start gap-3 px-4 py-2.5 text-sm text-slate-700 transition-colors duration-150 hover:bg-slate-50">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${fresh ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
        <Icon name={icon} size={14} />
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </Link>
  );
}
