import { NextRequest, NextResponse } from 'next/server';
import { getAllDividends } from '@/lib/services/dividendService';
import { calculateCurrentYieldMetrics } from '@/lib/services/performanceService';
import { getUserAssetsAdmin } from '@/lib/server/assetAdminRepository';
import {
  assertSameUser,
  getApiAuthErrorResponse,
  requireFirebaseAuth,
} from '@/lib/server/apiAuth';
import { parsePerformancePeriodQuery } from '../periodQuery';

/**
 * GET /api/performance/current-yield
 *
 * Calculate Current Yield metrics for a specific period
 *
 * Current Yield measures annualized dividend yield based on current market value,
 * unlike YOC which uses original cost basis. This shows what an investor would
 * earn TODAY if purchasing the portfolio at current prices.
 *
 * Query params:
 * - userId: User ID (required)
 * - startDate: Period start date ISO string (required)
 * - dividendEndDate: Period end date ISO string (required, MUST be capped at today)
 * - numberOfMonths: Duration in months for annualization (required)
 *
 * Returns:
 * - currentYield: Current yield percentage (gross)
 * - currentYieldNet: Current yield percentage (net, after tax)
 * - currentYieldDividends: Total gross dividends in period (not annualized)
 * - currentYieldDividendsNet: Total net dividends in period (not annualized)
 * - currentYieldPortfolioValue: Current market value of dividend-paying assets
 * - currentYieldAssetCount: Number of assets included
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

    // Calculate Current Yield metrics
    const currentYieldMetrics = calculateCurrentYieldMetrics(
      allDividends,
      allAssets,
      startDate,
      dividendEndDate,
      numberOfMonths
    );

    return NextResponse.json(currentYieldMetrics);
  } catch (error) {
    const authErrorResponse = getApiAuthErrorResponse(error);
    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error('[API /performance/current-yield] Error calculating Current Yield:', error);
    return NextResponse.json(
      { error: 'Failed to calculate Current Yield metrics' },
      { status: 500 }
    );
  }
}
