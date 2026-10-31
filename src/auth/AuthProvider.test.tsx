/**
 * Tests for AuthProvider with the Supabase layer (authApi) mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { useAuth } from './AuthContext';
import { AuthProvider } from './AuthProvider';
import { authApi } from './authApi';
import { testProfile } from '@/test/renderApp';

vi.mock('@/lib/env', () => ({ isSupabaseConfigured: true, env: {} }));
vi.mock('@/lib/supabase', () => ({
  supabase: null,
  requireSupabase: () => {
    throw new Error('Supabase must not be called in this test');
  },
}));
vi.mock('./authApi', () => ({
  InvalidPhoneError: class extends Error {},
  authApi: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => () => {}),
    signIn: vi.fn(),
    signOut: vi.fn(),
    changePassword: vi.fn(),
    fetchProfile: vi.fn(),
    updateProfile: vi.fn(),
  },
}));

const api = vi.mocked(authApi);
const session = { user: { id: testProfile.id } } as Session;

const probe: { current: ReturnType<typeof useAuth> | null } = { current: null };
function Probe() {
  const auth = useAuth();
  useEffect(() => {
    probe.current = auth;
  });
  return <p>status:{auth.status}</p>;
}
const latest = new Proxy({} as ReturnType<typeof useAuth>, {
  get: (_t, key) => probe.current![key as keyof ReturnType<typeof useAuth>],
});

function mount(qc = new QueryClient()) {
  render(
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return qc;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.onAuthStateChange.mockReturnValue(() => {});
  api.fetchProfile.mockResolvedValue(testProfile);
});

describe('AuthProvider', () => {
  it('starts signed out when there is no session', async () => {
    api.getSession.mockResolvedValue(null);
    mount();
    expect(await screen.findByText('status:signedOut')).toBeInTheDocument();
  });

  it('restores an existing session and loads the profile', async () => {
    api.getSession.mockResolvedValue(session);
    mount();
    expect(await screen.findByText('status:signedIn')).toBeInTheDocument();
    expect(latest.profile).toEqual(testProfile);
  });

  it('signs in, then signs out and clears cached data', async () => {
    api.getSession.mockResolvedValue(null);
    api.signIn.mockResolvedValue(session);
    api.signOut.mockResolvedValue(undefined);
    const qc = mount();
    await screen.findByText('status:signedOut');

    await act(() => latest.signIn('9876543210', 'pw'));
    expect(screen.getByText('status:signedIn')).toBeInTheDocument();

    qc.setQueryData(['elements'], ['secret']);
    await act(() => latest.signOut());
    expect(screen.getByText('status:signedOut')).toBeInTheDocument();
    expect(latest.profile).toBeNull();
    expect(qc.getQueryData(['elements'])).toBeUndefined();
  });

  it('changes the password with the profile phone and reloads the profile', async () => {
    api.getSession.mockResolvedValue(session);
    api.changePassword.mockResolvedValue(undefined);
    mount();
    await screen.findByText('status:signedIn');
    await act(() => latest.changePassword('old', 'new'));
    expect(api.changePassword).toHaveBeenCalledWith('9876543210', 'old', 'new');
    await waitFor(() => expect(api.fetchProfile).toHaveBeenCalledTimes(2));
  });
});
