import type {
  CsvImportCashflowBatch,
  CsvImportCashflowImportRun,
} from '@/lib/server/imports/cashflowCommitTypes';

function getBatchRunKey(batch: CsvImportCashflowBatch): string {
  return batch.importRunId ?? batch.id;
}

function compareChildBatchesAscending(left: CsvImportCashflowBatch, right: CsvImportCashflowBatch): number {
  const leftChunkIndex = left.importChunkIndex ?? Number.MAX_SAFE_INTEGER;
  const rightChunkIndex = right.importChunkIndex ?? Number.MAX_SAFE_INTEGER;

  return (
    leftChunkIndex - rightChunkIndex
    || left.committedAt.getTime() - right.committedAt.getTime()
    || left.createdAt.getTime() - right.createdAt.getTime()
    || left.id.localeCompare(right.id)
  );
}

function compareRunSummariesDescending(left: CsvImportCashflowImportRun, right: CsvImportCashflowImportRun): number {
  return (
    right.committedAt.getTime() - left.committedAt.getTime()
    || right.createdAt.getTime() - left.createdAt.getTime()
    || left.importRunId.localeCompare(right.importRunId)
  );
}

export function sortCsvImportCashflowChildBatchesForRollback(
  childBatches: CsvImportCashflowBatch[]
): CsvImportCashflowBatch[] {
  return [...childBatches].sort(compareChildBatchesAscending).reverse();
}

export function groupCsvImportCashflowBatchesByRun(
  batches: CsvImportCashflowBatch[]
): CsvImportCashflowImportRun[] {
  const batchesByRun = new Map<string, CsvImportCashflowBatch[]>();

  batches.forEach((batch) => {
    const runId = getBatchRunKey(batch);
    const currentBatches = batchesByRun.get(runId) ?? [];
    currentBatches.push(batch);
    batchesByRun.set(runId, currentBatches);
  });

  return Array.from(batchesByRun.entries())
    .map(([importRunId, childBatches]) => {
      const sortedChildBatches = [...childBatches].sort(compareChildBatchesAscending);
      const committedChildBatches = sortedChildBatches.filter((batch) => batch.status === 'committed');
      const rolledBackChildBatches = sortedChildBatches.filter((batch) => batch.status === 'rolledBack');
      const childBatchCount = sortedChildBatches.length;
      const committedChildBatchCount = committedChildBatches.length;
      const rolledBackChildBatchCount = rolledBackChildBatches.length;
      const status: CsvImportCashflowImportRun['status'] = committedChildBatchCount === childBatchCount
        ? 'committed'
        : rolledBackChildBatchCount === childBatchCount
          ? 'rolledBack'
          : 'partial';

      return {
        importRunId,
        userId: sortedChildBatches[0]?.userId ?? '',
        status,
        childBatchCount,
        committedChildBatchCount,
        rolledBackChildBatchCount,
        rowCount: sortedChildBatches.reduce((total, batch) => total + batch.rowCount, 0),
        createdRecordCount: sortedChildBatches.reduce((total, batch) => total + batch.createdRecordCount, 0),
        duplicateCount: sortedChildBatches.reduce((total, batch) => total + batch.duplicateCount, 0),
        errorCount: sortedChildBatches.reduce((total, batch) => total + batch.errorCount, 0),
        createdAt: sortedChildBatches.reduce((earliest, batch) => (
          batch.createdAt.getTime() < earliest.getTime() ? batch.createdAt : earliest
        ), sortedChildBatches[0].createdAt),
        committedAt: sortedChildBatches.reduce((latest, batch) => (
          batch.committedAt.getTime() > latest.getTime() ? batch.committedAt : latest
        ), sortedChildBatches[0].committedAt),
        rolledBackAt: rolledBackChildBatches.length > 0
          ? rolledBackChildBatches.reduce((latest, batch) => (
              batch.rolledBackAt && batch.rolledBackAt.getTime() > latest.getTime()
                ? batch.rolledBackAt
                : latest
            ), rolledBackChildBatches[0].rolledBackAt ?? sortedChildBatches[0].committedAt)
          : null,
        rollbackReason: rolledBackChildBatches.length > 0
          ? rolledBackChildBatches[rolledBackChildBatches.length - 1].rollbackReason
          : null,
        canRollbackGrouped: committedChildBatchCount === childBatchCount,
        childBatches: sortedChildBatches,
      };
    })
    .sort(compareRunSummariesDescending);
}
