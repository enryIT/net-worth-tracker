import type { HouseholdAuditEntry, HouseholdConfig } from '@/types/household';
import { getDefaultHouseholdConfig } from '@/lib/utils/householdUtils';

type HouseholdAuditInput = Omit<
  HouseholdAuditEntry,
  'id' | 'userId' | 'createdAt'
>;

export async function getHouseholdConfig(userId: string): Promise<HouseholdConfig> {
  const response = await fetch('/api/household/config', {
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error('Errore nel caricamento delle attribuzioni');
  }

  return {
    ...getDefaultHouseholdConfig(userId),
    ...(await response.json()),
    userId,
  };
}

export async function saveHouseholdConfig(
  _userId: string,
  config: HouseholdConfig
): Promise<void> {
  const response = await fetch('/api/household/config', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    throw new Error('Errore nel salvataggio delle attribuzioni');
  }
}

export async function appendHouseholdAuditEntry(
  _userId: string,
  entry: HouseholdAuditInput
): Promise<void> {
  const response = await fetch('/api/household/audit', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(entry),
  });

  if (!response.ok) {
    throw new Error('Errore nel salvataggio audit household');
  }
}

export function appendHouseholdAuditEntrySafe(
  userId: string | undefined,
  entry: HouseholdAuditInput
): void {
  if (!userId) return;

  appendHouseholdAuditEntry(userId, entry).catch((error) => {
    console.warn('Unable to append household audit entry', {
      userId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export async function getHouseholdAuditEntries(
  _userId: string,
  maxCount = 100
): Promise<HouseholdAuditEntry[]> {
  const response = await fetch(`/api/household/audit?limit=${maxCount}`, {
    credentials: 'same-origin',
  });

  if (!response.ok) {
    throw new Error('Errore nel caricamento audit household');
  }

  const entries = (await response.json()) as HouseholdAuditEntry[];
  return entries.map((entry) => ({
    ...entry,
    createdAt: toDate(entry.createdAt),
  }));
}

function toDate(input: HouseholdAuditEntry['createdAt']): Date {
  if (input instanceof Date) return input;
  if (typeof input === 'object' && input !== null && 'toDate' in input) {
    return (input as { toDate: () => Date }).toDate();
  }
  return new Date(String(input));
}
