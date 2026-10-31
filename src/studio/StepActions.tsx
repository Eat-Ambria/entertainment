/**
 * The floating action bar at the bottom of each Guest Studio step: Back on the left, a short
 * summary in the middle, the next action on the right. Stays in view while scrolling.
 * `stage` = dark glass for steps that sit on the stage; `paper` = white for steps inside a panel.
 */
import type { ReactNode } from 'react';

export function StepActions({
  back,
  summary,
  next,
  tone = 'paper',
}: {
  back?: ReactNode;
  summary?: ReactNode;
  next: ReactNode;
  tone?: 'paper' | 'stage';
}) {
  const surface =
    tone === 'stage'
      ? 'border-white/10 bg-stage-900/85 text-ivory shadow-black/50'
      : 'border-stone-200 bg-white/95 text-slate-900 shadow-black/30';
  return (
    <div className={`sticky bottom-4 z-10 flex flex-col gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-5 ${surface}`}>
      <div className="flex items-center justify-between gap-3 sm:justify-start">
        {back}
        {summary && <div className={`min-w-0 text-sm ${tone === 'stage' ? 'text-ivory/65' : 'text-slate-500'}`}>{summary}</div>}
      </div>
      <div className="flex justify-end">{next}</div>
    </div>
  );
}
