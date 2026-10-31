/**
 * TanStack Query hooks for packages, tiers and the element picker.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { packagesApi, type PackageInput, type PackageListParams } from './packagesApi';

export const packageKeys = {
  all: ['packages'] as const,
  list: (p: PackageListParams) => ['packages', 'list', p] as const,
  detail: (id: string) => ['packages', 'detail', id] as const,
  tiers: ['tiers'] as const,
  picker: (ids: string[]) => ['elements', 'picker', ids] as const,
};

export function usePackageList(params: PackageListParams) {
  return useQuery({
    queryKey: packageKeys.list(params),
    queryFn: () => packagesApi.list(params),
    placeholderData: keepPreviousData,
  });
}

export function usePackage(id: string | null) {
  return useQuery({
    queryKey: packageKeys.detail(id ?? ''),
    queryFn: () => packagesApi.get(id!),
    enabled: Boolean(id),
  });
}

export function useTiers() {
  return useQuery({ queryKey: packageKeys.tiers, queryFn: () => packagesApi.tiers(), staleTime: 10 * 60_000 });
}

export function usePickerElements(includeIds: string[], enabled = true) {
  return useQuery({
    queryKey: packageKeys.picker(includeIds),
    queryFn: () => packagesApi.pickerElements(includeIds),
    enabled,
  });
}

export function useSavePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string | null; input: PackageInput }) => packagesApi.save(v.id, v.input),
    onSuccess: () => qc.invalidateQueries({ queryKey: packageKeys.all }),
  });
}

export function useSetPackageActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; active: boolean }) => packagesApi.setActive(v.id, v.active),
    onSuccess: () => qc.invalidateQueries({ queryKey: packageKeys.all }),
  });
}

export function useDeletePackage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => packagesApi.remove(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: packageKeys.all });
      void qc.invalidateQueries({ queryKey: ['studio', 'packages'] });
    },
  });
}
