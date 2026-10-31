/**
 * Auth context + useAuth() hook. The provider lives in AuthProvider.tsx.
 */
import { createContext, useContext } from 'react';
import type { AuthState } from './types';

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
