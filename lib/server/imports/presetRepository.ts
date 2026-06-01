import { adminDb } from '@/lib/firebase/admin';
import type {
  CsvImportPreset,
  CsvImportPresetRepository,
  CsvImportPresetUpdatePatch,
} from '@/lib/server/imports/presetTypes';

const PRESET_COLLECTION = 'csvImportPresets';

function mapPreset(
  presetId: string,
  data: Record<string, unknown>
): CsvImportPreset {
  return {
    id: presetId,
    userId: String(data.userId ?? ''),
    name: String(data.name ?? ''),
    sourceLabel: typeof data.sourceLabel === 'string' ? data.sourceLabel : null,
    mapping: (data.mapping ?? {}) as CsvImportPreset['mapping'],
    locale: (data.locale ?? {}) as CsvImportPreset['locale'],
    classificationRules: Array.isArray(data.classificationRules)
      ? (data.classificationRules as CsvImportPreset['classificationRules'])
      : [],
    createdAt: String(data.createdAt ?? ''),
    updatedAt: String(data.updatedAt ?? ''),
    lastUsedAt: typeof data.lastUsedAt === 'string' ? data.lastUsedAt : null,
  };
}

export function createFirestoreCsvImportPresetRepository(): CsvImportPresetRepository {
  return {
    async create(preset) {
      await adminDb.collection(PRESET_COLLECTION).doc(preset.id).set(preset);
    },

    async listByUserId(userId) {
      const snapshot = await adminDb
        .collection(PRESET_COLLECTION)
        .where('userId', '==', userId)
        .get();

      return snapshot.docs.map((doc) => mapPreset(doc.id, doc.data() as Record<string, unknown>));
    },

    async getById(presetId) {
      const snapshot = await adminDb.collection(PRESET_COLLECTION).doc(presetId).get();

      if (!snapshot.exists) {
        return null;
      }

      return mapPreset(snapshot.id, snapshot.data() as Record<string, unknown>);
    },

    async update(presetId, patch) {
      const presetRef = adminDb.collection(PRESET_COLLECTION).doc(presetId);
      const existing = await presetRef.get();

      if (!existing.exists) {
        return null;
      }

      const patchWithoutUndefined = Object.fromEntries(
        Object.entries(patch).filter(([, value]) => value !== undefined)
      ) as CsvImportPresetUpdatePatch;

      await presetRef.set(patchWithoutUndefined, { merge: true });
      const updated = await presetRef.get();

      if (!updated.exists) {
        return null;
      }

      return mapPreset(updated.id, updated.data() as Record<string, unknown>);
    },

    async delete(presetId) {
      await adminDb.collection(PRESET_COLLECTION).doc(presetId).delete();
    },
  };
}
