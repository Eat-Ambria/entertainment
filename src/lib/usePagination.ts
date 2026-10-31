/**
 * Hook binding pagination state to the URL query string.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parsePageState, type PageState } from './pagination';

export function usePagination(): PageState & {
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
} {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => parsePageState(params), [params]);

  const setPage = useCallback(
    (page: number) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('page', String(page));
        return next;
      }),
    [setParams],
  );

  const setPageSize = useCallback(
    (size: number) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('size', String(size));
        next.set('page', '1');
        return next;
      }),
    [setParams],
  );

  return { ...state, setPage, setPageSize };
}
