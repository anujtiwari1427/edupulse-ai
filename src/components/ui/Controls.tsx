import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { Check } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  id,
}: CheckboxProps) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer select-none min-h-[40px] py-1">
      <CheckboxPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        disabled={disabled}
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] data-[state=checked]:border-[#4338ca] data-[state=checked]:bg-[#4338ca] text-white disabled:opacity-50"
      >
        <CheckboxPrimitive.Indicator>
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {(label || description) && (
        <span className="text-sm leading-snug">
          {label && <span className="block font-medium text-[var(--text-primary)]">{label}</span>}
          {description && (
            <span className="block text-xs text-[var(--text-muted)] mt-0.5">{description}</span>
          )}
        </span>
      )}
    </label>
  );
}

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

export interface RadioGroupProps {
  value: string;
  onValueChange: (value: string) => void;
  options: RadioOption[];
  ariaLabel?: string;
  className?: string;
}

export function RadioGroup({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
}: RadioGroupProps) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      aria-label={ariaLabel}
      className={cn('space-y-2', className)}
    >
      {options.map((opt) => (
        <label
          key={opt.value}
          className="flex items-start gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 py-2.5 cursor-pointer hover:bg-[var(--bg-subtle)] transition-colors"
        >
          <RadioGroupPrimitive.Item
            value={opt.value}
            className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] data-[state=checked]:border-[#4338ca] flex items-center justify-center"
          >
            <RadioGroupPrimitive.Indicator className="h-2 w-2 rounded-full bg-[#4338ca]" />
          </RadioGroupPrimitive.Item>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[var(--text-primary)]">
              {opt.label}
            </span>
            {opt.description && (
              <span className="block text-xs text-[var(--text-muted)] mt-0.5">
                {opt.description}
              </span>
            )}
          </span>
        </label>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, label, description, disabled }: SwitchProps) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer min-h-[40px]">
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-sm font-medium text-[var(--text-primary)]">{label}</span>}
          {description && (
            <span className="block text-xs text-[var(--text-muted)] mt-0.5">{description}</span>
          )}
        </span>
      )}
      <SwitchPrimitive.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-[var(--bg-muted)] transition-colors data-[state=checked]:bg-[#4338ca] disabled:opacity-50"
      >
        <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-xs transition-transform data-[state=checked]:translate-x-5" />
      </SwitchPrimitive.Root>
    </label>
  );
}

export interface SliderProps {
  value: number[];
  onValueChange: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  unit?: string;
}

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  unit = '',
}: SliderProps) {
  return (
    <div className="w-full space-y-2">
      {label && (
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-[var(--text-primary)]">{label}</span>
          <span className="font-mono tabular-nums text-[var(--text-secondary)]">
            {value[0]}
            {unit}
          </span>
        </div>
      )}
      <SliderPrimitive.Root
        value={value}
        onValueChange={onValueChange}
        min={min}
        max={max}
        step={step}
        className="relative flex h-5 w-full touch-none select-none items-center"
      >
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[var(--bg-muted)]">
          <SliderPrimitive.Range className="absolute h-full bg-[#4338ca]" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border border-[#4338ca] bg-[var(--bg-surface)] shadow-xs transition-colors hover:bg-[var(--brand-50)]" />
      </SliderPrimitive.Root>
    </div>
  );
}
