import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultHouseholdConfig } from "@/lib/utils/householdUtils";

const fetchMock = vi.fn();

vi.stubGlobal("fetch", fetchMock);

import {
  appendHouseholdAuditEntry,
  appendHouseholdAuditEntrySafe,
  getHouseholdAuditEntries,
  getHouseholdConfig,
  saveHouseholdConfig,
} from "@/lib/services/householdService";

describe("household service client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  it("loads household config from the local API", async () => {
    const config = getDefaultHouseholdConfig("user-1");
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => config,
    });

    await expect(getHouseholdConfig("user-1")).resolves.toEqual(config);

    expect(fetchMock).toHaveBeenCalledWith("/api/household/config", {
      credentials: "same-origin",
    });
  });

  it("saves household config through the local API", async () => {
    const config = {
      ...getDefaultHouseholdConfig("user-1"),
      enabled: true,
    };

    await saveHouseholdConfig("user-1", config);

    expect(fetchMock).toHaveBeenCalledWith("/api/household/config", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(config),
    });
  });

  it("loads and appends household audit entries through the local API", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: "audit-1",
          userId: "user-1",
          entityType: "asset",
          entityId: "asset-1",
          action: "create",
          summary: "Asset creato",
          createdAt: "2026-05-20T10:00:00.000Z",
        },
      ],
    });

    const entries = await getHouseholdAuditEntries("user-1", 10);

    expect(fetchMock).toHaveBeenCalledWith("/api/household/audit?limit=10", {
      credentials: "same-origin",
    });
    expect(entries[0].createdAt).toEqual(new Date("2026-05-20T10:00:00.000Z"));

    await appendHouseholdAuditEntry("user-1", {
      entityType: "asset",
      entityId: "asset-1",
      action: "create",
      summary: "Asset creato",
    });

    expect(fetchMock).toHaveBeenLastCalledWith("/api/household/audit", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entityType: "asset",
        entityId: "asset-1",
        action: "create",
        summary: "Asset creato",
      }),
    });
  });

  it("safe audit append does not call the API without a user", () => {
    appendHouseholdAuditEntrySafe(undefined, {
      entityType: "asset",
      entityId: "asset-1",
      action: "create",
      summary: "Asset creato",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
