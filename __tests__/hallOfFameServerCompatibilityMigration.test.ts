import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { updateLocalHallOfFameMock } = vi.hoisted(() => ({
  updateLocalHallOfFameMock: vi.fn(),
}));

vi.mock("@/lib/server/hall-of-fame/localHallOfFameService", () => ({
  updateLocalHallOfFame: updateLocalHallOfFameMock,
}));

import { updateHallOfFame } from "@/lib/services/hallOfFameService.server";

const legacyServerHelperPath = "lib/services/hallOfFameService.server.ts";
const forbiddenFirebaseRuntime = /from ['"]firebase-admin\/firestore['"]|from ['"]@\/lib\/firebase\/admin['"]|adminDb|Timestamp/;

describe("hallOfFameService.server local compatibility", () => {
  it("does not import Firebase Admin runtime dependencies", () => {
    const source = readFileSync(legacyServerHelperPath, "utf8");

    expect(source).not.toMatch(forbiddenFirebaseRuntime);
  });

  it("delegates the legacy server helper to the local Hall of Fame service", async () => {
    updateLocalHallOfFameMock.mockResolvedValue(undefined);

    await updateHallOfFame("user-1");

    expect(updateLocalHallOfFameMock).toHaveBeenCalledWith("user-1");
    expect(updateLocalHallOfFameMock).toHaveBeenCalledTimes(1);
  });
});
