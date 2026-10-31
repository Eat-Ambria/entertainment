/**
 * Supabase Storage helpers: per-user upload paths, file validation, cached signed URLs.
 * Buckets are private; every image is shown through a short-lived signed URL.
 * prefetchSignedUrls signs many paths in one request (and can preload the images) so lists
 * of cards don't wait on one request per image.
 */
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { requireSupabase, supabase } from './supabase';

export type Bucket = 'element-images' | 'package-images' | 'brand';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const LOGO_TYPES = [...IMAGE_TYPES, 'image/svg+xml'] as const;
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const SIGNED_URL_SECONDS = 60 * 60;

/** Returns an error message, or null if the file is acceptable. */
export function validateImage(file: File, allowed: readonly string[] = IMAGE_TYPES): string | null {
  if (!allowed.includes(file.type)) return 'Use a JPG, PNG or WebP image.';
  if (file.size > MAX_IMAGE_BYTES) return 'Image must be 2 MB or smaller.';
  return null;
}

/** `<userId>/<folder>/<timestamp>.<ext>` — the first segment must be the user id (storage RLS). */
export function userFilePath(userId: string, folder: string, file: File, now = Date.now()): string {
  const ext = (file.name.split('.').pop() ?? 'img').toLowerCase().replace(/[^a-z0-9]/g, '') || 'img';
  return `${userId}/${folder}/${now}.${ext}`;
}

export async function uploadImage(bucket: Bucket, path: string, file: File): Promise<string> {
  const { error } = await requireSupabase().storage.from(bucket).upload(path, file, {
    upsert: false,
    contentType: file.type,
    cacheControl: '3600',
  });
  if (error) throw error;
  return path;
}

/** Best-effort clean-up of an image that is no longer referenced. Never throws. */
export async function removeImage(bucket: Bucket, path: string | null | undefined): Promise<void> {
  if (!path || !supabase) return;
  try {
    await supabase.storage.from(bucket).remove([path]);
  } catch {
    // An orphaned file is harmless; the delete itself already succeeded.
  }
}

/** Signs every path not cached yet in ONE request and seeds useSignedUrl's cache. Never throws. */
export async function prefetchSignedUrls(
  qc: QueryClient,
  bucket: Bucket,
  paths: readonly (string | null | undefined)[],
  { preload = false }: { preload?: boolean } = {},
): Promise<void> {
  if (!supabase) return;
  const todo = [...new Set(paths.filter((p): p is string => Boolean(p)))].filter((p) => qc.getQueryData(['signed-url', bucket, p]) === undefined);
  if (todo.length === 0) return;
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(todo, SIGNED_URL_SECONDS);
    if (error || !data) return;
    for (const d of data) {
      if (!d.path || !d.signedUrl) continue;
      qc.setQueryData(['signed-url', bucket, d.path], d.signedUrl);
      if (preload) {
        const img = new Image();
        img.decoding = 'async';
        img.src = d.signedUrl;
      }
    }
  } catch {
    // Cards fall back to signing their own image.
  }
}

export function useSignedUrl(bucket: Bucket, path: string | null | undefined) {
  return useQuery({
    queryKey: ['signed-url', bucket, path],
    enabled: Boolean(path && supabase),
    staleTime: (SIGNED_URL_SECONDS - 300) * 1000,
    queryFn: async () => {
      const { data, error } = await requireSupabase().storage.from(bucket).createSignedUrl(path!, SIGNED_URL_SECONDS);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}
