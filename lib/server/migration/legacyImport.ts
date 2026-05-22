import "server-only";

export type LegacyImportRecordKeyInput = {
  userId: string;
  collection: string;
  legacyFirebaseId: string;
};

export type LegacyImportItemResult =
  | { status: "inserted" }
  | { status: "updated" }
  | { status: "skipped" }
  | { status: "failed"; error: string };

export type LegacyImportSummary = {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
};

export function buildLegacyImportRecordKey(
  input: LegacyImportRecordKeyInput
): string {
  const parts = [input.userId, input.collection, input.legacyFirebaseId];

  if (parts.some((part) => part.trim().length === 0 || part.includes(":"))) {
    throw new Error("Invalid legacy import key");
  }

  return parts.join(":");
}

export function summarizeLegacyImportResults(
  results: LegacyImportItemResult[]
): LegacyImportSummary {
  return results.reduce<LegacyImportSummary>(
    (summary, result) => {
      summary[result.status] += 1;

      if (result.status === "failed") {
        summary.errors.push(result.error);
      }

      return summary;
    },
    {
      inserted: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    }
  );
}
