import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-indigo-600 via-indigo-600 to-indigo-700 hover:from-indigo-500 hover:via-indigo-600 hover:to-indigo-700 active:from-indigo-700 active:to-indigo-800 text-white border border-indigo-400/30 shadow-sm shadow-indigo-500/25 dark:from-indigo-500 dark:via-indigo-600 dark:to-indigo-600 dark:hover:from-indigo-400 dark:hover:to-indigo-500 dark:shadow-indigo-900/40',
  secondary:
    'bg-[var(--bg-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-muted)] border border-[var(--border-hairline)] hover:border-[var(--border-strong)] shadow-xs',
  outline:
    'bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] border border-[var(--border-strong)] hover:border-[var(--text-muted)] active:bg-[var(--bg-muted)]',
  ghost:
    'bg-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] border border-transparent active:bg-[var(--bg-muted)]',
  danger:
    'bg-[var(--danger-bg)] text-[var(--danger-text)] hover:opacity-95 active:opacity-90 border border-[var(--danger-border)] shadow-xs',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-xs rounded-lg gap-1.5 font-medium',
  md: 'h-10 px-4 text-sm rounded-lg gap-2 font-medium',
  lg: 'h-11 px-5 text-sm rounded-xl gap-2.5 font-medium',
  icon: 'h-10 w-10 rounded-lg p-0 justify-center',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled,
      leftIcon,
      rightIcon,
      children,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap shrink-0 transition-all duration-150 select-none cursor-pointer active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : leftIcon}
        {children}
        {!loading && rightIcon}
      </button>
    );
  }
);
Button.displayName = 'Button';
