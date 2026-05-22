import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildLegacyImportRecordKey,
  summarizeLegacyImportResults,
} from "@/lib/server/migration/legacyImport";

describe("legacy Firebase import helpers", () => {
  it("builds deterministic keys for idempotent imported records", () => {
    expect(
      buildLegacyImportRecordKey({
        userId: "user-1",
        collection: "assets",
        legacyFirebaseId: "asset-1",
      })
    ).toBe("user-1:assets:asset-1");
  });

  it("rejects malformed import key parts", () => {
    expect(() =>
      buildLegacyImportRecordKey({
        userId: "user-1",
        collection: "",
        legacyFirebaseId: "asset-1",
      })
    ).toThrow("Invalid legacy import key");
  });

  it("summarizes import item outcomes", () => {
    expect(
      summarizeLegacyImportResults([
        { status: "inserted" },
        { status: "updated" },
        { status: "updated" },
        { status: "skipped" },
        { status: "failed", error: "missing relation" },
      ])
    ).toEqual({
      inserted: 1,
      updated: 2,
      skipped: 1,
      failed: 1,
      errors: ["missing relation"],
    });
  });
});
