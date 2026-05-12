import { NextRequest, NextResponse } from 'next/server';
import { getAllDividends } from '@/lib/services/dividendService';
import { calculateYocMetrics } from '@/lib/services/performanceService';
import { getUserAssetsAdmin } from '@/lib/server/assetAdminRepository';
import {
  assertSameUser,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { parsePerformancePeriodQuery } from '../periodQuery';


/**
 * GET /api/performance/yoc
 *
 * Calculate Yield on Cost (YOC) metrics for a specific period
 *
 * Query params:
 * - userId: User ID (required)
 * - startDate: Period start date ISO string (required)
 * - dividendEndDate: Period end date ISO string (required, MUST be capped at today)
 * - numberOfMonths: Duration in months for annualization (required)
 *
 * Returns:
 * - yocGross: YOC based on gross dividends (%)
 * - yocNet: YOC based on net dividends (%)
 * - yocDividendsGross: Total gross dividends in period
 * - yocDividendsNet: Total net dividends in period
 * - yocCostBasis: Total cost basis
 * - yocAssetCount: Number of assets included
 */
export async function GET(request: NextRequest) {
  try {
    const decodedToken = await requireFirebaseAuth(request);
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    // Validate required parameters
    assertSameUser(decodedToken, userId);
    const authenticatedUserId = userId as string;

    const periodQuery = parsePerformancePeriodQuery(searchParams);
    if (!periodQuery.ok) {
      return NextResponse.json(
        { error: periodQuery.error },
        { status: 400 }
      );
    }
    const { startDate, dividendEndDate, numberOfMonths } = periodQuery.value;

    // Fetch dividends and assets server-side using Firebase Admin SDK
    const [allDividends, allAssets] = await Promise.all([
      getAllDividends(authenticatedUserId),
      getUserAssetsAdmin(authenticatedUserId),
    ]);

    // Calculate YOC metrics
    const yocMetrics = calculateYocMetrics(
      allDividends,
      allAssets,
      startDate,
      dividendEndDate,
      numberOfMonths
    );

    return NextResponse.json(yocMetrics);
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('[API /performance/yoc] Error calculating YOC:', error);
    return NextResponse.json(
      { error: 'Failed to calculate YOC metrics' },
      { status: 500 }
    );
  }
}
