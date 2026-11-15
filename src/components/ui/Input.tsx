import * as React from 'react';
import { cn } from '@/src/lib/utils';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  requiredMark?: boolean;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, requiredMark, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('block text-xs font-medium text-[var(--text-primary)] mb-1.5', className)}
      {...props}
    >
      {children}
      {requiredMark && (
        <span className="text-[var(--danger-text)] ml-0.5" aria-hidden="true">
          *
        </span>
      )}
    </label>
  )
);
Label.displayName = 'Label';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  hint?: string;
  leftAdornment?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, hint, leftAdornment, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    return (
      <div className="w-full">
        <div className="relative flex items-center">
          {leftAdornment && (
            <div className="pointer-events-none absolute left-3 text-[var(--text-muted)]">
              {leftAdornment}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? errorId : hint ? hintId : undefined}
            className={cn(
              'h-10 w-full rounded-xl border bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all shadow-2xs',
              leftAdornment ? 'pl-9' : '',
              error
                ? 'border-[var(--danger-border)] focus-visible:ring-2 focus-visible:ring-rose-500/25 focus-visible:border-rose-500'
                : 'border-[var(--border-strong)] hover:border-[var(--text-muted)] focus-visible:ring-2 focus-visible:ring-indigo-500/25 focus-visible:border-indigo-500',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              className
            )}
            {...props}
          />
        </div>
        {error ? (
          <p id={errorId} role="alert" className="mt-1.5 text-xs text-[var(--danger-text)]">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="mt-1.5 text-xs text-[var(--text-muted)]">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
  hint?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, hint, id, rows = 3, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const errorId = `${inputId}-error`;
    const hintId = `${inputId}-hint`;

    return (
      <div className="w-full">
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn(
            'w-full rounded-xl border bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-all shadow-2xs',
            error
              ? 'border-[var(--danger-border)] focus-visible:ring-2 focus-visible:ring-rose-500/25 focus-visible:border-rose-500'
              : 'border-[var(--border-strong)] hover:border-[var(--text-muted)] focus-visible:ring-2 focus-visible:ring-indigo-500/25 focus-visible:border-indigo-500',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            className
          )}
          {...props}
        />
        {error ? (
          <p id={errorId} role="alert" className="mt-1.5 text-xs text-[var(--danger-text)]">
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="mt-1.5 text-xs text-[var(--text-muted)]">
            {hint}
          </p>
        ) : null}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
