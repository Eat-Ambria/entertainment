/**
 * My Workspace dashboard — "New Quote" (opens Guest Studio) plus tiles into each internal area.
 * Real KPIs (quote counts, totals) are added once quotes exist (Day 8+); no placeholder numbers.
 */
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { ADMIN_ROOT, NAV_ITEMS } from '../nav';
import { STUDIO_NEW_QUOTE } from '@/studio/steps';

export default function DashboardPage() {
  const tiles = NAV_ITEMS.filter((n) => n.to !== ADMIN_ROOT);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Manage the catalogue, track rates and review quotations."
        actions={
          <Link
            to={STUDIO_NEW_QUOTE}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            <Icon name="plus" size={18} />
            New Quote
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-200 hover:shadow-md"
          >
            <span className="rounded-lg bg-brand-50 p-2.5 text-brand-600">
              <Icon name={item.icon} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-slate-900">{item.label}</span>
              <span className="mt-0.5 block text-sm text-slate-500">{item.description}</span>
            </span>
            <Icon
              name="chevronRight"
              size={18}
              className="mt-1 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500"
            />
          </Link>
        ))}
      </div>
    </>
  );
}
