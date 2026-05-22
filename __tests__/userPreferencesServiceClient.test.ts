import { beforeEach, describe, expect, it, vi } from "vitest";

const { docMock, getDocMock, setDocMock } = vi.hoisted(() => ({
  docMock: vi.fn(),
  getDocMock: vi.fn(),
  setDocMock: vi.fn(),
}));

vi.mock("@/lib/firebase/config", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  doc: docMock,
  getDoc: getDocMock,
  setDoc: setDocMock,
}));

import {
  getUserPreferences,
  setUserPreferences,
} from "@/lib/services/userPreferencesService";

describe("userPreferencesService client API wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("loads preferences through the local preferences API", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ colorTheme: "cyberpunk" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(getUserPreferences("legacy-user-id")).resolves.toEqual({
      colorTheme: "cyberpunk",
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/user/preferences", {
      method: "GET",
      credentials: "include",
    });
    expect(docMock).not.toHaveBeenCalled();
    expect(getDocMock).not.toHaveBeenCalled();
  });

  it("saves preferences through the local preferences API", async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    await expect(
      setUserPreferences("legacy-user-id", { colorTheme: "solar-dusk" })
    ).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledWith("/api/user/preferences", {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ colorTheme: "solar-dusk" }),
    });
    expect(docMock).not.toHaveBeenCalled();
    expect(setDocMock).not.toHaveBeenCalled();
  });
});
