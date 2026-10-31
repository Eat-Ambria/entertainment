/**
 * Labelled <select> with placeholder, hint and error text — matches TextField styling
 * (including `tone="dark"` for the Guest Studio stage).
 */
import { useId, type SelectHTMLAttributes } from 'react';

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  error?: string | null;
  hint?: string;
  tone?: 'light' | 'dark';
}

export function SelectField({ label, options, placeholder, error, hint, tone = 'light', id, className = '', ...rest }: SelectFieldProps) {
  const dark = tone === 'dark';
  const autoId = useId();
  const selectId = id ?? autoId;
  const describedBy = error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={selectId} className={`mb-1.5 block text-sm font-medium ${dark ? 'text-ivory/80' : 'text-slate-700'}`}>
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`w-full rounded-lg border px-3 py-2.5 text-sm shadow-sm outline-none transition-colors duration-150 focus:ring-2 ${
          dark
            ? 'bg-white/5 text-ivory scheme-dark hover:bg-white/7 disabled:bg-white/3 disabled:text-ivory/35 [&>option]:bg-stage-900'
            : 'bg-white text-slate-900 disabled:bg-slate-50 disabled:text-slate-400'
        } ${
          error
            ? 'border-rose-400 focus:ring-rose-200'
            : dark
              ? 'border-white/15 focus:border-brand-300 focus:ring-brand-300/25'
              : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'
        }`}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${selectId}-error`} className={`mt-1.5 text-sm ${dark ? 'text-rose-300' : 'text-rose-600'}`}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${selectId}-hint`} className={`mt-1.5 text-xs ${dark ? 'text-ivory/50' : 'text-slate-500'}`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
