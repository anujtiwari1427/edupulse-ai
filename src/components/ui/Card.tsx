import * as React from 'react';
import { cn } from '@/src/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export function Card({
  className,
  children,
  hoverable = false,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-xs transition-all duration-200',
        hoverable && 'hover:shadow-md hover:border-[var(--border-strong)] hover:-translate-y-0.5',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-hairline)] px-5 py-4',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn('text-sm font-semibold text-[var(--text-primary)] tracking-tight', className)}
      {...props}
    >
      {children}
    </h2>
  );
}

export function CardDescription({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-xs text-[var(--text-secondary)]', className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-5', className)} {...props}>
      {children}
    </div>
  );
}

export interface MetaLineProps {
  items: Array<string | number | null | undefined>;
  className?: string;
}

export function MetaLine({ items, className }: MetaLineProps) {
  const filtered = items.filter((item): item is string | number => item !== null && item !== undefined && item !== '');
  if (filtered.length === 0) return null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--text-muted)]',
        className
      )}
    >
      {filtered.map((item, idx) => (
        <React.Fragment key={`${String(item)}-${idx}`}>
          {idx > 0 && <span aria-hidden="true">·</span>}
          <span className={typeof item === 'number' ? 'font-mono tabular-nums' : undefined}>
            {item}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
