/**
 * TanStack Query hooks for elements. Keeps the previous page on screen while the next
 * one loads, and refreshes lists after any change.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { elementsApi, type ElementInput, type ElementListParams } from './elementsApi';

export const elementKeys = {
  all: ['elements'] as const,
  list: (p: ElementListParams) => ['elements', 'list', p] as const,
  history: (id: string) => ['elements', 'history', id] as const,
};

export function useElementList(params: ElementListParams) {
  return useQuery({
    queryKey: elementKeys.list(params),
    queryFn: () => elementsApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function useElementRateHistory(id: string | null) {
  return useQuery({
    queryKey: elementKeys.history(id ?? ''),
    queryFn: () => elementsApi.rateHistory(id!),
    enabled: Boolean(id),
  });
}

export function useSaveElement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string | null; input: ElementInput; reason: string | null }) =>
      v.id ? elementsApi.update(v.id, v.input, v.reason) : elementsApi.create(v.input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: elementKeys.all });
      void qc.invalidateQueries({ queryKey: ['studio'] }); // Guest Studio element lists / package lines
    },
  });
}

export function useSetElementActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; active: boolean }) => elementsApi.setActive(v.id, v.active),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: elementKeys.all });
      void qc.invalidateQueries({ queryKey: ['studio'] }); // Guest Studio element lists / package lines
    },
  });
}

export function useDeleteElement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => elementsApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: elementKeys.all });
      void qc.invalidateQueries({ queryKey: ['packages'] });
      void qc.invalidateQueries({ queryKey: ['studio'] });
    },
  });
}
