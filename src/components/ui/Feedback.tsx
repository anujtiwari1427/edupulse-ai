import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useUIStore } from '@/src/app/store';
import { Button } from './Button';

export type StatusTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const toneClasses: Record<StatusTone, string> = {
  neutral: 'text-[var(--text-secondary)] bg-[var(--bg-subtle)] border-[var(--border-hairline)]',
  brand:
    'text-indigo-700 dark:text-indigo-400 bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/60 shadow-xs',
  success:
    'text-emerald-700 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 shadow-xs',
  warning:
    'text-amber-700 dark:text-amber-400 bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/60 shadow-xs',
  danger:
    'text-rose-700 dark:text-rose-400 bg-rose-50/80 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60 shadow-xs',
  info:
    'text-blue-700 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800/60 shadow-xs',
};

export interface BadgeProps {
  tone?: StatusTone;
  icon?: React.ReactNode;
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', icon, dot = false, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-tight whitespace-nowrap shrink-0 transition-colors',
        toneClasses[tone],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full shrink-0',
            tone === 'brand' && 'bg-indigo-500 animate-pulse',
            tone === 'success' && 'bg-emerald-500',
            tone === 'warning' && 'bg-amber-500',
            tone === 'danger' && 'bg-rose-500',
            tone === 'info' && 'bg-blue-500',
            tone === 'neutral' && 'bg-slate-400'
          )}
          aria-hidden="true"
        />
      )}
      {icon}
      {children}
    </span>
  );
}

export interface AlertProps {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

const alertIcons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
};

export function Alert({ tone = 'info', title, children, action, className }: AlertProps) {
  const Icon = alertIcons[tone];
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cn(
        'flex flex-col sm:flex-row sm:items-start justify-between gap-3 rounded-xl border p-4 text-sm',
        toneClasses[tone],
        className
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        <Icon className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          {title && <div className="font-semibold text-[var(--text-primary)]">{title}</div>}
          <div className="text-xs leading-relaxed mt-0.5">{children}</div>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export interface ProgressProps {
  value: number;
  label?: string;
  className?: string;
}

export function Progress({ value, label, className }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('w-full space-y-1.5', className)}>
      {label && (
        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span>{label}</span>
          <span className="font-mono tabular-nums">{Math.round(clamped)}%</span>
        </div>
      )}
      <ProgressPrimitive.Root
        value={clamped}
        className="relative h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-muted)]"
      >
        <ProgressPrimitive.Indicator
          className="h-full bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-700 transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${100 - clamped}%)` }}
        />
      </ProgressPrimitive.Root>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-lg bg-[var(--bg-muted)]', className)}
    />
  );
}

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-strong)] bg-gradient-to-b from-[var(--bg-surface)] to-[var(--bg-subtle)] px-6 py-14 text-center shadow-xs',
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/50 shadow-xs">
        {icon}
      </div>
      <h3 className="mt-4 text-base font-semibold text-[var(--text-primary)] tracking-tight">{title}</h3>
      <p className="mt-1.5 max-w-md text-xs text-[var(--text-secondary)] leading-relaxed">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ToastRegion() {
  const toasts = useUIStore((s) => s.toasts);
  const dismissToast = useUIStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="no-print fixed bottom-16 md:bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
    >
      {toasts.map((toast) => {
        const tone: StatusTone =
          toast.variant === 'default'
            ? 'neutral'
            : toast.variant === 'success'
              ? 'success'
              : toast.variant === 'warning'
                ? 'warning'
                : 'danger';
        return (
          <div
            key={toast.id}
            className={cn(
              'flex items-start justify-between gap-3 rounded-xl border bg-[var(--bg-surface)] p-3.5 shadow-lg',
              tone === 'neutral' ? 'border-[var(--border-hairline)]' : toneClasses[tone]
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-[var(--text-primary)]">{toast.title}</div>
              {toast.description && (
                <div className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  {toast.description}
                </div>
              )}
              {toast.actionLabel && toast.onAction && (
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      toast.onAction?.();
                      dismissToast(toast.id);
                    }}
                  >
                    {toast.actionLabel}
                  </Button>
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(toast.id)}
              className="rounded-md p-1 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
