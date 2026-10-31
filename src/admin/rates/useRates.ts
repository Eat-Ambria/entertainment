/**
 * TanStack Query hooks for Rate History.
 */
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LOG_PAGE, ratesApi, type VendorEntryInput } from './ratesApi';

export function useVendorLatest(p: { elementId: string | null; vendorId: string | null; page: number; pageSize: number }) {
  return useQuery({ queryKey: ['rates', 'vendor-latest', p], queryFn: () => ratesApi.vendorLatest(p), placeholderData: keepPreviousData });
}

/** Every purchase (voided too) of one element from one vendor — the expanded history. */
export function useVendorPairHistory(elementId: string, vendorId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['rates', 'vendor', { elementId, vendorId, page: 1, pageSize: 100 }],
    queryFn: () => ratesApi.vendorHistory({ elementId, vendorId, page: 1, pageSize: 100 }),
    enabled,
  });
}

export function useVendorHistory(p: { elementId: string | null; vendorId: string | null; page: number; pageSize: number }) {
  return useQuery({ queryKey: ['rates', 'vendor', p], queryFn: () => ratesApi.vendorHistory(p), placeholderData: keepPreviousData });
}

export function useRateLogs(type: 'master_rate' | 'quote_override', enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['rates', 'logs', type],
    enabled,
    initialPageParam: null as { at: string; id: string } | null,
    queryFn: ({ pageParam }) => ratesApi.logs(type, pageParam),
    getNextPageParam: (last) => {
      const tail = last.at(-1);
      return last.length === LOG_PAGE && tail ? { at: tail.changed_at, id: tail.id } : undefined;
    },
  });
}

export function useVendors() {
  return useQuery({ queryKey: ['rates', 'vendors'], queryFn: () => ratesApi.vendors() });
}

export function useRateElements() {
  return useQuery({ queryKey: ['elements', 'rate-picker'], queryFn: () => ratesApi.elements() });
}

export function useAddVendorEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { input: VendorEntryInput; newVendorName: string | null }) => addWithVendor(v.input, v.newVendorName),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rates'] }),
  });
}

async function addWithVendor(input: VendorEntryInput, newVendorName: string | null) {
  const vendorId = newVendorName ? (await ratesApi.createVendor(newVendorName)).id : input.vendor_id;
  await ratesApi.addEntry({ ...input, vendor_id: vendorId });
}

export function useVoidVendorEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; reason: string }) => ratesApi.voidEntry(v.id, v.reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rates'] }),
  });
}
