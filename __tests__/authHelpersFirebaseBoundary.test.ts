import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const authHelpersPath = "lib/utils/authHelpers.ts";
const scannedRoots = ["app", "lib", "components", "contexts", "types", "__tests__"];
const forbiddenRuntimePattern = new RegExp([
  "fire" + "base\\/auth",
  "Fire" + "baseUser",
  "Fire" + "store",
  "retry" + "Fire" + "storeOperation",
  "waitForAuthTokenRefresh",
].join("|"));

describe("auth helpers Firebase boundary", () => {
  it("keeps only provider-neutral local session helpers", () => {
    expect(existsSync(authHelpersPath)).toBe(true);

    const source = readFileSync(authHelpersPath, "utf8");
    expect(source).not.toMatch(forbiddenRuntimePattern);
    expect(source).toMatch(/waitForSessionReady/);
    expect(source).toMatch(/retryPermissionSensitiveOperation/);
  });

  it("has no active imports of the old provider-specific retry helper name", () => {
    const importPattern = new RegExp([
      "retry" + "Fire" + "storeOperation",
      "waitForAuthTokenRefresh",
    ].join("|"));
    const matches: string[] = [];

    for (const root of scannedRoots) {
      collectTypeScriptFiles(root).forEach((filePath) => {
        if (filePath === "__tests__/authHelpersFirebaseBoundary.test.ts") {
          return;
        }

        const source = readFileSync(filePath, "utf8");
        if (importPattern.test(source)) {
          matches.push(filePath);
        }
      });
    }

    expect(matches).toEqual([]);
  });
});

function collectTypeScriptFiles(root: string): string[] {
  if (!existsSync(root)) {
    return [];
  }

  const entries = readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return collectTypeScriptFiles(path);
    }

    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}
