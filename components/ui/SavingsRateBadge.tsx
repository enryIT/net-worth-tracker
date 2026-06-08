'use client';

/**
 * SAVINGS RATE CELEBRATION BADGE
 *
 * Appears once per browser session when last month's savings rate exceeds the threshold.
 * Auto-dismisses after 3 seconds, or immediately when the user closes it.
 *
 * SHOW LOGIC:
 * All conditions must be true:
 * 1. Previous month income > 0 (data available)
 * 2. Savings rate >= SAVINGS_RATE_BADGE_THRESHOLD
 * 3. Today is not the very start of the month (day >= 5) — partial data before that
 * 4. Not already shown this session (sessionStorage flag)
 * 5. User hasn't set prefers-reduced-motion
 *
 * AUTO-DISMISS (gotcha):
 * The dismiss timer lives in its OWN effect keyed on `visible` — NOT in the
 * show-decision effect. The show effect depends on `previousMonthIncome` /
 * `savingsRate`, which change whenever React Query refetches the overview. If the
 * timer were armed there, that refetch would run the effect cleanup (clearing the
 * pending timer) and then re-enter, hit the sessionStorage guard, and return early
 * without re-arming — leaving the badge stuck on screen until a manual refresh.
 * Keeping the timer on `[visible]` makes it immune to data-dependency churn.
 *
 * Why sessionStorage over useRef: useRef resets on page reload, but the spec
 * requires "shown at most once per browser session" (survives reload, not just remount).
 * sessionStorage.getItem returns null on new tab/window, matching "per session" semantics.
 *
 * TESTING:
 * To force the badge: open DevTools → Application → Session Storage →
 * delete `savings_rate_badge_shown`, then reload.
 * To lower threshold: change SAVINGS_RATE_BADGE_THRESHOLD temporarily to e.g. 1.
 * To simulate early month: the `italyDay < 5` guard can be temporarily removed.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { getItalyDate, getItalyMonthYear } from '@/lib/utils/dateHelpers';

const SAVINGS_RATE_BADGE_THRESHOLD = 30;
const SESSION_KEY = 'savings_rate_badge_shown';
const AUTO_DISMISS_MS = 3000;

const ITALIAN_MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

interface SavingsRateBadgeProps {
  previousMonthIncome: number;
  previousMonthExpenses: number;
}

export function SavingsRateBadge({ previousMonthIncome, previousMonthExpenses }: SavingsRateBadgeProps) {
  const [visible, setVisible] = useState(false);
  // Guard against triggering twice within the same component lifecycle
  const triggered = useRef(false);

  const savingsRate = previousMonthIncome > 0
    ? ((previousMonthIncome - previousMonthExpenses) / previousMonthIncome) * 100
    : 0;

  // Derive previous month name from current Italy date
  const { month: currentMonth } = getItalyMonthYear();
  const previousMonthIndex = currentMonth === 1 ? 11 : currentMonth - 2; // 0-indexed
  const previousMonthName = ITALIAN_MONTHS[previousMonthIndex];

  // ─── Show decision — runs when the underlying data settles ───────────────────
  useEffect(() => {
    // prefers-reduced-motion: skip any animated notification entirely
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    // Show only if we're past the first few days (early-month data is still partial)
    const italyDay = getItalyDate(new Date()).getDate();
    if (italyDay < 5) return;

    if (previousMonthIncome <= 0) return;
    if (savingsRate < SAVINGS_RATE_BADGE_THRESHOLD) return;

    // One per browser session — survives React remounts and page reloads
    if (sessionStorage.getItem(SESSION_KEY)) return;

    // Prevent double-trigger from React Strict Mode double-effect
    if (triggered.current) return;
    triggered.current = true;

    sessionStorage.setItem(SESSION_KEY, '1');
    setVisible(true);
  }, [previousMonthIncome, savingsRate]);

  // ─── Auto-dismiss — armed only while visible, independent of data deps ───────
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="savings-badge"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="bg-positive/10 border-positive/20 fixed bottom-4 left-4 z-50 flex max-w-[300px] items-start gap-3 rounded-lg border px-4 py-3 shadow-lg"
        >
          <div className="min-w-0">
            <p className="text-positive text-sm font-semibold">
              ✦ Ottimo risparmio a {previousMonthName}!
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Hai risparmiato il {savingsRate.toFixed(0)}% delle entrate
            </p>
          </div>
          <button
            type="button"
            onClick={() => setVisible(false)}
            aria-label="Chiudi notifica"
            className="text-muted-foreground hover:text-foreground -mr-1 -mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md transition-colors"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
