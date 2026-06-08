/**
 * AllocationRow — one flat row in the unified breakdown list.
 *
 * Trade Republic hierarchy: name + action chip, then the dominant current value,
 * then a muted micro line (current% · target% · Δ€) and the TargetTick. Used at every
 * depth (asset class → sub-category → theoretical specific assets) with indentation,
 * so the same mental model holds on mobile and desktop — no separate table/sheet paths.
 *
 * The "theoretical" variant is for specific-asset TARGETS, whose current value is always
 * 0 (they are not linked to real holdings). Showing a dominant "€0" there would be
 * dishonest, so that variant renders a compact target-only line instead.
 */
'use client';

import { KeyboardEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercentage } from '@/lib/services/chartService';
import { AllocationData } from '@/types/assets';
import { ActionChip } from './ActionChip';
import { TargetTick } from './TargetTick';

interface AllocationRowProps {
  name: string;
  data: AllocationData;
  /** Resolved, legibility-clamped color for this row's action (from `useActionColors()`). */
  actionColor: string;
  /** 0 = asset class, 1 = sub-category, 2 = specific-asset target. Drives indent + scale. */
  depth?: 0 | 1 | 2;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  /** Theoretical specific-asset target (current value always 0 → compact target-only line). */
  theoretical?: boolean;
}

const DEPTH_PADDING: Record<0 | 1 | 2, string> = {
  0: 'px-4',
  1: 'pl-8 pr-4',
  2: 'pl-12 pr-4',
};

const VALUE_SIZE: Record<0 | 1 | 2, string> = {
  0: 'text-2xl',
  1: 'text-lg',
  2: 'text-base',
};

export function AllocationRow({
  name,
  data,
  actionColor,
  depth = 0,
  expandable = false,
  expanded = false,
  onToggle,
  theoretical = false,
}: AllocationRowProps) {
  const isInteractive = expandable && !!onToggle;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isInteractive) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle!();
    }
  };

  return (
    <div
      className={cn(
        'py-3.5',
        DEPTH_PADDING[depth],
        isInteractive &&
          'cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
      )}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-expanded={expandable ? expanded : undefined}
      aria-label={isInteractive ? `${expanded ? 'Comprimi' : 'Espandi'} ${name}` : undefined}
      onClick={isInteractive ? onToggle : undefined}
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* Row 1: name + action chip */}
          <div className="mb-1.5 flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground" title={name}>
              {name}
            </span>
            <ActionChip action={data.action} color={actionColor} />
          </div>

          {theoretical ? (
            /* Theoretical target: no real current value — show the target plainly. */
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              target {formatPercentage(data.targetPercentage)} · {formatCurrency(data.targetValue)}
            </p>
          ) : (
            <>
              {/* Row 2: dominant current value */}
              <p
                className={cn(
                  'font-mono font-bold tabular-nums leading-none text-foreground',
                  VALUE_SIZE[depth]
                )}
              >
                {formatCurrency(data.currentValue)}
              </p>

              {/* Row 3: muted micro context */}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-xs text-muted-foreground">
                <span>{formatPercentage(data.currentPercentage)}</span>
                <span className="opacity-30">·</span>
                <span>target {formatPercentage(data.targetPercentage)}</span>
                {data.action !== 'OK' && (
                  <>
                    <span className="opacity-30">·</span>
                    <span className="font-medium" style={{ color: actionColor }}>
                      {data.differenceValue > 0 ? '+' : ''}
                      {formatCurrency(data.differenceValue)}
                    </span>
                  </>
                )}
              </div>

              <TargetTick
                className="mt-2"
                currentPercentage={data.currentPercentage}
                targetPercentage={data.targetPercentage}
              />
            </>
          )}
        </div>

        {/* Chevron — only for expandable rows; rotates 90° when open */}
        {expandable && (
          <ChevronRight
            className={cn(
              'mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
              expanded && 'rotate-90'
            )}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}
