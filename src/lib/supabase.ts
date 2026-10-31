/**
 * Single shared Supabase client.
 * Returns null when env vars are missing so the app shell still renders
 * (pages show a "not configured" state instead of crashing).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from './env';

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(env.supabaseUrl!, env.supabaseAnonKey!, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;

/** Use inside data hooks: throws a clear error instead of a null-reference crash. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error('Supabase is not configured. Copy .env.example to .env and fill in the values.');
  }
  return supabase;
}
