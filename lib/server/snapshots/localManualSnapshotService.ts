import "server-only";

import { invalidateLocalDashboardOverviewSummary } from "@/lib/server/dashboard/localDashboardOverviewInvalidationService";
import { updateLocalHallOfFame } from "@/lib/server/hall-of-fame/localHallOfFameService";
import {
  type LocalSnapshotInput,
  upsertLocalSnapshot,
} from "@/lib/server/snapshots/localSnapshotService";

export type LocalManualSnapshotInput = Omit<LocalSnapshotInput, "isDummy">;

export type LocalManualSnapshotResult = {
  success: true;
  snapshotId: string;
  message: string;
};

export async function createLocalManualSnapshot(
  userId: string,
  snapshot: LocalManualSnapshotInput
): Promise<LocalManualSnapshotResult> {
  await upsertLocalSnapshot(userId, {
    ...snapshot,
    byAsset: snapshot.byAsset ?? [],
    byOwnershipProfile: snapshot.byOwnershipProfile ?? {},
    byParticipant: snapshot.byParticipant ?? {},
  });
  await invalidateLocalDashboardOverviewSummary(userId, "manual_snapshot_created");

  try {
    await updateLocalHallOfFame(userId);
  } catch (error) {
    console.error("[LOCAL_MANUAL_SNAPSHOT_HALL_OF_FAME_ERROR]", error);
  }

  return {
    success: true,
    snapshotId: `${userId}-${snapshot.year}-${snapshot.month}`,
    message: "Snapshot manuale creato correttamente.",
  };
}
