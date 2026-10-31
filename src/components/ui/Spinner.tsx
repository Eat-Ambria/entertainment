/**
 * Loading indicator, inline or full-area.
 */
export function Spinner({ label = 'Loading…', full = false }: { label?: string; full?: boolean }) {
  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-3 text-sm text-slate-500 ${full ? 'min-h-[40vh]' : 'py-6'}`}
    >
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      <span>{label}</span>
    </div>
  );
}
