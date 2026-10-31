/**
 * Inline form-level message (error or success). `dark` for the Studio stage panels.
 */
import { Icon } from './Icon';

export function FormAlert({ tone = 'error', dark = false, children }: { tone?: 'error' | 'success'; dark?: boolean; children: string }) {
  const styles = dark
    ? tone === 'error'
      ? 'border-rose-400/30 bg-rose-500/10 text-rose-200 backdrop-blur-md'
      : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200 backdrop-blur-md'
    : tone === 'error'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${styles}`}>
      <Icon name={tone === 'error' ? 'alert' : 'check'} size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
