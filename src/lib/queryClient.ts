/**
 * TanStack Query client: caching + request de-duplication for all Supabase reads.
 * 429 (rate limited) and 4xx errors are not retried; network/5xx get one retry.
 */
import { QueryClient } from '@tanstack/react-query';

function statusOf(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'status' in error) {
    const s = (error as { status: unknown }).status;
    return typeof s === 'number' ? s : undefined;
  }
  return undefined;
}

export function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = statusOf(error);
  if (status !== undefined && status >= 400 && status < 500) return false;
  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: shouldRetry,
    },
    mutations: { retry: false },
  },
});
