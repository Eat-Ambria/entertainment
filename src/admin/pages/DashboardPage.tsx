/**
 * My Workspace dashboard:
 *  - a dark-gold welcome banner (greeting, date, business) with "New Quote" and "Open Guest Studio";
 *  - real KPIs from the Quote Ledger (quotes this month, drafts, confirmed) — counts only, no
 *    placeholder numbers; "—" while loading or if the ledger can't be read;
 *  - confirmed business for events this month (value, profit, margin — from the P&L totals);
 *  - the quote pipeline (draft / confirmed / cancelled) as one bar;
 *  - the next five events (days to go) and the five most recent quotations;
 *  - compact tiles into every internal area. Sections rise in one after another.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { Icon, type IconName } from '@/components/ui/Icon';
import { formatINR } from '@/lib/money';
import { formatDate, todayIst } from '@/lib/date';
import { asset } from '@/lib/asset';
import { ADMIN_ROOT, NAV_ITEMS } from '../nav';
import { STUDIO_NEW_QUOTE, STUDIO_ROOT } from '@/studio/steps';
import { useLedger } from '../quotes/useQuoteLedger';
import { StatusBadge } from '../quotes/StatusBadge';
import type { LedgerParams, QuoteStatus } from '../quotes/quoteLedgerApi';
import { pnlApi } from '../pnl/pnlApi';
import { useUpcomingEvents } from '../dashboard/dashboardApi';

const ALL: LedgerParams = { search: '', status: null, functionName: null, packageId: null, from: null, to: null, page: 1, pageSize: 1 };
const DAY_MS = 86_400_000;
const LEDGER = `${ADMIN_ROOT}/quotes`;

function greeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(now));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const daysUntil = (date: string, today: string) => Math.round((Date.parse(date) - Date.parse(today)) / DAY_MS);

/** Number of quotes matching the filter (one-row query, the count comes back with it). */
function useQuoteCount(extra: Partial<LedgerParams>) {
  const q = useLedger({ ...ALL, ...extra });
  return q.data?.total ?? null;
}

