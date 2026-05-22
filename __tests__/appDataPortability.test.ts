import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  APP_DATA_EXPORT_VERSION,
  buildExportEnvelope,
  parseImportEnvelope,
} from "@/lib/server/portability/appDataExport";

describe("app data portability format", () => {
  it("builds a schema-versioned export envelope", () => {
    const createdAt = new Date("2026-05-16T10:00:00.000Z");

    const envelope = buildExportEnvelope({
      appVersion: "0.1.0",
      exportedAt: createdAt,
      exportedUser: {
        id: "user-1",
        email: "test@example.com",
      },
      sections: {
        settings: [{ key: "theme", value: "default" }],
      },
    });

    expect(envelope).toEqual({
      version: APP_DATA_EXPORT_VERSION,
      appVersion: "0.1.0",
      exportedAt: "2026-05-16T10:00:00.000Z",
      exportedUser: {
        id: "user-1",
        email: "test@example.com",
      },
      sections: {
        settings: [{ key: "theme", value: "default" }],
      },
    });
  });

  it("parses a valid import envelope", () => {
    const envelope = buildExportEnvelope({
      appVersion: "0.1.0",
      exportedAt: new Date("2026-05-16T10:00:00.000Z"),
      exportedUser: {
        id: "user-1",
        email: "test@example.com",
      },
      sections: {
        assets: [],
      },
    });

    expect(parseImportEnvelope(envelope)).toEqual({
      success: true,
      data: envelope,
    });
  });

  it("rejects unsupported export versions", () => {
    const result = parseImportEnvelope({
      version: 999,
      appVersion: "0.1.0",
      exportedAt: "2026-05-16T10:00:00.000Z",
      exportedUser: {
        id: "user-1",
        email: "test@example.com",
      },
      sections: {},
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Versione export non supportata."
      );
    }
  });
});
