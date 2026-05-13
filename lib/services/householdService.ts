import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { HouseholdAuditEntry, HouseholdConfig } from '@/types/household';
import { getDefaultHouseholdConfig } from '@/lib/utils/householdUtils';

const HOUSEHOLD_CONFIGS_COLLECTION = 'householdConfigs';
const HOUSEHOLD_AUDIT_COLLECTION = 'householdAudit';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function removeUndefinedFields<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => removeUndefinedFields(item)) as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, removeUndefinedFields(item)])
  ) as T;
}

export async function getHouseholdConfig(userId: string): Promise<HouseholdConfig> {
  const configRef = doc(db, HOUSEHOLD_CONFIGS_COLLECTION, userId);
  const configSnap = await getDoc(configRef);

  if (!configSnap.exists()) {
    return getDefaultHouseholdConfig(userId);
  }

  const data = configSnap.data() as Partial<HouseholdConfig>;
  const fallback = getDefaultHouseholdConfig(userId);

  return {
    ...fallback,
    ...data,
    userId,
    participants: data.participants?.length ? data.participants : fallback.participants,
    profiles: data.profiles?.length ? data.profiles : fallback.profiles,
    attributionRules: data.attributionRules ?? [],
  };
}

export async function saveHouseholdConfig(userId: string, config: HouseholdConfig): Promise<void> {
  const now = Timestamp.now();
  const configRef = doc(db, HOUSEHOLD_CONFIGS_COLLECTION, userId);

  await setDoc(configRef, removeUndefinedFields({
    ...config,
    userId,
    updatedAt: now,
    createdAt: config.createdAt ?? now,
  }));
  appendHouseholdAuditEntrySafe(userId, {
    entityType: 'householdConfig',
    entityId: userId,
    action: 'update',
    summary: 'Configurazione household aggiornata',
    after: {
      participants: config.participants.length,
      profiles: config.profiles.length,
      attributionRules: config.attributionRules.length,
    },
  });
}

export async function appendHouseholdAuditEntry(
  userId: string,
  entry: Omit<HouseholdAuditEntry, 'id' | 'userId' | 'createdAt'>
): Promise<void> {
  const auditRef = collection(db, HOUSEHOLD_AUDIT_COLLECTION);
  await addDoc(auditRef, removeUndefinedFields({
    ...entry,
    userId,
    createdAt: Timestamp.now(),
  }));
}

export function appendHouseholdAuditEntrySafe(
  userId: string | undefined,
  entry: Omit<HouseholdAuditEntry, 'id' | 'userId' | 'createdAt'>
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
  userId: string,
  maxCount = 100
): Promise<HouseholdAuditEntry[]> {
  const auditRef = collection(db, HOUSEHOLD_AUDIT_COLLECTION);
  const auditQuery = query(
    auditRef,
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(maxCount)
  );
  const snapshot = await getDocs(auditQuery);

  return snapshot.docs.map((auditDoc) => ({
    id: auditDoc.id,
    ...auditDoc.data(),
    createdAt: auditDoc.data().createdAt?.toDate?.() ?? new Date(),
  })) as HouseholdAuditEntry[];
}
