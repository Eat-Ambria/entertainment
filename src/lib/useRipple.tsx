/**
 * Material-style ripple: a soft circle that spreads from where the element was pressed and fades
 * (CSS `.ripple`, transform + opacity only). Rendered by React (no DOM poking); each ripple
 * removes itself when its animation ends. The host needs `relative overflow-hidden`.
 */
import { useCallback, useState, type PointerEvent } from 'react';

interface Wave {
  id: number;
  x: number;
  y: number;
  size: number;
}

let seq = 0;

export function useRipple() {
  const [waves, setWaves] = useState<Wave[]>([]);

  const onPointerDown = useCallback((e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    setWaves((w) => [...w.slice(-3), { id: ++seq, x: e.clientX - r.left - size / 2, y: e.clientY - r.top - size / 2, size }]);
  }, []);

  const ripples = waves.map((w) => (
    <span
      key={w.id}
      aria-hidden="true"
      className="ripple"
      style={{ left: w.x, top: w.y, width: w.size, height: w.size }}
      onAnimationEnd={() => setWaves((all) => all.filter((x) => x.id !== w.id))}
    />
  ));

  return { onPointerDown, ripples };
}
