/**
 * Hook binding pagination state to the URL query string. Changing the page (or page size)
 * scrolls the page content back to the top, so the new page starts at its first row.
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parsePageState, type PageState } from './pagination';

/** Scroll the scrolling page area (Workspace <main>, else the window) back to the top. */
function scrollToTop() {
  const main = document.querySelector('main');
  if (main && main.scrollHeight > main.clientHeight && typeof main.scrollTo === 'function') main.scrollTo({ top: 0, behavior: 'smooth' });
  else if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function usePagination(): PageState & {
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
} {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => parsePageState(params), [params]);

  const setPage = useCallback(
    (page: number) => {
      scrollToTop();
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('page', String(page));
        return next;
      });
    },
    [setParams],
  );

  const setPageSize = useCallback(
    (size: number) => {
      scrollToTop();
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set('size', String(size));
        next.set('page', '1');
        return next;
      });
    },
    [setParams],
  );

  return { ...state, setPage, setPageSize };
}
