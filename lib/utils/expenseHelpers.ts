import type { Expense } from '@/types/expenses';

/**
 * Safely coerce Expense.date (Date | Timestamp | string) to a native Date.
 * The string branch is a belt-and-suspenders fallback for data arriving from
 * JSON APIs or legacy Firestore documents where Timestamp is already serialised.
 */
export const getExpenseDate = (d: Expense['date']): Date => {
  if (d instanceof Date) return d;
  if (typeof d === 'string') return new Date(d);
  // Firestore Timestamp — has a .toDate() method
  return (d as { toDate(): Date }).toDate();
};
