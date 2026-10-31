/**
 * Auth + profile types shared by the provider, guards and pages.
 */
import type { Session } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  phone: string | null;
  full_name: string | null;
  business_name: string | null;
  logo_path: string | null;
  /** Guest Studio background photo (brand bucket); null = the designed concert stage. */
  hero_image_path: string | null;
  /** Up to 6 photos of guests performing at the venue (brand bucket), cycled on the landing. */
  performer_photo_paths: string[];
  contact_line: string | null;
  lms_logged_user_id: string | null;
  must_change_password: boolean;
}

export type EditableProfile = Pick<Profile, 'full_name' | 'business_name' | 'contact_line' | 'lms_logged_user_id' | 'logo_path' | 'hero_image_path' | 'performer_photo_paths'>;

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'unconfigured';

export interface AuthState {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  profileError: string | null;
  signIn: (phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateProfile: (patch: Partial<EditableProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}
