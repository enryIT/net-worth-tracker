import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedControlOption<T extends string = string> {
  /** The option value — must be unique within the control. */
  value: T;
  /** Label rendered inside the button. */
  label: string;
}

export interface SegmentedControlProps<T extends string = string> {
  /** Available options. */
  options: SegmentedControlOption<T>[];
  /** Currently selected value. */
  value: T;
  /** Called with the new value when the user selects an option. */
  onChange: (value: T) => void;
  /** Accessible label for the `role="tablist"` wrapper. */
  'aria-label'?: string;
  /** Extra classes on the outer wrapper (e.g. margins). */
  className?: string;
}

/**
 * SegmentedControl — pill-style tab switcher.
 *
 * Renders a `role="tablist"` row of buttons with a shared muted background.
 * The active option gets an elevated `bg-background` pill; inactive options
 * show as muted text. Suitable for 2–4 options with short labels.
 *
 * @example
 * <SegmentedControl
 *   options={[{ value: 'expense', label: 'Spese' }, { value: 'income', label: 'Entrate' }]}
 *   value={view}
 *   onChange={setView}
 *   aria-label="Tipo di voci"
 * />
 */
export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  className,
}: Readonly<SegmentedControlProps<T>>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('bg-muted flex gap-1 rounded-lg p-1', className)}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="tab"
          aria-selected={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'flex-1 rounded-md py-1.5 text-sm transition-colors',
            value === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
