import { updateLocalHallOfFame } from "@/lib/server/hall-of-fame/localHallOfFameService";

export async function updateHallOfFame(userId: string): Promise<void> {
  await updateLocalHallOfFame(userId);
}
