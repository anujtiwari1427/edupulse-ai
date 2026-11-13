import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { Check } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex items-center gap-1 rounded-lg bg-[var(--bg-subtle)] p-1 border border-[var(--border-hairline)] overflow-x-auto max-w-full',
      className
    )}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium whitespace-nowrap shrink-0 text-[var(--text-secondary)] transition-colors cursor-pointer hover:text-[var(--text-primary)] data-[state=active]:bg-[var(--bg-surface)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-xs',
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('mt-4 outline-none', className)} {...props} />
));
TabsContent.displayName = 'TabsContent';

export interface StepItem {
  id: string;
  label: string;
}

export interface StepperProps {
  steps: StepItem[];
  currentStepIndex: number;
  onStepClick?: (index: number) => void;
}

export function Stepper({ steps, currentStepIndex, onStepClick }: StepperProps) {
  return (
    <nav aria-label="Progress steps" className="flex items-center gap-2 overflow-x-auto pb-1">
      {steps.map((step, idx) => {
        const isDone = idx < currentStepIndex;
        const isCurrent = idx === currentStepIndex;
        const clickable = Boolean(onStepClick) && idx <= currentStepIndex;
        return (
          <React.Fragment key={step.id}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick?.(idx)}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors',
                isCurrent
                  ? 'bg-[var(--brand-50)] text-[var(--brand-700)] dark:text-[var(--brand-500)] border border-[var(--brand-100)]'
                  : isDone
                    ? 'text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
                    : 'text-[var(--text-muted)]',
                clickable ? 'cursor-pointer' : 'cursor-default'
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-mono tabular-nums',
                  isDone
                    ? 'bg-[#4338ca] text-white'
                    : isCurrent
                      ? 'border border-[#4338ca] text-[var(--brand-700)] dark:text-[var(--brand-500)]'
                      : 'border border-[var(--border-strong)] text-[var(--text-muted)]'
                )}
              >
                {isDone ? <Check className="h-3 w-3" /> : idx + 1}
              </span>
              <span>{step.label}</span>
            </button>
            {idx < steps.length - 1 && (
              <span className="h-px w-5 bg-[var(--border-hairline)] shrink-0" aria-hidden="true" />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
