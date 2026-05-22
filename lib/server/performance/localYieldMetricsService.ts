import "server-only";

import { listLocalAssets } from "@/lib/server/assets/localAssetService";
import { listLocalDividends } from "@/lib/server/dividends/localDividendService";
import {
  calculateCurrentYieldMetrics,
  calculateYocMetrics,
} from "@/lib/services/performanceService";

export type LocalYieldMetricsPeriod = {
  startDate: Date;
  dividendEndDate: Date;
  numberOfMonths: number;
};

export async function getLocalYocMetrics(
  userId: string,
  period: LocalYieldMetricsPeriod
) {
  const [dividends, assets] = await getLocalYieldInputs(userId);

  return calculateYocMetrics(
    dividends,
    assets,
    period.startDate,
    period.dividendEndDate,
    period.numberOfMonths
  );
}

export async function getLocalCurrentYieldMetrics(
  userId: string,
  period: LocalYieldMetricsPeriod
) {
  const [dividends, assets] = await getLocalYieldInputs(userId);

  return calculateCurrentYieldMetrics(
    dividends,
    assets,
    period.startDate,
    period.dividendEndDate,
    period.numberOfMonths
  );
}

async function getLocalYieldInputs(userId: string) {
  return Promise.all([
    listLocalDividends(userId),
    listLocalAssets(userId),
  ]);
}
