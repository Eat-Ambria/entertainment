/**
 * Live countdown to the guest's event (Days · Hours · Minutes · Seconds), shown on the stage.
 * Counts to the start of the event day in India. Ticks once a second and cleans up its timer;
 * shows "Today" / "Celebrated" when the day has come or gone.
 */
import { useEffect, useState } from 'react';

function partsUntil(target: number, now: number) {
  const ms = Math.max(target - now, 0);
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor(ms / 3_600_000) % 24,
    minutes: Math.floor(ms / 60_000) % 60,
    seconds: Math.floor(ms / 1000) % 60,
  };
}

export function EventCountdown({ date, size = 'md' }: { date: string | null | undefined; size?: 'sm' | 'md' }) {
  const [now, setNow] = useState(() => Date.now());
  const target = date ? Date.parse(`${date}T00:00:00+05:30`) : NaN;
  const valid = Number.isFinite(target);

  useEffect(() => {
    if (!valid) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [valid]);

  if (!valid) return null;
  const dayMs = 86_400_000;
  if (now >= target) {
    return (
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand-300">{now < target + dayMs ? 'The big day is today' : 'Celebrated'}</p>
    );
  }
  const p = partsUntil(target, now);
  const items: [number, string][] = [
    [p.days, 'Days'],
    [p.hours, 'Hours'],
    [p.minutes, 'Minutes'],
    [p.seconds, 'Seconds'],
  ];
  const big = size === 'md' ? 'text-3xl sm:text-4xl' : 'text-2xl';
  return (
    <dl className="flex gap-6 sm:gap-8" aria-label="Time until the event">
      {items.map(([n, label]) => (
        <div key={label}>
          <dt className="sr-only">{label}</dt>
          <dd className={`num font-display ${big} leading-none text-ivory`}>{String(n).padStart(2, '0')}</dd>
          <p className="mt-1 text-xs text-ivory/55" aria-hidden="true">
            {label}
          </p>
        </div>
      ))}
    </dl>
  );
}
