/**
 * TanStack Query hooks for the Quote Ledger.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { quoteLedgerApi, type LedgerParams, type QuoteStatus } from './quoteLedgerApi';

export function useLedger(params: LedgerParams) {
  return useQuery({ queryKey: ['quotes', 'ledger', params], queryFn: () => quoteLedgerApi.list(params), placeholderData: keepPreviousData });
}

export function useLedgerPackages() {
  return useQuery({ queryKey: ['quotes', 'ledger-packages'], queryFn: () => quoteLedgerApi.packages(), staleTime: 5 * 60_000 });
}

export function useQuoteInternal(id: string | undefined) {
  return useQuery({ queryKey: ['quotes', 'internal', id], queryFn: () => quoteLedgerApi.internal(id!), enabled: Boolean(id) });
}

export function useSetQuoteStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status: QuoteStatus }) => quoteLedgerApi.setStatus(v.id, v.status),
    onSuccess: (_r, v) => {
      void qc.invalidateQueries({ queryKey: ['quotes'] });
      void qc.invalidateQueries({ queryKey: ['studio', 'quote', v.id] });
    },
  });
}
