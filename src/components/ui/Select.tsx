import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

export interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select an option',
  disabled,
  ariaLabel,
  className,
}: SelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          'inline-flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] hover:border-[var(--text-muted)] focus-visible:ring-2 focus-visible:ring-indigo-500/25 focus-visible:border-indigo-500 shadow-2xs disabled:opacity-50 cursor-pointer transition-all',
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-64 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-xl"
        >
          <SelectPrimitive.Viewport className="p-1.5">
            {options.map((opt) => (
              <SelectPrimitive.Item
                key={opt.value}
                value={opt.value}
                className="relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-3 text-sm text-[var(--text-primary)] outline-none data-[highlighted]:bg-indigo-50/80 dark:data-[highlighted]:bg-indigo-950/60 data-[highlighted]:text-indigo-700 dark:data-[highlighted]:text-indigo-300 transition-colors"
              >
                <span className="absolute left-2.5 flex h-4 w-4 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-3.5 w-3.5 text-[var(--brand-700)] dark:text-[var(--brand-500)]" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export interface ComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
}

export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches found.',
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const selected = options.find((o) => o.value === value);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.description && o.description.toLowerCase().includes(q))
    );
  }, [options, query]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'inline-flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 text-sm text-[var(--text-primary)] hover:border-[var(--text-muted)] cursor-pointer',
            className
          )}
        >
          <span className={cn('truncate', !selected && 'text-[var(--text-muted)]')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[240px] rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-1.5 shadow-lg"
        >
          <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] px-2 pb-1.5 mb-1">
            <Search className="h-3.5 w-3.5 text-[var(--text-muted)] shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 w-full bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-4 text-center text-xs text-[var(--text-muted)]">{emptyText}</p>
            ) : (
              filtered.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onValueChange(opt.value);
                    setOpen(false);
                    setQuery('');
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer"
                >
                  <Check
                    className={cn(
                      'h-3.5 w-3.5 shrink-0',
                      opt.value === value
                        ? 'opacity-100 text-[var(--brand-700)] dark:text-[var(--brand-500)]'
                        : 'opacity-0'
                    )}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{opt.label}</div>
                    {opt.description && (
                      <div className="truncate text-xs text-[var(--text-muted)]">
                        {opt.description}
                      </div>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
