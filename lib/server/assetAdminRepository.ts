import "server-only";

import { listLocalAssets } from "@/lib/server/assets/localAssetService";
import type { Asset } from "@/types/assets";

/**
 * Compatibility helper for legacy server callers.
 *
 * Asset persistence now lives in the local Prisma-backed asset service.
 */
export async function getUserAssetsAdmin(userId: string): Promise<Asset[]> {
  return listLocalAssets(userId);
}
