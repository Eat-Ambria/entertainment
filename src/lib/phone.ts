/**
 * Phone helpers for login. Mirrors public.normalize_phone() / phone_login_email() in
 * supabase/migrations/0003 — keep both in sync.
 * The internal email is only passed to Supabase Auth; it is never shown in the UI.
 */
export const PHONE_LOGIN_DOMAIN = 'phone.invalid';

/** Returns the 10-digit Indian mobile number, or null if it isn't one. */
export function normalizePhone(input: string): string | null {
  const d = input.replace(/\D/g, '');
  if (/^[6-9]\d{9}$/.test(d)) return d;
  if (/^91[6-9]\d{9}$/.test(d)) return d.slice(2);
  if (/^0[6-9]\d{9}$/.test(d)) return d.slice(1);
  return null;
}

export function phoneToLoginEmail(input: string): string | null {
  const phone = normalizePhone(input);
  return phone ? `${phone}@${PHONE_LOGIN_DOMAIN}` : null;
}

/** "9876543210" -> "98765 •••10" — for lists shown in front of other guests. */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.length === 10 ? `${phone.slice(0, 5)} •••${phone.slice(8)}` : '•••';
}

/** "9876543210" -> "98765 43210" for display. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.length === 10 ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
}
