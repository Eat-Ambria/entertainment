/**
 * My Workspace navigation — single source for the sidebar, top-bar title and dashboard tiles.
 * Internal-only area: everything here may show cost, margin and vendor data.
 */
import type { IconName } from '@/components/ui/Icon';

export const ADMIN_ROOT = '/admin';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  description: string;
  section: 'workspace' | 'catalogue' | 'insights' | 'system';
}

export const NAV_ITEMS: NavItem[] = [
  { to: ADMIN_ROOT, label: 'Dashboard', icon: 'dashboard', section: 'workspace', description: 'Overview' },
  {
    to: `${ADMIN_ROOT}/quotes`,
    label: 'Quote Ledger',
    icon: 'ledger',
    section: 'workspace',
    description: 'Search and reopen saved quotations.',
  },
  {
    to: `${ADMIN_ROOT}/elements`,
    label: 'Elements',
    icon: 'elements',
    section: 'catalogue',
    description: 'Master list of elements, rates and images.',
  },
  {
    to: `${ADMIN_ROOT}/packages`,
    label: 'Packages',
    icon: 'packages',
    section: 'catalogue',
    description: 'Curated packages with default elements.',
  },
  {
    to: `${ADMIN_ROOT}/charges`,
    label: 'Additional charges',
    icon: 'receipt',
    section: 'catalogue',
    description: 'Transportation and labour rates added to new quotes.',
  },
  {
    to: `${ADMIN_ROOT}/rate-history`,
    label: 'Rate History',
    icon: 'history',
    section: 'insights',
    description: 'Vendor purchase rates and rate changes.',
  },
  {
    to: `${ADMIN_ROOT}/reports/pnl`,
    label: 'P&L Reports',
    icon: 'chart',
    section: 'insights',
    description: 'Cost, selling price and margin.',
  },
  {
    to: `${ADMIN_ROOT}/settings`,
    label: 'Settings',
    icon: 'settings',
    section: 'system',
    description: 'Functions, venues, sessions and users.',
  },
];

export const NAV_SECTIONS: { key: NavItem['section']; label: string }[] = [
  { key: 'workspace', label: 'Workspace' },
  { key: 'catalogue', label: 'Catalogue' },
  { key: 'insights', label: 'Insights' },
  { key: 'system', label: 'System' },
];

/** Nav item matching a pathname (exact match first, then longest prefix). */
export function navItemFor(pathname: string): NavItem | undefined {
  const exact = NAV_ITEMS.find((n) => n.to === pathname);
  if (exact) return exact;
  return NAV_ITEMS.filter((n) => n.to !== ADMIN_ROOT && pathname.startsWith(`${n.to}/`)).sort(
    (a, b) => b.to.length - a.to.length,
  )[0];
}
