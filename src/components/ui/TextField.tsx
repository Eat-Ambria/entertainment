/**
 * Labelled input with hint/error text, optional prefix (e.g. "+91") and
 * a show/hide toggle for passwords. `tone="dark"` = dark glass for the Guest Studio stage.
 */
import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon } from './Icon';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  prefix?: string;
  revealable?: boolean;
  tone?: 'light' | 'dark';
}

export function TextField({ label, error, hint, prefix, revealable, tone = 'light', type = 'text', id, className = '', ...rest }: TextFieldProps) {
  const dark = tone === 'dark';
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  const [revealed, setRevealed] = useState(false);
  const inputType = revealable ? (revealed ? 'text' : 'password') : type;

  return (
    <div className={className}>
      <label htmlFor={inputId} className={`mb-1.5 block text-sm font-medium ${dark ? 'text-ivory/80' : 'text-slate-700'}`}>
        {label}
      </label>
      <div
        className={`flex items-stretch overflow-hidden rounded-lg border shadow-sm transition-colors duration-150 focus-within:ring-2 ${
          dark ? 'bg-white/5 hover:bg-white/7' : 'bg-white'
        } ${
          error
            ? 'border-rose-400 focus-within:ring-rose-200'
            : dark
              ? 'border-white/15 focus-within:border-brand-300 focus-within:ring-brand-300/25'
              : 'border-slate-300 focus-within:border-brand-500 focus-within:ring-brand-100'
        }`}
      >
        {prefix && (
          <span
            className={`flex items-center border-r px-3 text-sm ${dark ? 'border-white/10 bg-white/5 text-ivory/55' : 'border-slate-200 bg-slate-50 text-slate-500'}`}
          >
            {prefix}
          </span>
        )}
        <input
          id={inputId}
          type={inputType}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm outline-none ${
            dark ? 'text-ivory scheme-dark placeholder:text-ivory/35' : 'text-slate-900 placeholder:text-slate-400'
          }`}
          {...rest}
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="flex items-center px-3 text-slate-400 hover:text-slate-600"
            aria-label={revealed ? 'Hide password' : 'Show password'}
          >
            <Icon name={revealed ? 'eye' : 'eyeOff'} size={18} />
          </button>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className={`mt-1.5 text-sm ${dark ? 'text-rose-300' : 'text-rose-600'}`}>
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className={`mt-1.5 text-xs ${dark ? 'text-ivory/50' : 'text-slate-500'}`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
