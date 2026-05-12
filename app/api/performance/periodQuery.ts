export type PerformancePeriodQuery = {
  startDate: Date;
  dividendEndDate: Date;
  numberOfMonths: number;
};

export type PerformancePeriodQueryResult =
  | { ok: true; value: PerformancePeriodQuery }
  | { ok: false; error: string };

export function parsePerformancePeriodQuery(
  searchParams: URLSearchParams
): PerformancePeriodQueryResult {
  const startDateStr = searchParams.get('startDate');
  const dividendEndDateStr = searchParams.get('dividendEndDate');
  const numberOfMonthsStr = searchParams.get('numberOfMonths');

  if (!startDateStr || !dividendEndDateStr || !numberOfMonthsStr) {
    return {
      ok: false,
      error: 'Missing required parameters: startDate, dividendEndDate, numberOfMonths',
    };
  }

  const startDate = new Date(startDateStr);
  const dividendEndDate = new Date(dividendEndDateStr);
  const numberOfMonths = Number(numberOfMonthsStr);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(dividendEndDate.getTime()) ||
    !Number.isInteger(numberOfMonths)
  ) {
    return { ok: false, error: 'Invalid date or numberOfMonths format' };
  }

  if (numberOfMonths < 1) {
    return { ok: false, error: 'numberOfMonths must be a positive integer' };
  }

  if (startDate > dividendEndDate) {
    return { ok: false, error: 'startDate must be before or equal to dividendEndDate' };
  }

  return {
    ok: true,
    value: {
      startDate,
      dividendEndDate,
      numberOfMonths,
    },
  };
}
