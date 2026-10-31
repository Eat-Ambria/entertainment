/**
 * Route tree.
 *   /login            public sign-in
 *   /change-password  signed-in only (forced on first login)
 * Everything else is behind ProtectedRoute (signed in + password already changed):
 *   /         workspace chooser
 *   /studio   Guest Studio — client-facing, no internal data
 *   /admin    My Workspace — internal management, rates, P&L
 * Every page is lazy-loaded so each screen ships only its own code.
 */
import { lazy } from 'react';
import { Navigate, type RouteObject } from 'react-router-dom';
import { AdminLayout } from '@/admin/AdminLayout';
import { StudioLayout } from '@/studio/StudioLayout';
import { ProtectedRoute, RequireSession } from './ProtectedRoute';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const ChangePasswordPage = lazy(() => import('@/pages/ChangePasswordPage'));
const WorkspaceChooserPage = lazy(() => import('@/pages/WorkspaceChooserPage'));
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage'));

const StudioHomePage = lazy(() => import('@/studio/pages/StudioHomePage'));
const StudioNewQuotePage = lazy(() => import('@/studio/pages/StudioNewQuotePage'));
const SavedQuotePage = lazy(() => import('@/studio/pages/SavedQuotePage'));

const DashboardPage = lazy(() => import('@/admin/pages/DashboardPage'));
const ElementsPage = lazy(() => import('@/admin/pages/ElementsPage'));
const PackagesPage = lazy(() => import('@/admin/pages/PackagesPage'));
const PackageEditorPage = lazy(() => import('@/admin/pages/PackageEditorPage'));
const ChargesPage = lazy(() => import('@/admin/pages/ChargesPage'));
const QuoteLedgerPage = lazy(() => import('@/admin/pages/QuoteLedgerPage'));
const QuoteDetailPage = lazy(() => import('@/admin/pages/QuoteDetailPage'));
const RateHistoryPage = lazy(() => import('@/admin/pages/RateHistoryPage'));
const PnlReportsPage = lazy(() => import('@/admin/pages/PnlReportsPage'));
const SettingsPage = lazy(() => import('@/admin/pages/SettingsPage'));

export const routes: RouteObject[] = [
  { path: 'login', element: <LoginPage /> },
  {
    element: <RequireSession />,
    children: [{ path: 'change-password', element: <ChangePasswordPage /> }],
  },
  {
    element: <ProtectedRoute />,
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
