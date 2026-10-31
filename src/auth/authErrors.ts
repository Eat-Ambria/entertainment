/**
 * Turns Supabase Auth / network errors into short, guest-safe messages.
 * Never shows raw server text on screen.
 */
interface ErrorLike {
  status?: number;
  code?: string;
  message?: string;
}

export function authErrorMessage(error: unknown): string {
  const e = (error ?? {}) as ErrorLike;
  const code = e.code ?? '';
  const msg = (e.message ?? '').toLowerCase();

  if (e.status === 429 || code.startsWith('over_') || msg.includes('rate limit')) {
    return 'Too many attempts. Please wait a minute and try again.';
  }
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return 'Phone number or password is incorrect.';
  }
  if (code === 'same_password') {
    return 'New password must be different from your current password.';
  }
  if (code === 'weak_password' || msg.includes('password should be at least')) {
    return 'Password must be at least 6 characters.';
  }
  if (code === 'user_banned') {
    return 'This account has been disabled. Please contact your administrator.';
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Cannot reach the server. Check your internet connection.';
  }
  return 'Something went wrong. Please try again.';
}
