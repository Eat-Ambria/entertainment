/**
 * Route tree.
 *   /login            public sign-in
 *   /change-password  signed-in only (forced on first login)
 * Everything else is behind ProtectedRoute (signed in + password already changed):
 *   /         workspace chooser
 *   /studio   Guest Studio — client-facing, no internal data
 *   /admin    My Workspace — internal management, rates, P&L
 * Every page is lazy-loaded so each screen ships only its own code; a chunk missing after a new
 * deploy reloads the page once (lib/lazyPage), other errors show RouteError.
 */
import { lazyPage } from '@/lib/lazyPage';
import { Navigate, type RouteObject } from 'react-router-dom';
import { AdminLayout } from '@/admin/AdminLayout';
import { StudioLayout } from '@/studio/StudioLayout';
import { ProtectedRoute, RequireSession } from './ProtectedRoute';
import { RouteError } from './RouteError';

const LoginPage = lazyPage(() => import('@/pages/LoginPage'));
const ChangePasswordPage = lazyPage(() => import('@/pages/ChangePasswordPage'));
const WorkspaceChooserPage = lazyPage(() => import('@/pages/WorkspaceChooserPage'));
const NotFoundPage = lazyPage(() => import('@/pages/NotFoundPage'));

const StudioHomePage = lazyPage(() => import('@/studio/pages/StudioHomePage'));
const StudioNewQuotePage = lazyPage(() => import('@/studio/pages/StudioNewQuotePage'));
const SavedQuotePage = lazyPage(() => import('@/studio/pages/SavedQuotePage'));

const DashboardPage = lazyPage(() => import('@/admin/pages/DashboardPage'));
const ElementsPage = lazyPage(() => import('@/admin/pages/ElementsPage'));
const PackagesPage = lazyPage(() => import('@/admin/pages/PackagesPage'));
const PackageEditorPage = lazyPage(() => import('@/admin/pages/PackageEditorPage'));
const ChargesPage = lazyPage(() => import('@/admin/pages/ChargesPage'));
const QuoteLedgerPage = lazyPage(() => import('@/admin/pages/QuoteLedgerPage'));
const QuoteDetailPage = lazyPage(() => import('@/admin/pages/QuoteDetailPage'));
const RateHistoryPage = lazyPage(() => import('@/admin/pages/RateHistoryPage'));
const PnlReportsPage = lazyPage(() => import('@/admin/pages/PnlReportsPage'));
const SettingsPage = lazyPage(() => import('@/admin/pages/SettingsPage'));

export const routes: RouteObject[] = [
  { path: 'login', element: <LoginPage />, errorElement: <RouteError /> },
  {
    element: <RequireSession />,
    errorElement: <RouteError />,
    children: [{ path: 'change-password', element: <ChangePasswordPage /> }],
  },
  {
    element: <ProtectedRoute />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <WorkspaceChooserPage /> },
      {
        path: 'studio',
        element: <StudioLayout />,
        children: [
          { index: true, element: <StudioHomePage /> },
          { path: 'new', element: <StudioNewQuotePage /> },
          { path: 'quotes/:id', element: <SavedQuotePage /> },
          { path: '*', element: <Navigate to="/studio" replace /> },
        ],
      },
      {
        path: 'admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'elements', element: <ElementsPage /> },
          { path: 'packages', element: <PackagesPage /> },
          { path: 'packages/new', element: <PackageEditorPage /> },
          { path: 'packages/:id', element: <PackageEditorPage /> },
          { path: 'charges', element: <ChargesPage /> },
          { path: 'quotes', element: <QuoteLedgerPage /> },
          { path: 'quotes/:id', element: <QuoteDetailPage /> },
          { path: 'rate-history', element: <RateHistoryPage /> },
          { path: 'reports/pnl', element: <PnlReportsPage /> },
          { path: 'settings', element: <SettingsPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
