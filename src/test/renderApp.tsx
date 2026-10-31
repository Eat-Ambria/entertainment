/**
 * Test helpers: a fake auth state and a renderer that mounts the real route tree
 * (memory router + query client + auth context) at a given path.
 */
import { Suspense, useMemo, useState, type ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { vi } from 'vitest';
import { AuthContext } from '@/auth/AuthContext';
import type { AuthState, Profile } from '@/auth/types';
import { routes } from '@/routes/routes';

export const testProfile: Profile = {
  id: 'user-1',
  phone: '9876543210',
  full_name: 'Uday Yadav',
  business_name: null,
  logo_path: null,
  hero_image_path: null,
  performer_photo_paths: [],
  contact_line: null,
  lms_logged_user_id: null,
  must_change_password: false,
};

export function fakeAuth(overrides: Partial<AuthState> = {}): AuthState {
  const signedIn = (overrides.status ?? 'signedIn') === 'signedIn';
  return {
    status: 'signedIn',
    session: signedIn ? ({ user: { id: testProfile.id } } as Session) : null,
    profile: signedIn ? testProfile : null,
    profileError: null,
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    changePassword: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue(undefined),
    refreshProfile: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function Providers({ auth, children }: { auth: AuthState; children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <AuthContext.Provider value={auth}>
        <Suspense fallback={null}>{children}</Suspense>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

/** Auth whose signOut really flips the state to signedOut (for sign-out flows). */
function StatefulAuth({ initial, children }: { initial: AuthState; children: (auth: AuthState) => ReactNode }) {
  const [signedOut, setSignedOut] = useState(false);
  const auth = useMemo<AuthState>(
    () =>
      signedOut
        ? { ...initial, status: 'signedOut', session: null, profile: null }
        : {
            ...initial,
            signOut: async () => {
              await initial.signOut();
              setSignedOut(true);
            },
          },
    [initial, signedOut],
  );
  return <>{children(auth)}</>;
}

export function renderApp(
  path: string,
  auth: AuthState = fakeAuth(),
  state?: unknown,
  opts: { stateful?: boolean } = {},
) {
  const router = createMemoryRouter(routes, { initialEntries: [state ? { pathname: path, state } : path] });
  const tree = (a: AuthState) => (
    <Providers auth={a}>
      <RouterProvider router={router} />
    </Providers>
  );
  render(opts.stateful ? <StatefulAuth initial={auth}>{tree}</StatefulAuth> : tree(auth));
  return { router, auth };
}
