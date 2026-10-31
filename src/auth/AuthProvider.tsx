/**
 * Holds the Supabase session + the signed-in user's profile for the whole app.
 * On sign-out the query cache and session drafts are cleared so nothing from one user
 * (or their guest) survives into the next.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { isSupabaseConfigured } from '@/lib/env';
import { clearAllDrafts } from '@/lib/sessionDrafts';
import { AuthContext } from './AuthContext';
import { authApi } from './authApi';
import type { AuthState, AuthStatus, EditableProfile, Profile } from './types';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>(isSupabaseConfigured ? 'loading' : 'unconfigured');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const userId = session?.user.id ?? null;

  const loadProfile = useCallback(async (uid: string) => {
    try {
      setProfile(await authApi.fetchProfile(uid));
      setProfileError(null);
    } catch {
      setProfileError('Could not load your profile.');
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;

    const apply = async (s: Session | null) => {
      if (cancelled) return;
      setSession(s);
      if (s) {
        await loadProfile(s.user.id);
        if (!cancelled) setStatus('signedIn');
      } else {
        setProfile(null);
        setStatus('signedOut');
      }
    };

    authApi
      .getSession()
      .then(apply)
      .catch(() => apply(null));

    const unsubscribe = authApi.onAuthStateChange((event, s) => {
      // Token refreshes keep the same user — no need to refetch the profile.
      if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        if (!cancelled) setSession(s);
        return;
      }
      void apply(s);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(
    async (phone: string, password: string) => {
      queryClient.clear();
      const s = await authApi.signIn(phone, password);
      setSession(s);
      await loadProfile(s.user.id);
      setStatus('signedIn');
    },
    [loadProfile, queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      await authApi.signOut();
    } finally {
      queryClient.clear();
      clearAllDrafts();
      setSession(null);
      setProfile(null);
      setStatus('signedOut');
    }
  }, [queryClient]);

  const phone = profile?.phone ?? null;
  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (!phone || !userId) throw new Error('Not signed in');
      await authApi.changePassword(phone, currentPassword, newPassword);
      await loadProfile(userId);
    },
    [phone, userId, loadProfile],
  );

  const updateProfile = useCallback(
    async (patch: Partial<EditableProfile>) => {
      if (!userId) throw new Error('Not signed in');
      await authApi.updateProfile(userId, patch);
      await loadProfile(userId);
    },
    [userId, loadProfile],
  );

  const refreshProfile = useCallback(async () => {
    if (userId) await loadProfile(userId);
  }, [userId, loadProfile]);

  const value = useMemo<AuthState>(
    () => ({ status, session, profile, profileError, signIn, signOut, changePassword, updateProfile, refreshProfile }),
    [status, session, profile, profileError, signIn, signOut, changePassword, updateProfile, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
