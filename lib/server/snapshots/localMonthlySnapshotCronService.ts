import "server-only";

import { updateLocalHallOfFame } from "@/lib/server/hall-of-fame/localHallOfFameService";
import { prisma } from "@/lib/server/prisma";
import { createLocalAutomatedSnapshot } from "@/lib/server/snapshots/localAutomatedSnapshotService";

type CronUser = {
  id: string;
  isDemo: boolean;
};

type CronSummary = {
  sent: number;
  skipped: number;
  errors: number;
};

type SnapshotResult = {
  userId: string;
  snapshotId: string;
  message: string;
};

type SnapshotError = {
  userId: string;
  error: string;
};

export type LocalMonthlySnapshotCronResult = {
  success: true;
  message: string;
  timestamp: string;
  snapshotsCreated: number;
  errors: number;
  results: SnapshotResult[];
  errorDetails: SnapshotError[];
  emailSummary: CronSummary;
  quarterlyEmailSummary: CronSummary;
  yearlyEmailSummary: CronSummary;
};

const EMPTY_SUMMARY: CronSummary = { sent: 0, skipped: 0, errors: 0 };

export async function runLocalMonthlySnapshotCron(): Promise<LocalMonthlySnapshotCronResult> {
  const users = await prisma.user.findMany({
    select: { id: true, isDemo: true },
    orderBy: { createdAt: "asc" },
  });

  if (users.length === 0) {
    return buildResult("No users found", [], []);
  }

  const results: SnapshotResult[] = [];
  const errors: SnapshotError[] = [];

  for (const user of users) {
    try {
      const snapshotResult = await createLocalAutomatedSnapshot(user.id, {});

      if (snapshotResult.success) {
        await updateHallOfFameForSnapshot(user);
        results.push({
          userId: user.id,
          snapshotId: snapshotResult.snapshotId,
          message: snapshotResult.message,
        });
      } else {
        errors.push({
          userId: user.id,
          error: snapshotResult.message,
        });
      }
    } catch (error) {
      console.error(
        "[LOCAL_MONTHLY_SNAPSHOT_USER_ERROR]",
        { userId: user.id },
        error
      );
      errors.push({
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return buildResult("Monthly snapshots job completed", results, errors);
}

async function updateHallOfFameForSnapshot(user: CronUser): Promise<void> {
  try {
    await updateLocalHallOfFame(user.id);
  } catch (error) {
    console.error(
      "[LOCAL_MONTHLY_SNAPSHOT_HALL_OF_FAME_ERROR]",
      { userId: user.id },
      error
    );
  }
}

function buildResult(
  message: string,
  results: SnapshotResult[],
  errors: SnapshotError[]
): LocalMonthlySnapshotCronResult {
  return {
    success: true,
    message,
    timestamp: new Date().toISOString(),
    snapshotsCreated: results.length,
    errors: errors.length,
    results,
    errorDetails: errors,
    emailSummary: { ...EMPTY_SUMMARY },
    quarterlyEmailSummary: { ...EMPTY_SUMMARY },
    yearlyEmailSummary: { ...EMPTY_SUMMARY },
  };
}
