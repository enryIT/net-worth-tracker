/**
 * AllocationPageSkeleton — loading placeholder for the Allocation page.
 *
 * Mirrors the post-load layout so there is no jump on hydrate: header → hero bento
 * (2fr/1fr on desktop, stacked on mobile) → band control → plan card → breakdown card.
 * One responsive layout across all widths (the old card↔table split — and its 1024 vs
 * 1440 skeleton breakpoint mismatch — is gone).
 */

import { cn } from '@/lib/utils';
import { PageContainer } from '@/components/layout/PageContainer';

function SkeletonBar({ className, delayMs = 0 }: { className?: string; delayMs?: number }) {
  return (
    <div
      className={cn('rounded bg-muted motion-safe:animate-pulse motion-reduce:opacity-40', className)}
      style={delayMs ? { animationDelay: `${delayMs}ms` } : undefined}
    />
  );
}

// Mirrors AllocationRow: name+chip row, dominant value, micro row, target tick.
function BreakdownRowSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <SkeletonBar className="h-3.5 w-28" delayMs={delayMs} />
            <SkeletonBar className="h-5 w-16 rounded-full" delayMs={delayMs + 20} />
          </div>
          <SkeletonBar className="h-6 w-32" delayMs={delayMs + 40} />
          <div className="mt-2 flex items-center gap-2">
            <SkeletonBar className="h-3 w-10" delayMs={delayMs + 60} />
            <SkeletonBar className="h-3 w-16" delayMs={delayMs + 60} />
          </div>
          <SkeletonBar className="mt-2 h-1.5 w-full rounded-full" delayMs={delayMs + 80} />
        </div>
        <SkeletonBar className="mt-1 h-4 w-4 shrink-0 rounded" delayMs={delayMs + 30} />
      </div>
    </div>
  );
}

export function AllocationPageSkeleton() {
  return (
    <PageContainer className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <div className="mb-2">
          <SkeletonBar className="h-3 w-28" />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <SkeletonBar className="h-8 w-48" delayMs={20} />
            <SkeletonBar className="h-4 w-72" delayMs={40} />
          </div>
          <SkeletonBar className="h-9 w-36 rounded-md" delayMs={60} />
        </div>
      </div>

      {/* Hero bento: dominant value + companion verdict */}
      <div className="grid gap-4 desktop:grid-cols-[2fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-[22px]">
          <SkeletonBar className="h-3 w-32" delayMs={60} />
          <SkeletonBar className="mt-3 h-12 w-56" delayMs={90} />
          <SkeletonBar className="mt-3 h-3 w-40" delayMs={120} />
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <SkeletonBar className="h-3 w-24" delayMs={80} />
          <SkeletonBar className="mt-3 h-8 w-40" delayMs={110} />
          <SkeletonBar className="mt-3 h-4 w-full" delayMs={140} />
        </div>
      </div>

      {/* Band control */}
      <SkeletonBar className="h-8 w-72 rounded-lg" delayMs={120} />

      {/* Rebalance plan card */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3.5">
          <SkeletonBar className="h-3 w-40" delayMs={140} />
        </div>
        <div className="divide-y divide-border/50">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3.5">
              <div className="flex flex-col gap-2">
                <SkeletonBar className="h-4 w-32" delayMs={160 + i * 40} />
                <SkeletonBar className="h-3 w-24" delayMs={170 + i * 40} />
              </div>
              <SkeletonBar className="h-5 w-20" delayMs={180 + i * 40} />
            </div>
          ))}
        </div>
      </div>

      {/* Breakdown card */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3.5">
          <SkeletonBar className="h-3 w-28" delayMs={200} />
        </div>
        <div className="divide-y divide-border/50">
          {Array.from({ length: 5 }).map((_, i) => (
            <BreakdownRowSkeleton key={i} delayMs={220 + i * 50} />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
