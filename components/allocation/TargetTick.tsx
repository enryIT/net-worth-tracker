/**
 * TargetTick — a slim current-vs-target bar for one allocation row.
 *
 * This is the one visual the page legitimately needs: the gap between where a sleeve
 * IS and where it SHOULD be is inherently spatial, so a number alone hides it. The
 * filled bar is the current weight; the vertical marker is the target. Over- vs
 * under-allocation reads from POSITION (fill past the marker = over), so the fill color
 * does not need to carry the action — the chip and the signed Δ already do. The fill
 * therefore uses the theme's primary data hue (`--chart-1`), which lets the page reflect
 * the user's chosen theme (the semantic warning/positive/destructive tokens are shared
 * across all themes and would look identical everywhere).
 *
 * Not a decorative progress bar (DESIGN.md forbids those): it carries information the
 * number cannot surface at a glance, is theme-aware, and exposes a proper progressbar
 * role. Distinct from the removed `AllocationProgressBar`.
 *
 * Scale: per-row, to max(current, target) × 1.12, so both the fill and the marker stay
 * legible for tiny sleeves; the 1.12 headroom keeps the target marker off the right edge.
 */
'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatPercentage } from '@/lib/services/chartService';

interface TargetTickProps {
  currentPercentage: number;
  targetPercentage: number;
  className?: string;
}

export function TargetTick({ currentPercentage, targetPercentage, className }: TargetTickProps) {
  const reducedMotion = useReducedMotion();

  const scaleMax = Math.max(currentPercentage, targetPercentage, 1) * 1.12;
  const fillWidth = Math.min((currentPercentage / scaleMax) * 100, 100);
  const targetPosition = Math.min((targetPercentage / scaleMax) * 100, 100);

  return (
    <div
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
      role="progressbar"
      aria-valuenow={Math.round(currentPercentage)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Allocazione corrente ${formatPercentage(currentPercentage)}, target ${formatPercentage(targetPercentage)}`}
    >
      {/* Current fill — theme primary hue (var(--chart-1)) so the page reflects the theme. */}
      <motion.div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          backgroundColor: 'var(--chart-1)',
          ...(reducedMotion ? { width: `${fillWidth}%` } : {}),
        }}
        initial={reducedMotion ? false : { width: 0 }}
        animate={reducedMotion ? undefined : { width: `${fillWidth}%` }}
        transition={reducedMotion ? undefined : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      />
      {/* Target marker — a thin line the eye reads as "where you should be". */}
      <div
        className="absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-foreground/70"
        style={{ left: `${targetPosition}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
