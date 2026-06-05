/**
 * AllocationHero — the page's one-glance verdict (A1).
 *
 * Trade Republic asymmetric bento: the dominant number (total allocated wealth — the
 * anchor every percentage is relative to) on the left, the balance verdict on the right.
 * The verdict is the actual decision metric: balanced, or N classes off target with the
 * single worst drift surfaced. Together they answer "how much, and am I in line?" before
 * the user reads a single breakdown row.
 *
 * The count-up is isolated in the `HeroValue` leaf so each animation frame re-renders only
 * that span, never the verdict or the rest of the tree (DESIGN.md count-up isolation rule).
 */
'use client';

import { useCountUp } from '@/lib/utils/useCountUp';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { type BalanceSummary } from '@/lib/utils/allocationUtils';
import { useActionColors } from '@/lib/hooks/useActionColors';
import { ActionChip } from './ActionChip';

interface AllocationHeroProps {
  totalValue: number;
  summary: BalanceSummary;
  assetClassCount: number;
}

/** Leaf so the rAF count-up re-renders only this span. */
function HeroValue({ value }: { value: number }) {
  const animated = useCountUp(value, { duration: 620, once: true });
  // useCountUp returns null on the first frame before the rAF loop seeds a value.
  return <>{cachedFormatCurrencyEUR(animated ?? value)}</>;
}

function formatSignedPp(pp: number): string {
  const sign = pp > 0 ? '+' : pp < 0 ? '−' : '';
  return `${sign}${Math.abs(pp).toFixed(1)} p.p.`;
}

export function AllocationHero({ totalValue, summary, assetClassCount }: AllocationHeroProps) {
  const { isBalanced, offTargetCount, largestGap } = summary;
  const actionColors = useActionColors();

  return (
    <div className="grid gap-4 desktop:grid-cols-[2fr_1fr]">
      {/* Dominant: total allocated wealth */}
      <div className="rounded-2xl border border-border bg-card p-[22px]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Patrimonio allocato
        </p>
        <p className="mt-2 font-mono text-[44px] font-bold leading-none tracking-[-0.03em] text-foreground desktop:text-[54px]">
          <HeroValue value={totalValue} />
        </p>
        <p className="mt-3 text-[11px] text-muted-foreground">
          {assetClassCount} {assetClassCount === 1 ? 'classe di asset' : 'classi di asset'} · valori correnti
        </p>
      </div>

      {/* Companion: balance verdict */}
      <div className="flex h-full flex-col justify-center rounded-2xl border border-border bg-card p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          Equilibrio
        </p>

        {isBalanced ? (
          <>
            <p className="mt-2 text-2xl font-bold leading-none" style={{ color: actionColors.OK }}>
              In linea
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Tutte le classi sono entro la soglia di ribilanciamento.
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span className="font-mono text-[32px] font-bold leading-none tabular-nums text-foreground">
                {offTargetCount}
              </span>
              <span className="text-sm text-muted-foreground">
                {offTargetCount === 1 ? 'classe fuori target' : 'classi fuori target'}
              </span>
            </p>
            {largestGap && (
              <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
                <ActionChip action={largestGap.action} color={actionColors[largestGap.action]} />
                <span className="truncate text-xs text-muted-foreground" title={largestGap.label}>
                  {largestGap.label}
                </span>
                <span
                  className="ml-auto font-mono text-xs font-medium tabular-nums"
                  style={{ color: actionColors[largestGap.action] }}
                >
                  {formatSignedPp(largestGap.difference)}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
