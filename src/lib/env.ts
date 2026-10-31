/**
 * Typed access to Vite env variables.
 * Only public values belong here — the Supabase URL and anon key are safe
 * in the browser; LMS settings and service-role keys live in Edge Function secrets.
 */
export const env = {
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
