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
    'text-[var(--brand-700)] dark:text-[var(--brand-500)] bg-[var(--brand-50)] border-[var(--brand-100)]',
  success: 'text-[var(--success-text)] bg-[var(--success-bg)] border-[var(--success-border)]',
  warning: 'text-[var(--warning-text)] bg-[var(--warning-bg)] border-[var(--warning-border)]',
  danger: 'text-[var(--danger-text)] bg-[var(--danger-bg)] border-[var(--danger-border)]',
  info: 'text-[var(--info-text)] bg-[var(--info-bg)] border-[var(--info-border)]',
};

export interface BadgeProps {
  tone?: StatusTone;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ tone = 'neutral', icon, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0',
        toneClasses[tone],
        className
      )}
    >
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
        className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--bg-muted)]"
      >
        <ProgressPrimitive.Indicator
          className="h-full bg-[#4338ca] transition-transform duration-200"
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
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] px-6 py-12 text-center',
        className
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--bg-subtle)] text-[var(--text-secondary)]">
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
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
