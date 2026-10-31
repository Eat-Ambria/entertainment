/**
 * Route guards.
 * - ProtectedRoute: signed-in users only; anyone still on the default password is
 *   sent to /change-password before they can open any other screen.
 * - RequireSession: signed-in only, no password check (used by /change-password itself).
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { Spinner } from '@/components/ui/Spinner';
import { NotConfigured } from './NotConfigured';

export function ProtectedRoute() {
  const { status, profile, profileError } = useAuth();
  const location = useLocation();

  if (status === 'unconfigured') return <NotConfigured />;
  if (status === 'loading') return <Spinner full label="Loading…" />;
  if (status === 'signedOut') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (!profile) {
    return profileError ? <NotConfigured message={profileError} /> : <Spinner full label="Loading…" />;
  }
  if (profile.must_change_password) return <Navigate to="/change-password" replace />;
  return <Outlet />;
}

export function RequireSession() {
  const { status } = useAuth();
  if (status === 'unconfigured') return <NotConfigured />;
  if (status === 'loading') return <Spinner full label="Loading…" />;
  if (status === 'signedOut') return <Navigate to="/login" replace />;
  return <Outlet />;
}
