/**
 * Press ripple for every clickable thing inside a layout (links, buttons, tabs, menu items) without
 * touching each component: one pointerdown listener on the layout root adds a short-lived ripple
 * (CSS `.ripple`, transform + opacity only) to the pressed element and removes it when done.
 * Elements that draw their own ripple (Button, TabButton) carry `data-own-ripple` and are skipped.
 * The ripple sits in its own clipped layer, so the host's overflow/layout is never changed (only a
 * `position: static` host is made relative).
 */
import { useEffect, type RefObject } from 'react';

const TARGETS = 'a[href], button, [role="tab"], [role="menuitem"], summary';

export function useGlobalRipple(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const host = (e.target as Element | null)?.closest<HTMLElement>(TARGETS);
      if (!host || !el.contains(host) || host.closest('[data-own-ripple]')) return;
      if ((host as HTMLButtonElement).disabled || host.getAttribute('aria-disabled') === 'true') return;

      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      const r = host.getBoundingClientRect();
      const size = Math.max(r.width, r.height) * 2.2;

      const layer = document.createElement('span');
      layer.setAttribute('aria-hidden', 'true');
      layer.style.cssText = 'position:absolute;inset:0;overflow:hidden;border-radius:inherit;pointer-events:none;';
      const wave = document.createElement('span');
      wave.className = 'ripple';
      wave.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px;z-index:0;`;
      layer.appendChild(wave);
      host.appendChild(layer);
      wave.addEventListener('animationend', () => layer.remove(), { once: true });
      window.setTimeout(() => layer.remove(), 2000); // safety net if animations are disabled
    };

    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
  }, [root]);
}
