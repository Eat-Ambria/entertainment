/**
 * Thin wrapper over Supabase Auth + profiles. Everything auth-related goes through here,
 * so tests can mock one module instead of the whole Supabase client.
 */
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { requireSupabase } from '@/lib/supabase';
import { phoneToLoginEmail } from '@/lib/phone';
import type { EditableProfile, Profile } from './types';

const PROFILE_COLUMNS = [
  'id',
  'phone',
  'full_name',
  'business_name',
  'logo_path',
  'hero_image_path',
  'performer_photo_paths',
  'contact_line',
  'lms_logged_user_id',
  'must_change_password',
];
/** Columns added by later migrations, newest first, with the value to use while they are missing. */
const OPTIONAL_COLUMNS: [string, unknown][] = [
  ['performer_photo_paths', []], // 0029
  ['hero_image_path', null], // 0028
];

export class InvalidPhoneError extends Error {
  constructor() {
    super('Enter a valid 10-digit mobile number.');
    this.name = 'InvalidPhoneError';
  }
}

export const authApi = {
  async getSession(): Promise<Session | null> {
    const { data, error } = await requireSupabase().auth.getSession();
    if (error) throw error;
    return data.session;
  },

  onAuthStateChange(cb: (event: AuthChangeEvent, session: Session | null) => void): () => void {
    const { data } = requireSupabase().auth.onAuthStateChange(cb);
    return () => data.subscription.unsubscribe();
  },

  async signIn(phone: string, password: string): Promise<Session> {
    const email = phoneToLoginEmail(phone);
    if (!email) throw new InvalidPhoneError();
    const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.session;
  },

  async signOut(): Promise<void> {
    const { error } = await requireSupabase().auth.signOut();
    if (error) throw error;
  },

  /** Verifies the current password by signing in again, then sets the new one. */
  async changePassword(phone: string, currentPassword: string, newPassword: string): Promise<void> {
    await authApi.signIn(phone, currentPassword);
    const sb = requireSupabase();
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) throw error;
    const { error: rpcError } = await sb.rpc('mark_password_changed');
    if (rpcError) throw rpcError;
  },

  async fetchProfile(userId: string): Promise<Profile> {
    const sb = requireSupabase();
    let columns = PROFILE_COLUMNS;
    const missing: Record<string, unknown> = {};
    // A database without the latest migrations must still sign in: drop the newest optional
    // column on "column does not exist" (42703) and retry.
    for (let dropped = 0; ; dropped++) {
      const { data, error } = await sb.from('profiles').select(columns.join(', ')).eq('id', userId).single();
      if (!error) return { ...missing, ...(data as unknown as Profile) } as Profile;
      const next = OPTIONAL_COLUMNS[dropped];
      if (error.code !== '42703' || !next) throw error;
      columns = columns.filter((c) => c !== next[0]);
      missing[next[0]] = next[1];
    }
  },

  async updateProfile(userId: string, patch: Partial<EditableProfile>): Promise<void> {
    const { error } = await requireSupabase().from('profiles').update(patch).eq('id', userId);
    if (error) throw error;
  },
};