/** Section that rises in after `order` steps (CSS animate-rise, transform + opacity only). */
function Rise({ order, label, className = '', children }: { order: number; label?: string; className?: string; children: ReactNode }) {
  const style: CSSProperties = { animationDelay: `${order * 70}ms` };
  return (
    <section aria-label={label} className={`animate-rise ${className}`} style={style}>
      {children}
    </section>
  );
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const today = todayIst();
  const monthStart = `${today.slice(0, 8)}01`;
  const monthEnd = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const monthName = new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(`${today}T12:00:00Z`));
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];
  const business = profile?.business_name?.trim() || 'Ambria Entertainment';

  const thisMonth = useQuoteCount({ from: monthStart });
  const drafts = useQuoteCount({ status: 'draft' as QuoteStatus });
  const confirmed = useQuoteCount({ status: 'confirmed' as QuoteStatus });
  const cancelled = useQuoteCount({ status: 'cancelled' as QuoteStatus });
  const recent = useLedger({ ...ALL, pageSize: 5 });
  const upcoming = useUpcomingEvents(today);
  // Confirmed business for events this month (event date), from the P&L totals.
  const month = useQuery({
    queryKey: ['pnl', 'totals', 'dashboard', monthStart],
    queryFn: () => pnlApi.totals({ status: 'confirmed', from: monthStart, to: monthEnd, functionName: null, packageId: null }),
    retry: false,
  });

  const pipeline = [
    { label: 'Draft', value: drafts, cls: 'bg-amber-400' },
    { label: 'Confirmed', value: confirmed, cls: 'bg-emerald-500' },
    { label: 'Cancelled', value: cancelled, cls: 'bg-rose-500' },
  ];
  const pipelineTotal = pipeline.reduce((n, p) => n + (p.value ?? 0), 0);
  const tiles = NAV_ITEMS.filter((n) => n.to !== ADMIN_ROOT);

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <section className="relative isolate animate-rise overflow-hidden rounded-3xl bg-stage-950 px-6 py-7 text-ivory shadow-xl shadow-stage-950/20 sm:px-8 sm:py-9">
        <img src={asset('concert-bg.webp')} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-35" />
        <span className="absolute inset-0 -z-10 bg-linear-to-r from-stage-950 via-stage-950/85 to-stage-950/30" />
        <span className="absolute -top-24 -right-24 -z-10 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgb(226_183_102/0.25),transparent_65%)]" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-brand-300">
              {formatDate(today)} · {business}
            </p>
            <h1 className="mt-3 font-display text-3xl leading-tight text-ivory sm:text-4xl">Dashboard</h1>
            <p className="mt-2 text-base text-ivory/70">
              {greeting()}
              {firstName ? `, ${firstName}` : ''} — manage the catalogue, track rates and review quotations.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to={STUDIO_NEW_QUOTE}
              className="inline-flex items-center gap-2 rounded-full bg-brand-400 px-5 py-2.5 text-sm font-semibold text-stage-950 shadow-lg shadow-black/30 transition-colors duration-150 hover:bg-brand-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
            >
              <Icon name="plus" size={18} />
              New Quote
            </Link>
            <Link
              to={STUDIO_ROOT}
              className="inline-flex items-center gap-2 rounded-full border border-ivory/35 px-5 py-2.5 text-sm font-medium text-ivory transition-colors duration-150 hover:border-ivory/70 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300"
            >
              <Icon name="present" size={18} />
              Open Guest Studio
            </Link>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <Rise order={1} label="Quotation numbers" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon="receipt" label="Quotes this month" value={thisMonth} to={LEDGER} />
        <Kpi icon="edit" label="Drafts to follow up" value={drafts} to={LEDGER} />
        <Kpi icon="check" label="Confirmed quotes" value={confirmed} to={LEDGER} />
        <Link
          to={`${ADMIN_ROOT}/reports/pnl`}
          className="group relative overflow-hidden rounded-2xl bg-stage-950 p-5 text-ivory shadow-sm transition duration-200 ease-premium hover:-translate-y-0.5 hover:shadow-lg"
        >
          <span className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-[radial-gradient(circle,rgb(226_183_102/0.3),transparent_65%)]" />
          <div className="relative flex items-center justify-between">
            <p className="text-sm font-medium text-ivory/70">Confirmed · {monthName} events</p>
            <span className="rounded-lg bg-brand-400/15 p-2 text-brand-300">
              <Icon name="chart" size={18} />
            </span>
          </div>
          <p className="num relative mt-3 font-display text-3xl text-brand-200">{month.data ? formatINR(month.data.all_selling) : '—'}</p>
          <p className="relative mt-1 text-xs text-ivory/55">
            {month.data
              ? `Profit ${formatINR(month.data.profit)}${month.data.margin_pct !== null ? ` · ${month.data.margin_pct.toFixed(1)}% margin` : ''}`
              : 'Value of confirmed events this month'}
          </p>
        </Link>
      </Rise>

      {/* Pipeline */}
      <Rise order={2} label="Quote pipeline" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">Quote pipeline</h2>
          <ul className="flex flex-wrap gap-4 text-sm">
            {pipeline.map((p) => (
              <li key={p.label} className="flex items-center gap-2 text-slate-600">
                <span className={`h-2.5 w-2.5 rounded-full ${p.cls}`} />
                {p.label} <span className="num font-semibold text-slate-900">{p.value ?? '—'}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
          {pipelineTotal > 0 &&
            pipeline.map((p) => (
              <span
                key={p.label}
                className={`${p.cls} h-full origin-left animate-[grow_900ms_var(--ease-premium)_both]`}
                style={{ width: `${((p.value ?? 0) / pipelineTotal) * 100}%` }}
                title={`${p.label}: ${p.value ?? 0}`}
              />
            ))}
        </div>
      </Rise>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Upcoming events */}
        <Rise order={3} label="Upcoming events" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Upcoming events</h2>
            <span className="text-xs text-slate-400">Draft &amp; confirmed</span>
          </div>
          {upcoming.isLoading ? (
            <SkeletonRows />
          ) : !upcoming.data || upcoming.data.length === 0 ? (
            <Empty icon="present" text={upcoming.isError ? "Couldn't load upcoming events." : 'No upcoming events yet.'} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.data.map((e) => {
                const d = daysUntil(e.event_date, today);
                const [day, mon] = formatDate(e.event_date).split(' ');
                return (
                  <li key={e.id}>
                    <Link to={`${LEDGER}/${e.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors duration-150 hover:bg-slate-50">
                      <span className="flex w-12 shrink-0 flex-col items-center rounded-xl border border-brand-200 bg-brand-50 py-1 text-brand-800">
                        <span className="text-[10px] font-semibold uppercase">{mon}</span>
                        <span className="num font-display text-lg leading-none">{day}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-900">{e.guest_name}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {e.function_name} · <span className="num">{e.quote_no}</span>
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          d <= 7 ? 'bg-rose-50 text-rose-700' : d <= 30 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`}
                      </span>
                      <StatusBadge status={e.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Rise>

        {/* Recent quotations */}
        <Rise order={4} label="Recent quotations" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Recent quotations</h2>
            <Link to={LEDGER} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
              View all <Icon name="chevronRight" size={16} />
            </Link>
          </div>
          {recent.isLoading ? (
            <SkeletonRows />
          ) : !recent.data || recent.data.rows.length === 0 ? (
            <Empty icon="receipt" text={recent.isError ? "Couldn't load recent quotations." : 'No quotations yet — start one from the Guest Studio.'} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.data.rows.map((r) => (
                <li key={r.id}>
                  <Link to={`${LEDGER}/${r.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors duration-150 hover:bg-slate-50">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 font-semibold text-brand-700">
                      {r.guest_name.trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900">{r.guest_name}</span>
                      <span className="block truncate text-xs text-slate-500">
                        <span className="num">{r.quote_no}</span> · {r.function_name}
                        {r.event_date ? ` · ${formatDate(r.event_date)}` : ''}
                      </span>
                    </span>
                    <span className="num hidden font-semibold text-slate-900 sm:block">{formatINR(r.final_total)}</span>
                    <StatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Rise>
      </div>

      {/* Quick access */}
      <Rise order={5} label="Quick access" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">Quick access</h2>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {tiles.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group flex items-center gap-3 rounded-xl border border-slate-100 p-3 transition duration-200 ease-premium hover:-translate-y-0.5 hover:border-brand-200 hover:bg-brand-50/40 hover:shadow-sm"
            >
              <span className="rounded-lg bg-brand-50 p-2 text-brand-600 transition-colors duration-200 group-hover:bg-brand-100">
                <Icon name={item.icon} size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                <span className="block truncate text-xs text-slate-500">{item.description}</span>
              </span>
              <Icon name="chevronRight" size={16} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
            </Link>
          ))}
        </div>
      </Rise>
    </div>
  );
}

function Kpi({ icon, label, value, to }: { icon: IconName; label: string; value: number | null; to: string }) {
  return (
    <Link
      to={to}
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 ease-premium hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className="rounded-lg bg-slate-100 p-2 text-slate-500 transition-colors duration-200 group-hover:bg-brand-100 group-hover:text-brand-700">
          <Icon name={icon} size={18} />
        </span>
      </div>
      <p className="num mt-3 font-display text-4xl text-slate-900">{value ?? '—'}</p>
    </Link>
  );
}

function SkeletonRows() {
  return (
    <ul className="divide-y divide-slate-100" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-4 px-5 py-4">
          <span className="h-9 w-9 animate-pulse rounded-full bg-slate-100" />
          <span className="h-4 flex-1 animate-pulse rounded bg-slate-100" />
        </li>
      ))}
    </ul>
  );
}

function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
      <span className="rounded-full bg-brand-50 p-3 text-brand-600">
        <Icon name={icon} size={22} />
      </span>
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  );
}
