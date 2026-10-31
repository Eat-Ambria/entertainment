/**
 * Search box bound to a URL query param (?q=…), debounced so typing doesn't fire a request
 * per key. Only a change in what the user typed is pushed to the URL — so clearing filters
 * can't be undone a moment later by a still-pending debounce.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from './debounce';

export function useUrlSearch(key = 'q', delayMs = 300) {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? '';
  const [input, setInput] = useState(value);
  const debounced = useDebouncedValue(input, delayMs);
  const lastPushed = useRef(value);

  useEffect(() => {
    const next = debounced.trim();
    if (next === lastPushed.current) return;
    lastPushed.current = next;
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next) p.set(key, next);
      else p.delete(key);
      p.delete('page');
      return p;
    });
  }, [debounced, key, setParams]);

  /** Empty the box without pushing anything (the caller clears the URL itself). */
  const reset = useCallback(() => {
    lastPushed.current = '';
    setInput('');
  }, []);

  return { input, setInput, value, reset };
}
