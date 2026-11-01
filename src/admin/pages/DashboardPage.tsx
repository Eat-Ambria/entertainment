/**
 * My Workspace dashboard (warm cream theme; the stage photo behind the greeting comes from
 * AdminLayout):
 *  - greeting ("Good Morning, Vikash"), today's date and New Quote (Open Guest Studio is in the sidebar);
 *  - KPI cards from the Quote Ledger — quotes this month (vs last month), drafts to follow up,
 *    confirmed quotes (+ this month) — and confirmed revenue for this month's events (P&L);
 *  - the quote pipeline (draft / confirmed / cancelled) as one bar;
 *  - the next events and the most recent quotations.
 * Counts only from real data; "—" while loading or if something can't be read.
 * Motion: greeting rises, the four cards pop up one after another, the revenue card has a slow
 * light sweep, the pipeline bar grows and list rows slide in — transform/opacity only.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { Icon, type IconName } from '@/components/ui/Icon';
import { formatINR } from '@/lib/money';
import { formatDate, todayIst } from '@/lib/date';
import { ADMIN_ROOT } from '../nav';
import { STUDIO_NEW_QUOTE } from '@/studio/steps';
import { useLedger } from '../quotes/useQuoteLedger';
import type { LedgerParams, QuoteStatus } from '../quotes/quoteLedgerApi';
import { pnlApi } from '../pnl/pnlApi';
import { HERO_BTN } from '../heroButton';
import { useUpcomingEvents } from '../dashboard/dashboardApi';

const ALL: LedgerParams = { search: '', status: null, functionName: null, packageId: null, from: null, to: null, page: 1, pageSize: 1 };
const DAY_MS = 86_400_000;
const LEDGER = `${ADMIN_ROOT}/quotes`;
const IST = 'Asia/Kolkata';

const CARD = 'rounded-2xl border border-white/80 bg-white/60 shadow-[0_10px_30px_-14px_rgb(110_80_40/0.28)] backdrop-blur-md';

function greeting(now = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: IST }).format(now));
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
}

/** ₹2.4L / ₹1.2Cr / ₹45K — short Indian notation for the revenue card. */
function compactINR(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  if (a >= 1e3) return `₹${(v / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return formatINR(v);
}

const monthBounds = (y: number, m: number) => {
  const start = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { start, end };
};

/** ALL-CAPS names (as LMS often stores them) shown in title case; mixed-case names are left alone. */
const displayName = (n: string) =>
  n === n.toUpperCase() ? n.toLowerCase().replace(/(^|[\s/(-])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase()) : n;

function useQuoteCount(extra: Partial<LedgerParams>) {
  return useLedger({ ...ALL, ...extra }).data?.total ?? null;
}

function Rise({ order, label, className = '', children }: { order: number; label?: string; className?: string; children: ReactNode }) {
  const style: CSSProperties = { animationDelay: `${300 + order * 120}ms` };
  return (
    <section aria-label={label} className={`dash-rise ${className}`} style={style}>
      {children}
    </section>
  );
}

const PILL: Record<QuoteStatus, string> = {
  draft: 'bg-[#f8e8cf] text-[#9a6b2f] ring-transparent',
  sent: 'bg-sky-50 text-sky-700 ring-sky-200/70',
  confirmed: 'bg-[#dcefd6] text-[#3c7536] ring-transparent',
  cancelled: 'bg-rose-50 text-rose-700 ring-rose-200/70',
};
const PILL_LABEL: Record<QuoteStatus, string> = { draft: 'Draft', sent: 'Sent', confirmed: 'Confirmed', cancelled: 'Cancelled' };

function StatusPill({ status }: { status: QuoteStatus }) {
  return <span className={`shrink-0 rounded-full px-3.5 py-1 text-xs font-medium ring-1 ${PILL[status]}`}>{PILL_LABEL[status]}</span>;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const today = todayIst();
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1;
  const month = monthBounds(y, m);
  const lastMonth = monthBounds(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1);
  const noon = new Date(`${today}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'long', timeZone: IST }).format(noon);
  const monthName = new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: IST }).format(noon);
  const firstName = profile?.full_name?.trim().split(/\s+/)[0];

  const thisMonth = useQuoteCount({ from: month.start });
  const prevMonth = useQuoteCount({ from: lastMonth.start, to: lastMonth.end });
  const drafts = useQuoteCount({ status: 'draft' as QuoteStatus });
  const confirmed = useQuoteCount({ status: 'confirmed' as QuoteStatus });
  const confirmedThisMonth = useQuoteCount({ status: 'confirmed' as QuoteStatus, from: month.start });
  const cancelled = useQuoteCount({ status: 'cancelled' as QuoteStatus });
  const recent = useLedger({ ...ALL, pageSize: 4 });
  const upcoming = useUpcomingEvents(today);
  const revenue = useQuery({
    queryKey: ['pnl', 'totals', 'dashboard', month.start],
    queryFn: () => pnlApi.totals({ status: 'confirmed', from: month.start, to: month.end, functionName: null, packageId: null }),
    retry: false,
  });

  const trend = thisMonth !== null && prevMonth ? Math.round(((thisMonth - prevMonth) / prevMonth) * 100) : null;
  const pipeline = [
    { label: 'Draft', value: drafts, cls: 'bg-linear-to-r from-[#c9a35d] to-[#d9b877]', dot: 'bg-[#c9a35d]' },
    { label: 'Confirmed', value: confirmed, cls: 'bg-[#6fae6a]', dot: 'bg-[#6fae6a]' },
    { label: 'Cancelled', value: cancelled, cls: 'bg-[#dd6b72]', dot: 'bg-[#dd6b72]' },
  ];
  const pipelineTotal = pipeline.reduce((n, p) => n + (p.value ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Greeting over the stage photo */}
      <section className="dash-hero flex flex-col gap-5 pt-1 pb-3 text-ivory lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="sr-only">Dashboard</h1>
          <p className="font-display text-3xl leading-tight sm:text-[2.6rem]">
            {greeting()}
            {firstName && (
              <>
                , <span className="gold-shimmer">{firstName}</span>
              </>
            )}
          </p>
          <p className="mt-1.5 text-sm tracking-wide text-ivory/80 sm:text-base">Your entertainment business at a glance.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <Icon name="calendar" size={22} className="text-brand-300" />
            <p className="leading-tight">
              <span className="block text-sm font-medium">{formatDate(today)}</span>
              <span className="block text-xs text-ivory/70">{weekday}</span>
            </p>
          </div>
          <span className="hidden h-9 w-px bg-ivory/30 sm:block" aria-hidden="true" />
          <Link
            to={STUDIO_NEW_QUOTE}
            className={HERO_BTN}
          >
            <Icon name="plus" size={18} />
            New Quote
          </Link>
        </div>
      </section>

      {/* KPIs */}
      <section aria-label="Quotation numbers" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi
          order={0}
          icon="fileText"
          tone="warm"
          label="Quotes this month"
          value={thisMonth}
          to={LEDGER}
          foot={
            trend !== null ? (
              <span className={trend >= 0 ? 'text-emerald-700' : 'text-rose-600'}>
                <Icon name={trend >= 0 ? 'arrowUp' : 'arrowDown'} size={16} className="mr-1 inline align-[-3px]" />
                {trend >= 0 ? '+' : ''}
                {trend}% from last month
              </span>
            ) : (
              <span className="text-slate-500">This month</span>
            )
          }
        />
        <Kpi
          order={1}
          icon="edit"
          tone="amber"
          label="Drafts to follow up"
          value={drafts}
          to={`${LEDGER}?status=draft`}
          foot={
            <span className="text-brand-700">
              <Icon name="clock" size={16} className="mr-1 inline align-[-3px]" />
              Pending action
            </span>
          }
        />
        <Kpi
          order={2}
          icon="check"
          tone="green"
          label="Confirmed quotes"
          value={confirmed}
          to={`${LEDGER}?status=confirmed`}
          foot={
            <span className="text-emerald-700">
              <Icon name="arrowUp" size={16} className="mr-1 inline align-[-3px]" />
              {confirmedThisMonth ?? '—'} this month
            </span>
          }
        />
        <Link
          to={`${ADMIN_ROOT}/reports/pnl`}
          style={{ animationDelay: '510ms' }}
          className="dash-pop group relative overflow-hidden rounded-2xl bg-linear-to-br from-[#3d2b17] via-[#26190d] to-[#160f08] p-4 text-ivory sm:p-5 shadow-[0_12px_30px_-10px_rgb(60_40_15/0.6)] ring-1 ring-brand-400/30 transition duration-200 ease-premium hover:-translate-y-0.5"
        >
          <span aria-hidden="true" className="card-sheen" />
          {/* Glowing gold waves (decorative) */}
          <span className="pointer-events-none absolute -right-10 -bottom-12 h-40 w-56 rounded-full bg-[radial-gradient(closest-side,rgb(226_170_90/0.35),transparent)]" />
          <svg aria-hidden="true" viewBox="0 0 240 140" className="pointer-events-none absolute -right-2 -bottom-2 h-32 w-56 text-[#e8b866] drop-shadow-[0_0_6px_rgb(232_184_102/0.6)]" fill="none">
            {Array.from({ length: 9 }, (_, i) => (
              <path
                key={i}
                d={`M0 ${136 - i * 2} C 70 ${132 - i * 3}, 120 ${70 + i * 5}, 250 ${12 + i * 7}`}
                stroke="currentColor"
                strokeWidth="0.8"
                strokeOpacity={0.18 + i * 0.07}
              />
            ))}
          </svg>
          <div className="relative flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-b from-[#7a5a2c] to-[#4a3418] font-display text-lg text-[#f3d49a] ring-1 ring-[#d9ab5f]/70">₹</span>
            <p className="text-sm text-ivory/90">Confirmed revenue</p>
          </div>
          <p className="num relative mt-3 truncate bg-linear-to-b from-[#f6dca2] to-[#d4a65a] bg-clip-text font-display text-3xl font-semibold text-transparent sm:text-[2.35rem]">{revenue.data ? compactINR(revenue.data.all_selling) : '—'}</p>
          <p className="relative mt-1.5 truncate text-xs text-ivory/75">From confirmed {monthName} events</p>
        </Link>
      </section>

      {/* Pipeline */}
      <Rise order={2} label="Quote pipeline" className={`${CARD} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-semibold text-slate-900">Quote pipeline</h2>
          <ul className="flex flex-wrap gap-5 text-sm">
            {pipeline.map((p) => (
              <li key={p.label} className="flex items-center gap-2 text-slate-600">
                <span className={`h-2.5 w-2.5 rounded-full ${p.dot}`} />
                {p.label} <span className="num font-semibold text-slate-900">{p.value ?? '—'}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 flex h-4 overflow-hidden rounded-full bg-cream-200/70">
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
        <Rise order={3} label="Upcoming events" className={`${CARD} p-5 sm:p-6`}>
          <ListHeader icon="calendar" title="Upcoming events" to={LEDGER} />
          {upcoming.isLoading ? (
            <SkeletonRows />
          ) : !upcoming.data || upcoming.data.length === 0 ? (
            <Empty icon="calendar" text={upcoming.isError ? "Couldn't load upcoming events." : 'No upcoming events yet.'} />
          ) : (
            <ul className="divide-y divide-cream-200">
              {upcoming.data.map((e, i) => {
                const [day, mon] = formatDate(e.event_date).split(' ');
                const d = Math.round((Date.parse(e.event_date) - Date.parse(today)) / DAY_MS);
                return (
                  <li key={e.id} className="dash-slide" style={{ animationDelay: `${650 + i * 110}ms` }}>
                    <Link to={`${LEDGER}/${e.id}`} className="flex items-center gap-4 py-3 transition-colors duration-150 hover:bg-white/50">
                      <span className="flex w-13 shrink-0 flex-col items-center rounded-lg bg-[#f6e9d6] py-1.5 text-slate-700">
                        <span className="text-[10px] font-medium uppercase">{mon}</span>
                        <span className="num font-display text-xl leading-none text-slate-900">{day}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-base font-semibold text-slate-900">{displayName(e.guest_name)}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {[e.function_name, e.venue_name].filter(Boolean).join(' · ')}
                          {d >= 0 && d <= 7 ? ` · ${d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `in ${d} days`}` : ''}
                        </span>
                      </span>
                      <StatusPill status={e.status} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Rise>

        {/* Recent quotations */}
        <Rise order={4} label="Recent quotations" className={`${CARD} p-5 sm:p-6`}>
          <ListHeader icon="fileText" title="Recent quotations" to={LEDGER} />
          {recent.isLoading ? (
            <SkeletonRows />
          ) : !recent.data || recent.data.rows.length === 0 ? (
            <Empty icon="fileText" text={recent.isError ? "Couldn't load recent quotations." : 'No quotations yet — start one from the Guest Studio.'} />
          ) : (
            <ul className="divide-y divide-cream-200">
              {recent.data.rows.map((r, i) => (
                <li key={r.id} className="dash-slide" style={{ animationDelay: `${700 + i * 110}ms` }}>
                  <Link to={`${LEDGER}/${r.id}`} className="flex items-center gap-4 py-3 transition-colors duration-150 hover:bg-white/50">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f6e9d6] font-display text-base text-brand-700">
                      {r.guest_name.trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-base font-semibold text-slate-900">{displayName(r.guest_name)}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {r.function_name}
                        {r.event_date ? ` · ${formatDate(r.event_date)}` : ''}
                      </span>
                    </span>
                    <span className="num hidden text-base font-semibold text-slate-900 sm:block">{formatINR(r.final_total)}</span>
                    <StatusPill status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Rise>
      </div>
    </div>
  );
}

const TONE = {
  warm: { card: 'from-[#fcf5ea]/90 to-white/60', icon: 'bg-[#f3e2c8] text-[#6b4a22]' },
  amber: { card: 'from-[#fcf3e6]/90 to-white/60', icon: 'bg-[#f3e2c8] text-[#6b4a22]' },
  green: { card: 'from-[#eef6ec]/90 to-white/60', icon: 'bg-[#dcecd6] text-[#3f7a3a]' },
} as const;

function Kpi({ icon, label, value, to, foot, tone, order }: { icon: IconName; label: string; value: number | null; to: string; foot: ReactNode; tone: keyof typeof TONE; order: number }) {
  const t = TONE[tone];
  return (
    <Link
      to={to}
      style={{ animationDelay: `${150 + order * 120}ms` }}
      className={`dash-pop group relative overflow-hidden rounded-2xl border border-white/80 bg-linear-to-br p-4 shadow-[0_10px_30px_-14px_rgb(110_80_40/0.28)] backdrop-blur-md transition duration-200 ease-premium hover:-translate-y-0.5 sm:p-5 ${t.card}`}
    >
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform duration-300 ease-premium group-hover:scale-110 group-hover:-rotate-6 ${t.icon}`}>
          <Icon name={icon} size={18} />
        </span>
        <p className="text-sm text-slate-700">{label}</p>
      </div>
      <p className="num mt-3 font-display text-3xl font-semibold text-slate-900 sm:text-[2.35rem]">{value ?? '—'}</p>
      <p className="mt-1.5 truncate text-xs">{foot}</p>
    </Link>
  );
}

function ListHeader({ icon, title, to }: { icon: IconName; title: string; to: string }) {
  return (
    <div className="flex items-center justify-between border-b border-cream-200 pb-4">
      <h2 className="flex items-center gap-3 font-display text-xl font-semibold text-slate-900">
        <Icon name={icon} size={22} className="text-slate-600" />
        {title}
      </h2>
      <Link to={to} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-brand-700">
        View all <Icon name="arrowRight" size={16} />
      </Link>
    </div>
  );
}

function SkeletonRows() {
  return (
    <ul className="divide-y divide-cream-200" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-4 py-4">
          <span className="h-11 w-11 animate-pulse rounded-full bg-cream-200" />
          <span className="h-4 flex-1 animate-pulse rounded bg-cream-200" />
        </li>
      ))}
    </ul>
  );
}

function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
      <span className="rounded-full bg-cream-200/70 p-3 text-brand-700">
        <Icon name={icon} size={22} />
      </span>
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  );
}
