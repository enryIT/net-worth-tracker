'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useExpenseCategories } from '@/lib/hooks/useExpenses';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { queryKeys } from '@/lib/query/queryKeys';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';
import type {
  CsvImportCashflowBatch,
  CsvImportCashflowCreatedRecord,
  CsvImportCashflowImportRun,
} from '@/lib/server/imports/cashflowCommitTypes';
import type { CsvImportPreviewResult, ImportDedupeStatus, ImportIssue, ImportMovementKind, NormalizedImportRow } from '@/lib/server/imports/types';
import type { CsvImportPreset } from '@/lib/server/imports/presetTypes';
import type { ExpenseCategory } from '@/types/expenses';

const VALIDATE_ENDPOINT = '/api/imports/validate';
const PRESET_ENDPOINT = '/api/imports/presets';
const COMMIT_ENDPOINT = '/api/imports/commit';
const HISTORY_ENDPOINT = '/api/imports/runs';
const ROLLBACK_ENDPOINT_PREFIX = '/api/imports';
const ROLLBACK_RUN_ENDPOINT_PREFIX = '/api/imports/runs';

const DEFAULT_CSV = [
  'Data;Descrizione;Importo',
  '01/05/2026;Stipendio;2500,00',
  '02/05/2026;Spesa supermercato;-95,30',
].join('\n');

const DEFAULT_DATE_FORMATS = ['dd/MM/yyyy', 'dd/MM/yy', 'yyyy-MM-dd'];
const CSV_IMPORT_COMMIT_CHUNK_SIZE = 250;

function splitIntoCommitChunks<T>(rows: T[], chunkSize: number): T[][] {
  if (chunkSize <= 0) {
    return [rows];
  }

  const chunks: T[][] = [];
  for (let startIndex = 0; startIndex < rows.length; startIndex += chunkSize) {
    chunks.push(rows.slice(startIndex, startIndex + chunkSize));
  }

  return chunks;
}

function buildChunkIdempotencyKey(baseIdempotencyKey: string, chunkIndex: number): string {
  return `${baseIdempotencyKey}::chunk-${chunkIndex + 1}`;
}

const MOVEMENT_KIND_LABELS: Record<ImportMovementKind, string> = {
  cashflow: 'Cashflow',
  transfer: 'Trasferimento',
  investmentOperation: 'Operazione di investimento',
  dividend: 'Dividendo o cedola',
  fee: 'Commissione',
  tax: 'Tassa o imposta',
  unknown: 'Sconosciuto',
};

type MovementKindFilter = 'all' | ImportMovementKind;
type CashflowCommitMovementKind = Exclude<ImportMovementKind, 'unknown'>;
type HistoryCreatedRecordKind = CsvImportCashflowCreatedRecord['kind'];

interface RowOverride {
  movementKind?: ImportMovementKind;
  description?: string;
  sourceAccount?: string;
  destinationAccount?: string;
  assetName?: string;
  assetTicker?: string;
  assetIsin?: string;
  categoryLikeText?: string;
  ready?: boolean;
}

interface DisplayRow {
  rowIndex: number;
  rawPreview: Record<string, string>;
  canonicalFields: NormalizedImportRow['canonicalFields'];
  movementKind: ImportMovementKind;
  confidence: NormalizedImportRow['confidence'];
  classificationReason: string;
  issues: ImportIssue[];
  dedupeKey: string;
  dedupeStatus: ImportDedupeStatus;
  categoryLikeText: string;
  ready: boolean;
  hasBlockingIssues: boolean;
  hasWarningIssues: boolean;
  missingReferences: string[];
  statusLabel: string;
}

interface CsvImportCashflowBatchApiRecord extends Omit<CsvImportCashflowBatch, 'createdAt' | 'committedAt' | 'rolledBackAt'> {
  createdAt: string;
  committedAt: string;
  rolledBackAt: string | null;
}

interface CsvImportCashflowImportRunApiRecord extends Omit<CsvImportCashflowImportRun, 'createdAt' | 'committedAt' | 'rolledBackAt' | 'childBatches'> {
  createdAt: string;
  committedAt: string;
  rolledBackAt: string | null;
  childBatches: CsvImportCashflowBatchApiRecord[];
}

interface BatchCreatedRecordSummary {
  kind: HistoryCreatedRecordKind;
  label: string;
  count: number;
}

interface ImportHistoryBatch extends Omit<CsvImportCashflowBatch, 'createdAt' | 'committedAt' | 'rolledBackAt'> {
  createdAt: Date;
  committedAt: Date;
  rolledBackAt: Date | null;
}

interface ImportHistoryRun extends Omit<CsvImportCashflowImportRun, 'createdAt' | 'committedAt' | 'rolledBackAt' | 'childBatches'> {
  createdAt: Date;
  committedAt: Date;
  rolledBackAt: Date | null;
  childBatches: ImportHistoryBatch[];
}

function getMovementKindLabel(kind: ImportMovementKind): string {
  return MOVEMENT_KIND_LABELS[kind];
}

function getConfidenceLabel(confidence: NormalizedImportRow['confidence']): string {
  switch (confidence) {
    case 'high':
      return 'Alta';
    case 'medium':
      return 'Media';
    case 'low':
      return 'Bassa';
    default:
      return confidence;
  }
}

function normalizeTextOverride(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeUppercaseOverride(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed.toUpperCase() : null;
}

function applyOptionalTextOverride(baseValue: string | null, overrideValue: string | undefined): string | null {
  if (overrideValue === undefined) {
    return baseValue;
  }

  return normalizeTextOverride(overrideValue);
}

function applyOptionalUppercaseOverride(baseValue: string | null, overrideValue: string | undefined): string | null {
  if (overrideValue === undefined) {
    return baseValue;
  }

  return normalizeUppercaseOverride(overrideValue);
}

function hasManualRowOverrides(override?: RowOverride): boolean {
  return Boolean(
    override?.description !== undefined
    || override?.sourceAccount !== undefined
    || override?.destinationAccount !== undefined
    || override?.assetName !== undefined
    || override?.assetTicker !== undefined
    || override?.assetIsin !== undefined
    || override?.categoryLikeText !== undefined
  );
}

function buildManualCorrectionReason(
  override: RowOverride | undefined,
  originalReason: string
): string {
  if (!override) {
    return originalReason;
  }

  if (override.movementKind !== undefined) {
    return `Correzione manuale applicata in anteprima: tipo movimento impostato su ${getMovementKindLabel(override.movementKind)}.`;
  }

  if (hasManualRowOverrides(override)) {
    const trimmedOriginalReason = originalReason.trim();
    return trimmedOriginalReason.length > 0
      ? `${trimmedOriginalReason} Correzione manuale applicata in anteprima.`
      : 'Correzione manuale applicata in anteprima.';
  }

  return originalReason;
}

function buildLocalDedupeKey(
  movementKind: ImportMovementKind,
  canonicalFields: NormalizedImportRow['canonicalFields']
): string {
  return [
    movementKind,
    canonicalFields.date ?? '',
    canonicalFields.amount ?? '',
    canonicalFields.currency ?? '',
    canonicalFields.sourceType ?? '',
    canonicalFields.description ?? '',
    canonicalFields.sourceAccount ?? '',
    canonicalFields.destinationAccount ?? '',
    canonicalFields.assetTicker ?? '',
    canonicalFields.assetIsin ?? '',
    canonicalFields.assetName ?? '',
    canonicalFields.quantity ?? '',
    canonicalFields.unitPrice ?? '',
    canonicalFields.fees ?? '',
    canonicalFields.taxes ?? '',
  ].join('|');
}

function buildMissingReferences(
  movementKind: ImportMovementKind,
  canonicalFields: NormalizedImportRow['canonicalFields'],
  categoryLikeText: string
): string[] {
  const missingReferences: string[] = [];

  if (movementKind === 'transfer') {
    if (!canonicalFields.sourceAccount) {
      missingReferences.push('conto origine');
    }

    if (!canonicalFields.destinationAccount) {
      missingReferences.push('conto destinazione');
    }
  }

  if (movementKind === 'cashflow' || movementKind === 'fee' || movementKind === 'tax') {
    if (categoryLikeText.trim().length === 0) {
      missingReferences.push('categoria / sottocategoria');
    }
  }

  if (movementKind === 'investmentOperation' || movementKind === 'dividend') {
    if (!canonicalFields.assetName && !canonicalFields.assetTicker && !canonicalFields.assetIsin) {
      missingReferences.push('asset');
    }
  }

  return missingReferences;
}

function formatPreviewDate(value: string | null): string {
  if (!value) {
    return '—';
  }

  const parsedDate = toDate(value);
  return Number.isNaN(parsedDate.getTime()) ? value : formatDate(parsedDate);
}

function formatPreviewAmount(value: number | null, currency: string | null): string {
  if (value === null) {
    return '—';
  }

  return formatCurrency(value, currency ?? 'EUR');
}

function buildDuplicateIssue(rowIndex: number, status: 'possibleDuplicate' | 'duplicate'): ImportIssue {
  return {
    code: 'possible_duplicate',
    severity: 'warning',
    message:
      status === 'duplicate'
        ? 'Riga duplicata rilevata rispetto a un altro movimento in anteprima.'
        : 'Possibile duplicato rilevato: verifica prima di importare.',
    rowIndex,
  };
}

function buildDisplayRows(
  rows: NormalizedImportRow[],
  overrides: Record<number, RowOverride>
): DisplayRow[] {
  const preparedRows = rows.map((row) => {
    const override = overrides[row.rowIndex];
    const canonicalFields = {
      ...row.canonicalFields,
      description: applyOptionalTextOverride(row.canonicalFields.description, override?.description),
      sourceAccount: applyOptionalTextOverride(row.canonicalFields.sourceAccount, override?.sourceAccount),
      destinationAccount: applyOptionalTextOverride(row.canonicalFields.destinationAccount, override?.destinationAccount),
      assetName: applyOptionalTextOverride(row.canonicalFields.assetName, override?.assetName),
      assetTicker: applyOptionalUppercaseOverride(row.canonicalFields.assetTicker, override?.assetTicker),
      assetIsin: applyOptionalUppercaseOverride(row.canonicalFields.assetIsin, override?.assetIsin),
    };

    let movementKind = row.movementKind;
    let confidence = row.confidence;
    const classificationReason = buildManualCorrectionReason(override, row.classificationReason);

    if (override?.movementKind !== undefined) {
      movementKind = override.movementKind;
      confidence = 'high';
    }

    return {
      rowIndex: row.rowIndex,
      rawPreview: row.rawPreview,
      canonicalFields,
      movementKind,
      confidence,
      classificationReason,
      issues: row.issues.filter((issue) => issue.code !== 'possible_duplicate'),
      dedupeKey: buildLocalDedupeKey(movementKind, canonicalFields),
      dedupeStatus: row.dedupeStatus,
      categoryLikeText: normalizeTextOverride(override?.categoryLikeText) ?? '',
      ready: override?.ready ?? true,
      hasBlockingIssues: false,
      hasWarningIssues: false,
      missingReferences: [],
      statusLabel: '',
    };
  });

  const duplicateGroups = new Map<string, number[]>();
  preparedRows.forEach((row, index) => {
    const indexes = duplicateGroups.get(row.dedupeKey) ?? [];
    indexes.push(index);
    duplicateGroups.set(row.dedupeKey, indexes);
  });

  return preparedRows.map((row, index) => {
    const indexes = duplicateGroups.get(row.dedupeKey) ?? [];
    let dedupeStatus: ImportDedupeStatus = 'unique';
    let issues = row.issues;

    if (indexes.length > 1) {
      const position = indexes.indexOf(index);
      dedupeStatus = position === 0 ? 'possibleDuplicate' : 'duplicate';
      issues = [...issues, buildDuplicateIssue(row.rowIndex, dedupeStatus)];
    }

    const hasBlockingIssues = issues.some((issue) => issue.severity === 'blocking');
    const hasWarningIssues = issues.some((issue) => issue.severity === 'warning');
    const missingReferences = buildMissingReferences(row.movementKind, row.canonicalFields, row.categoryLikeText);
    const ready = !hasBlockingIssues && row.ready;
    const statusLabel = hasBlockingIssues
      ? 'Bloccata'
      : ready
        ? (hasWarningIssues || missingReferences.length > 0 ? 'Pronta con avvisi' : 'Pronta')
        : 'Da rivedere';

    return {
      ...row,
      issues,
      dedupeStatus,
      hasBlockingIssues,
      hasWarningIssues: hasWarningIssues || missingReferences.length > 0,
      missingReferences,
      ready,
      statusLabel,
    };
  });
}

function getIssueSummary(row: DisplayRow): string[] {
  const issueMessages = row.issues.map((issue) => issue.message);

  if (row.missingReferences.length > 0) {
    issueMessages.push(`Riferimenti mancanti: ${row.missingReferences.join(', ')}`);
  }

  return issueMessages;
}

const CREATED_RECORD_KIND_LABELS: Record<HistoryCreatedRecordKind, string> = {
  cashflow: 'Cashflow',
  internalTransfer: 'Transfer',
  investmentOperation: 'Investimenti',
  dividend: 'Dividendi',
};

function normalizeImportHistoryBatch(batch: CsvImportCashflowBatchApiRecord): ImportHistoryBatch {
  return {
    ...batch,
    createdAt: toDate(batch.createdAt),
    committedAt: toDate(batch.committedAt),
    rolledBackAt: batch.rolledBackAt ? toDate(batch.rolledBackAt) : null,
  };
}

function normalizeImportHistoryRun(run: CsvImportCashflowImportRunApiRecord): ImportHistoryRun {
  return {
    ...run,
    createdAt: toDate(run.createdAt),
    committedAt: toDate(run.committedAt),
    rolledBackAt: run.rolledBackAt ? toDate(run.rolledBackAt) : null,
    childBatches: run.childBatches.map(normalizeImportHistoryBatch),
  };
}

function getImportHistoryRunStatusLabel(status: CsvImportCashflowImportRun['status']): string {
  if (status === 'partial') {
    return 'Parziale';
  }

  return status === 'rolledBack' ? 'Annullata' : 'Confermata';
}

function getImportHistoryRunStatusBadgeClass(status: CsvImportCashflowImportRun['status']): string {
  return status === 'rolledBack'
    ? 'border-slate-300 bg-slate-100 text-slate-700'
    : status === 'partial'
      ? 'border-amber-300 bg-amber-50 text-amber-700'
    : 'border-emerald-300 bg-emerald-50 text-emerald-700';
}

function getImportHistoryBatchStatusLabel(status: CsvImportCashflowBatch['status']): string {
  return status === 'rolledBack' ? 'Annullato' : 'Confermato';
}

function getImportHistoryBatchStatusBadgeClass(status: CsvImportCashflowBatch['status']): string {
  return status === 'rolledBack'
    ? 'border-slate-300 bg-slate-100 text-slate-700'
    : 'border-emerald-300 bg-emerald-50 text-emerald-700';
}

function groupBatchCreatedRecords(records: CsvImportCashflowCreatedRecord[]): BatchCreatedRecordSummary[] {
  const counts = records.reduce<Record<HistoryCreatedRecordKind, number>>((accumulator, record) => {
    accumulator[record.kind] += 1;
    return accumulator;
  }, {
    cashflow: 0,
    internalTransfer: 0,
    investmentOperation: 0,
    dividend: 0,
  });

  return (Object.entries(counts) as Array<[HistoryCreatedRecordKind, number]>)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => ({
      kind,
      count,
      label: CREATED_RECORD_KIND_LABELS[kind],
    }));
}

function formatImportHistoryBatchTimestamp(date: Date | null): string {
  return date ? formatDate(date) : '—';
}

interface CommitBatchSummary {
  batchId: string;
  importRunId: string | null;
  importChunkIndex: number | null;
  importChunkCount: number | null;
  createdRecordCount: number;
  wasIdempotent: boolean;
  status: 'committed' | 'rolledBack';
  removedRecordCount?: number;
}

interface CommitRunState {
  totalChunks: number;
  currentChunk: number;
  completedChunks: number;
  totalCreatedRecordCount: number;
  failureMessage: string | null;
  failedChunk: number | null;
}

interface CashflowCommitRowPayload {
  rowIndex: number;
  movementKind: CashflowCommitMovementKind;
  ready: boolean;
  dedupeKey: string;
  dedupeStatus: ImportDedupeStatus;
  issues: ImportIssue[];
  canonicalFields: NormalizedImportRow['canonicalFields'];
  categoryId: string | null;
  categoryName: string | null;
  subCategoryId: string | null;
  subCategoryName: string | null;
}

function normalizeCategoryMatch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function resolveConfirmedCashflowCategory(
  categoryLikeText: string,
  categories: ExpenseCategory[]
): {
  categoryId: string;
  categoryName: string;
  subCategoryId: string | null;
  subCategoryName: string | null;
} | null {
  const trimmedText = categoryLikeText.trim();
  if (!trimmedText) {
    return null;
  }

  const [rawCategoryName, ...rawSubCategoryParts] = trimmedText.split('/');
  const categoryName = rawCategoryName.trim();
  if (!categoryName) {
    return null;
  }

  const matchedCategory = categories.find(
    (category) => normalizeCategoryMatch(category.name) === normalizeCategoryMatch(categoryName)
  );

  if (!matchedCategory) {
    return null;
  }

  const subCategoryName = rawSubCategoryParts.join('/').trim();
  if (!subCategoryName) {
    return {
      categoryId: matchedCategory.id,
      categoryName: matchedCategory.name,
      subCategoryId: null,
      subCategoryName: null,
    };
  }

  const matchedSubCategory = matchedCategory.subCategories.find(
    (subCategory) => normalizeCategoryMatch(subCategory.name) === normalizeCategoryMatch(subCategoryName)
  );

  if (!matchedSubCategory) {
    return null;
  }

  return {
    categoryId: matchedCategory.id,
    categoryName: matchedCategory.name,
    subCategoryId: matchedSubCategory.id,
    subCategoryName: matchedSubCategory.name,
  };
}

function ImportCsvPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: expenseCategories = [], isLoading: categoriesLoading } = useExpenseCategories(user?.uid);
  const [csvText, setCsvText] = useState(DEFAULT_CSV);
  const [selectedFileName, setSelectedFileName] = useState('');
  const [dateColumn, setDateColumn] = useState('Data');
  const [descriptionColumn, setDescriptionColumn] = useState('Descrizione');
  const [amountColumn, setAmountColumn] = useState('Importo');
  const [decimalSeparator, setDecimalSeparator] = useState<',' | '.'>(',');
  const [thousandsSeparator, setThousandsSeparator] = useState<',' | '.' | ' ' | "'">('.');
  const [defaultCurrency, setDefaultCurrency] = useState('EUR');
  const [isValidating, setIsValidating] = useState(false);
  const [preview, setPreview] = useState<CsvImportPreviewResult | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const [presets, setPresets] = useState<CsvImportPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [isPresetLoading, setIsPresetLoading] = useState(false);
  const [isPresetMutating, setIsPresetMutating] = useState(false);

  const [rowOverrides, setRowOverrides] = useState<Record<number, RowOverride>>({});
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<number[]>([]);
  const [bulkMovementKind, setBulkMovementKind] = useState<MovementKindFilter>('all');
  const [bulkDescription, setBulkDescription] = useState('');
  const [bulkCategoryLikeText, setBulkCategoryLikeText] = useState('');
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);
  const [showOnlyWarnings, setShowOnlyWarnings] = useState(false);
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
  const [showOnlyUnknownMovement, setShowOnlyUnknownMovement] = useState(false);
  const [showOnlyMissingReferences, setShowOnlyMissingReferences] = useState(false);
  const [movementKindFilter, setMovementKindFilter] = useState<MovementKindFilter>('all');
  const commitIdempotencyKeyRef = useRef<string | null>(null);
  const commitRunIdRef = useRef<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [commitBatchSummary, setCommitBatchSummary] = useState<CommitBatchSummary | null>(null);
  const [commitRunState, setCommitRunState] = useState<CommitRunState | null>(null);
  const [importHistoryRollbackTarget, setImportHistoryRollbackTarget] = useState<ImportHistoryRun | null>(null);

  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedPresetId) ?? null,
    [presets, selectedPresetId]
  );

  useEffect(() => {
    commitIdempotencyKeyRef.current = null;
    commitRunIdRef.current = null;
  }, [expenseCategories, rowOverrides, selectedPresetId]);

  const loadPresets = useCallback(async () => {
    if (!user) {
      setPresets([]);
      setSelectedPresetId('');
      setPresetName('');
      return;
    }

    try {
      setIsPresetLoading(true);
      const response = await authenticatedFetch(PRESET_ENDPOINT);
      const payload = await response.json();

      if (!response.ok) {
        const message = typeof payload?.error === 'string'
          ? payload.error
          : 'Errore durante il caricamento dei preset';
        toast.error(message);
        return;
      }

      const loadedPresets = Array.isArray(payload?.data)
        ? (payload.data as CsvImportPreset[])
        : [];

      setPresets(loadedPresets);
      setSelectedPresetId((currentValue) => (
        loadedPresets.some((preset) => preset.id === currentValue)
          ? currentValue
          : ''
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    } finally {
      setIsPresetLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void loadPresets();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [loadPresets]);

  const importHistoryQuery = useQuery({
    queryKey: queryKeys.imports.runs(user?.uid ?? ''),
    enabled: Boolean(user?.uid),
    queryFn: async () => {
      const response = await authenticatedFetch(HISTORY_ENDPOINT);
      const payload = await response.json();

      if (!response.ok) {
        const message = typeof payload?.error === 'string'
          ? payload.error
          : 'Errore durante il caricamento dello storico import CSV';
        throw new Error(message);
      }

      const history = Array.isArray(payload?.data)
        ? (payload.data as CsvImportCashflowImportRunApiRecord[])
        : [];

      return history.map(normalizeImportHistoryRun);
    },
  });

  const importHistory = importHistoryQuery.data ?? [];
  const importHistoryError = importHistoryQuery.error instanceof Error
    ? importHistoryQuery.error.message
    : importHistoryQuery.error
      ? 'Errore durante il caricamento dello storico import CSV'
      : null;

  const buildPresetPayload = useCallback(() => ({
    mapping: {
      date: dateColumn,
      description: descriptionColumn,
      amount: amountColumn,
    },
    locale: {
      dateFormats: DEFAULT_DATE_FORMATS,
      decimalSeparator,
      thousandsSeparator,
      defaultCurrency: defaultCurrency.trim() || 'EUR',
    },
  }), [
    amountColumn,
    dateColumn,
    decimalSeparator,
    defaultCurrency,
    descriptionColumn,
    thousandsSeparator,
  ]);

  const savePreset = useCallback(async () => {
    if (!user) {
      toast.error('Utente non autenticato');
      return;
    }

    const normalizedName = presetName.trim();
    if (!normalizedName) {
      toast.error('Nome preset obbligatorio');
      return;
    }

    try {
      setIsPresetMutating(true);

      const response = await authenticatedFetch(PRESET_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: normalizedName,
          sourceLabel: null,
          ...buildPresetPayload(),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        const message = typeof payload?.error === 'string'
          ? payload.error
          : 'Errore durante il salvataggio del preset';
        toast.error(message);
        return;
      }

      const createdPreset = payload?.data as CsvImportPreset;
      setPresets((currentPresets) => [
        createdPreset,
        ...currentPresets.filter((preset) => preset.id !== createdPreset.id),
      ]);
      setSelectedPresetId(createdPreset.id);
      setPresetName(createdPreset.name);
      toast.success('Preset salvato');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    } finally {
      setIsPresetMutating(false);
    }
  }, [buildPresetPayload, presetName, user]);

  const updatePreset = useCallback(async () => {
    if (!user) {
      toast.error('Utente non autenticato');
      return;
    }

    if (!selectedPresetId) {
      toast.error('Seleziona un preset da aggiornare');
      return;
    }

    const normalizedName = presetName.trim() || selectedPreset?.name;
    if (!normalizedName) {
      toast.error('Nome preset obbligatorio');
      return;
    }

    try {
      setIsPresetMutating(true);

      const response = await authenticatedFetch(`${PRESET_ENDPOINT}/${selectedPresetId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: normalizedName,
          sourceLabel: selectedPreset?.sourceLabel ?? null,
          ...buildPresetPayload(),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        const message = typeof payload?.error === 'string'
          ? payload.error
          : 'Errore durante l\'aggiornamento del preset';
        toast.error(message);
        return;
      }

      const updatedPreset = payload?.data as CsvImportPreset;
      setPresets((currentPresets) => currentPresets.map((preset) => (
        preset.id === updatedPreset.id ? updatedPreset : preset
      )));
      setPresetName(updatedPreset.name);
      toast.success('Preset aggiornato');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    } finally {
      setIsPresetMutating(false);
    }
  }, [buildPresetPayload, presetName, selectedPreset, selectedPresetId, user]);

  const deletePreset = useCallback(async () => {
    if (!user) {
      toast.error('Utente non autenticato');
      return;
    }

    if (!selectedPresetId) {
      toast.error('Seleziona un preset da eliminare');
      return;
    }

    try {
      setIsPresetMutating(true);

      const response = await authenticatedFetch(`${PRESET_ENDPOINT}/${selectedPresetId}`, {
        method: 'DELETE',
      });

      const payload = await response.json();

      if (!response.ok) {
        const message = typeof payload?.error === 'string'
          ? payload.error
          : 'Errore durante l\'eliminazione del preset';
        toast.error(message);
        return;
      }

      setPresets((currentPresets) => (
        currentPresets.filter((preset) => preset.id !== selectedPresetId)
      ));
      setSelectedPresetId('');
      setPresetName('');
      toast.success('Preset eliminato');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    } finally {
      setIsPresetMutating(false);
    }
  }, [selectedPresetId, user]);

  const applySelectedPreset = useCallback(() => {
    if (!selectedPreset) {
      toast.error('Seleziona un preset da caricare');
      return;
    }

    setDateColumn(selectedPreset.mapping.date ?? '');
    setDescriptionColumn(selectedPreset.mapping.description ?? '');
    setAmountColumn(selectedPreset.mapping.amount ?? '');
    setDecimalSeparator(selectedPreset.locale.decimalSeparator);
    setThousandsSeparator(selectedPreset.locale.thousandsSeparator);
    setDefaultCurrency(selectedPreset.locale.defaultCurrency || 'EUR');
    setPresetName(selectedPreset.name);
    toast.success('Preset caricato');
  }, [selectedPreset]);

  const handleFileChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) {
      return;
    }

    try {
      const fileText = await file.text();
      setSelectedFileName(file.name);
      setCsvText(fileText);
      setPreview(null);
      setApiError(null);
      setRowOverrides({});
      setSelectedRowId(null);
      setSelectedRowIds([]);
      setCommitBatchSummary(null);
      setCommitRunState(null);
      commitIdempotencyKeyRef.current = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    }
  }, []);

  const handleValidatePreview = useCallback(async () => {
    if (!user) {
      toast.error('Utente non autenticato');
      return;
    }

    try {
      setIsValidating(true);
      setApiError(null);
      setCommitBatchSummary(null);
      setCommitRunState(null);
      commitIdempotencyKeyRef.current = null;

      const response = await authenticatedFetch(VALIDATE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.uid,
          csvText,
          mapping: {
            date: dateColumn,
            description: descriptionColumn,
            amount: amountColumn,
          },
          locale: {
            dateFormats: DEFAULT_DATE_FORMATS,
            decimalSeparator,
            thousandsSeparator,
            defaultCurrency: defaultCurrency.trim() || 'EUR',
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        const message = typeof payload?.error === 'string'
          ? payload.error
          : 'Errore durante la validazione';
        setApiError(message);
        setPreview(null);
        return;
      }

      setPreview(payload.data as CsvImportPreviewResult);
      setRowOverrides({});
      setSelectedRowId(null);
      setSelectedRowIds([]);
      setCommitBatchSummary(null);
      setCommitRunState(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setApiError(message);
      setPreview(null);
    } finally {
      setIsValidating(false);
    }
  }, [
    amountColumn,
    csvText,
    dateColumn,
    defaultCurrency,
    descriptionColumn,
    decimalSeparator,
    thousandsSeparator,
    user,
  ]);

  const displayRows = useMemo(
    () => buildDisplayRows(preview?.rows ?? [], rowOverrides),
    [preview, rowOverrides]
  );

  const readyCommitRows = useMemo(
    () => displayRows.filter((row) => row.ready && row.movementKind !== 'unknown'),
    [displayRows]
  );

  const cashflowCommitPreparation = useMemo(() => {
    let unresolvedReadyCategoryRows = 0;
    let unresolvedReadyTransferRows = 0;
    let unresolvedReadyInvestmentRows = 0;
    let unresolvedReadyDividendRows = 0;
    let duplicateReadyRows = 0;
    const rows: CashflowCommitRowPayload[] = [];

    readyCommitRows.forEach((row) => {
      if (row.dedupeStatus === 'duplicate') {
        duplicateReadyRows += 1;
        return;
      }

      if (row.movementKind === 'transfer') {
        if (!row.canonicalFields.sourceAccount || !row.canonicalFields.destinationAccount) {
          unresolvedReadyTransferRows += 1;
          return;
        }

        rows.push({
          rowIndex: row.rowIndex,
          movementKind: 'transfer',
          ready: row.ready,
          dedupeKey: row.dedupeKey,
          dedupeStatus: row.dedupeStatus,
          issues: row.issues,
          canonicalFields: row.canonicalFields,
          categoryId: null,
          categoryName: null,
          subCategoryId: null,
          subCategoryName: null,
        });
        return;
      }

      if (row.movementKind === 'investmentOperation') {
        if (!row.canonicalFields.assetName && !row.canonicalFields.assetTicker && !row.canonicalFields.assetIsin) {
          unresolvedReadyInvestmentRows += 1;
          return;
        }

        rows.push({
          rowIndex: row.rowIndex,
          movementKind: 'investmentOperation',
          ready: row.ready,
          dedupeKey: row.dedupeKey,
          dedupeStatus: row.dedupeStatus,
          issues: row.issues,
          canonicalFields: row.canonicalFields,
          categoryId: null,
          categoryName: null,
          subCategoryId: null,
          subCategoryName: null,
        });
        return;
      }

      if (row.movementKind === 'dividend') {
        if (!row.canonicalFields.assetName && !row.canonicalFields.assetTicker && !row.canonicalFields.assetIsin) {
          unresolvedReadyDividendRows += 1;
          return;
        }

        rows.push({
          rowIndex: row.rowIndex,
          movementKind: 'dividend',
          ready: row.ready,
          dedupeKey: row.dedupeKey,
          dedupeStatus: row.dedupeStatus,
          issues: row.issues,
          canonicalFields: row.canonicalFields,
          categoryId: null,
          categoryName: null,
          subCategoryId: null,
          subCategoryName: null,
        });
        return;
      }

      if (row.movementKind === 'cashflow' || row.movementKind === 'fee' || row.movementKind === 'tax') {
        const confirmedCategory = resolveConfirmedCashflowCategory(row.categoryLikeText, expenseCategories);
        if (!confirmedCategory) {
          unresolvedReadyCategoryRows += 1;
          return;
        }

        rows.push({
          rowIndex: row.rowIndex,
          movementKind: row.movementKind,
          ready: row.ready,
          dedupeKey: row.dedupeKey,
          dedupeStatus: row.dedupeStatus,
          issues: row.issues,
          canonicalFields: row.canonicalFields,
          categoryId: confirmedCategory.categoryId,
          categoryName: confirmedCategory.categoryName,
          subCategoryId: confirmedCategory.subCategoryId,
          subCategoryName: confirmedCategory.subCategoryName,
        });
      }
    });

    return {
      rows,
      unresolvedReadyCategoryRows,
      unresolvedReadyTransferRows,
      unresolvedReadyInvestmentRows,
      unresolvedReadyDividendRows,
      duplicateReadyRows,
    };
  }, [expenseCategories, readyCommitRows]);

  const filteredRows = useMemo(() => displayRows.filter((row) => {
    if (showOnlyErrors && !row.hasBlockingIssues) {
      return false;
    }

    if (showOnlyWarnings && !row.hasWarningIssues) {
      return false;
    }

    if (showOnlyDuplicates && row.dedupeStatus === 'unique') {
      return false;
    }

    if (showOnlyUnknownMovement && row.movementKind !== 'unknown') {
      return false;
    }

    if (showOnlyMissingReferences && row.missingReferences.length === 0) {
      return false;
    }

    if (movementKindFilter !== 'all' && row.movementKind !== movementKindFilter) {
      return false;
    }

    return true;
  }), [
    displayRows,
    movementKindFilter,
    showOnlyDuplicates,
    showOnlyErrors,
    showOnlyMissingReferences,
    showOnlyUnknownMovement,
    showOnlyWarnings,
  ]);

  const previewStats = useMemo(() => {
    const summaryByKind: Record<ImportMovementKind, number> = {
      cashflow: 0,
      transfer: 0,
      investmentOperation: 0,
      dividend: 0,
      fee: 0,
      tax: 0,
      unknown: 0,
    };

    let readyRows = 0;
    let blockingRows = 0;
    let warningRows = 0;
    let duplicateRows = 0;
    let unresolvedReferenceRows = 0;

    displayRows.forEach((row) => {
      summaryByKind[row.movementKind] += 1;

      if (row.ready) {
        readyRows += 1;
      }

      if (row.hasBlockingIssues) {
        blockingRows += 1;
      }

      if (row.hasWarningIssues) {
        warningRows += 1;
      }

      if (row.dedupeStatus !== 'unique') {
        duplicateRows += 1;
      }

      if (row.missingReferences.length > 0) {
        unresolvedReferenceRows += 1;
      }
    });

    return {
      readyRows,
      blockingRows,
      warningRows,
      duplicateRows,
      unresolvedReferenceRows,
      summaryByKind,
    };
  }, [displayRows]);

  const selectedRow = useMemo(
    () => displayRows.find((row) => row.rowIndex === selectedRowId) ?? displayRows[0] ?? null,
    [displayRows, selectedRowId]
  );

  const selectedRowValue = selectedRow ? String(selectedRow.rowIndex) : undefined;

  const updateRowOverride = useCallback((rowIndex: number, patch: Partial<RowOverride>) => {
    setRowOverrides((currentOverrides) => ({
      ...currentOverrides,
      [rowIndex]: {
        ...(currentOverrides[rowIndex] ?? {}),
        ...patch,
      },
    }));
  }, []);

  const resetRowOverride = useCallback((rowIndex: number) => {
    setRowOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };
      delete nextOverrides[rowIndex];
      return nextOverrides;
    });
  }, []);

  const toggleBulkSelection = useCallback((rowIndex: number) => {
    setSelectedRowIds((currentSelected) => (
      currentSelected.includes(rowIndex)
        ? currentSelected.filter((id) => id !== rowIndex)
        : [...currentSelected, rowIndex]
    ));
  }, []);

  const applyBulkEdit = useCallback(() => {
    if (selectedRowIds.length === 0) {
      toast.error('Seleziona almeno una riga per la modifica massiva');
      return;
    }

    const normalizedDescription = bulkDescription.trim();
    const normalizedCategoryLikeText = bulkCategoryLikeText.trim();

    setRowOverrides((currentOverrides) => {
      const nextOverrides = { ...currentOverrides };

      selectedRowIds.forEach((rowIndex) => {
        const currentRowOverride = nextOverrides[rowIndex] ?? {};
        nextOverrides[rowIndex] = {
          ...currentRowOverride,
          ...(bulkMovementKind === 'all' ? {} : { movementKind: bulkMovementKind }),
          ...(normalizedDescription ? { description: normalizedDescription } : {}),
          ...(normalizedCategoryLikeText ? { categoryLikeText: normalizedCategoryLikeText } : {}),
        };
      });

      return nextOverrides;
    });

    toast.success('Modifica massiva applicata');
  }, [bulkCategoryLikeText, bulkDescription, bulkMovementKind, selectedRowIds]);

  const invalidateImportRelatedQueries = useCallback(async () => {
    if (!user) {
      return;
    }

    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all(user.uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.expenses.stats(user.uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.operations(user.uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.realized(user.uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.transfers(user.uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(user.uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.imports.history(user.uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.imports.runs(user.uid) }),
      ]);
    } catch (error) {
      console.error('[POST /api/imports/commit] Unable to invalidate import-related queries:', error);
    }
  }, [queryClient, user]);

  const toggleReadyState = useCallback(() => {
    if (!selectedRow) {
      return;
    }

    if (selectedRow.hasBlockingIssues) {
      return;
    }

    updateRowOverride(selectedRow.rowIndex, { ready: !selectedRow.ready });
  }, [selectedRow, updateRowOverride]);

  const rollbackImportBatch = useCallback(async (
    batchId: string,
    rollbackReason = 'annullamento manuale'
  ): Promise<boolean> => {
    if (!user) {
      toast.error('Utente non autenticato');
      return false;
    }

    if (!batchId.trim()) {
      toast.error('Batch non valido');
      return false;
    }

    try {
      setIsRollingBack(true);

      const response = await authenticatedFetch(
        `${ROLLBACK_ENDPOINT_PREFIX}/${batchId}/rollback`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            rollbackReason,
          }),
        }
      );

      const payload = await response.json();
      if (!response.ok) {
        const message = typeof payload?.error === 'string'
          ? payload.error
          : 'Errore durante l\'annullamento del batch import CSV';
        toast.error(message);
        return false;
      }

      const result = payload?.data as {
        batch: { id: string };
        removedRecordCount: number;
      };

      commitIdempotencyKeyRef.current = null;
      setCommitBatchSummary((currentSummary) => (
        currentSummary?.batchId === batchId && currentSummary.status === 'committed'
          ? {
              ...currentSummary,
              status: 'rolledBack',
              removedRecordCount: result.removedRecordCount,
            }
          : currentSummary
      ));

      await invalidateImportRelatedQueries();

      toast.success(`Batch ${result.batch.id} annullato`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
      return false;
    } finally {
      setIsRollingBack(false);
    }
  }, [invalidateImportRelatedQueries, user]);

  const rollbackImportRun = useCallback(async (
    importRunId: string,
    rollbackReason = 'annullamento raggruppato'
  ): Promise<boolean> => {
    if (!user) {
      toast.error('Utente non autenticato');
      return false;
    }

    if (!importRunId.trim()) {
      toast.error('Importazione raggruppata non valida');
      return false;
    }

    try {
      setIsRollingBack(true);

      const response = await authenticatedFetch(
        `${ROLLBACK_RUN_ENDPOINT_PREFIX}/${importRunId}/rollback`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            rollbackReason,
          }),
        }
      );

      const payload = await response.json();
      if (!response.ok) {
        const message = typeof payload?.error === 'string'
          ? payload.error
          : 'Errore durante l\'annullamento dell\'importazione raggruppata';
        toast.error(message);
        return false;
      }

      const result = payload?.data as {
        importRunId: string;
        status: 'rolledBack' | 'partial' | 'unsafe';
        removedRecordCount: number;
        childBatchCount: number;
        rolledBackChildBatchCount: number;
      };

      commitIdempotencyKeyRef.current = null;
      commitRunIdRef.current = null;
      setCommitBatchSummary((currentSummary) => (
        currentSummary?.importRunId === importRunId && currentSummary.status === 'committed'
          ? {
              ...currentSummary,
              status: 'rolledBack',
              removedRecordCount: result.removedRecordCount,
            }
          : currentSummary
      ));

      await invalidateImportRelatedQueries();

      if (result.status === 'rolledBack') {
        toast.success(`Importazione raggruppata ${result.importRunId} annullata`);
      } else {
        toast.error(`Importazione raggruppata ${result.importRunId} annullata parzialmente`);
      }

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
      return false;
    } finally {
      setIsRollingBack(false);
    }
  }, [invalidateImportRelatedQueries, user]);

  const handleCommitCashflowRows = useCallback(async () => {
    if (!user) {
      toast.error('Utente non autenticato');
      return;
    }

    const commitRows = cashflowCommitPreparation.rows;
    if (commitRows.length === 0) {
      toast.error('Nessuna riga pronta da importare');
      return;
    }

    const commitChunks = splitIntoCommitChunks(commitRows, CSV_IMPORT_COMMIT_CHUNK_SIZE);
    const baseIdempotencyKey = commitIdempotencyKeyRef.current
      ?? (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `cashflow-import-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const importRunId = commitRunIdRef.current
      ?? (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `cashflow-import-run-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    commitIdempotencyKeyRef.current = baseIdempotencyKey;
    commitRunIdRef.current = importRunId;

    setIsCommitting(true);
    setCommitBatchSummary(null);
    setCommitRunState({
      totalChunks: commitChunks.length,
      currentChunk: 0,
      completedChunks: 0,
      totalCreatedRecordCount: 0,
      failureMessage: null,
      failedChunk: null,
    });

    let completedChunks = 0;
    let totalCreatedRecordCount = 0;
    let allChunksIdempotent = true;
    let latestSuccessfulBatchWasIdempotent = true;
    let hasCommittedAnyChunk = false;
    let failedChunk = 0;

    try {
      for (let chunkIndex = 0; chunkIndex < commitChunks.length; chunkIndex += 1) {
        const chunkRows = commitChunks[chunkIndex];
        const chunkNumber = chunkIndex + 1;

        setCommitRunState({
          totalChunks: commitChunks.length,
          currentChunk: chunkNumber,
          completedChunks,
          totalCreatedRecordCount,
          failureMessage: null,
          failedChunk: null,
        });

        const chunkIdempotencyKey = buildChunkIdempotencyKey(baseIdempotencyKey, chunkIndex);
        const response = await authenticatedFetch(COMMIT_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: user.uid,
            importRunId,
            importChunkIndex: chunkNumber,
            importChunkCount: commitChunks.length,
            idempotencyKey: chunkIdempotencyKey,
            presetId: selectedPresetId || null,
            sourceFingerprint: null,
            rows: chunkRows,
          }),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message = typeof payload?.error === 'string'
            ? payload.error
            : 'Errore durante la conferma import CSV';
          const failurePrefix = completedChunks > 0
            ? `Il chunk ${chunkNumber}/${commitChunks.length} è fallito dopo ${completedChunks} chunk già confermati`
            : `Il chunk ${chunkNumber}/${commitChunks.length} è fallito`;
          failedChunk = chunkNumber;
          throw new Error(`${failurePrefix}: ${message}`);
        }

        const result = payload?.data as {
          batch: {
            id: string;
            importRunId: string | null;
            importChunkIndex: number | null;
            importChunkCount: number | null;
          };
          createdRecordCount: number;
          wasIdempotent: boolean;
        } | undefined;

        if (!result?.batch?.id) {
          failedChunk = chunkNumber;
          throw new Error(`Il chunk ${chunkNumber}/${commitChunks.length} non ha restituito un batch valido`);
        }

        totalCreatedRecordCount += result.createdRecordCount;
        completedChunks = chunkNumber;
        hasCommittedAnyChunk = true;
        allChunksIdempotent = allChunksIdempotent && result.wasIdempotent;
        latestSuccessfulBatchWasIdempotent = allChunksIdempotent;

        setCommitBatchSummary({
          batchId: result.batch.id,
          importRunId: result.batch.importRunId ?? null,
          importChunkIndex: result.batch.importChunkIndex ?? null,
          importChunkCount: result.batch.importChunkCount ?? null,
          createdRecordCount: totalCreatedRecordCount,
          wasIdempotent: latestSuccessfulBatchWasIdempotent,
          status: 'committed',
        });

        setCommitRunState({
          totalChunks: commitChunks.length,
          currentChunk: chunkNumber,
          completedChunks,
          totalCreatedRecordCount,
          failureMessage: null,
          failedChunk: null,
        });
      }

      if (!hasCommittedAnyChunk) {
        throw new Error('Nessun batch confermato durante la commit a chunk');
      }

      setCommitRunState({
        totalChunks: commitChunks.length,
        currentChunk: commitChunks.length,
        completedChunks: commitChunks.length,
        totalCreatedRecordCount,
        failureMessage: null,
        failedChunk: null,
      });

      await invalidateImportRelatedQueries();

      toast.success(
        `Importazione movimenti confermata: ${commitChunks.length} chunk, ${totalCreatedRecordCount} record creati`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nextFailedChunk = failedChunk || Math.min(completedChunks + 1, commitChunks.length);

      setCommitRunState({
        totalChunks: commitChunks.length,
        currentChunk: nextFailedChunk,
        completedChunks,
        totalCreatedRecordCount,
        failureMessage: message,
        failedChunk: nextFailedChunk,
      });

      if (hasCommittedAnyChunk) {
        await invalidateImportRelatedQueries();
      }

      toast.error(message);
    } finally {
      setIsCommitting(false);
    }
  }, [cashflowCommitPreparation.rows, invalidateImportRelatedQueries, selectedPresetId, user]);

  const handleRollbackCommittedBatch = useCallback(async () => {
    if (!commitBatchSummary || commitBatchSummary.status !== 'committed') {
      toast.error('Nessun batch confermato da annullare');
      return;
    }

    if (commitBatchSummary.importRunId && (commitBatchSummary.importChunkCount ?? 1) > 1) {
      await rollbackImportRun(commitBatchSummary.importRunId);
      return;
    }

    await rollbackImportBatch(commitBatchSummary.batchId);
  }, [commitBatchSummary, rollbackImportBatch, rollbackImportRun]);

  const selectedRowTitle = selectedRow
    ? `Riga ${selectedRow.rowIndex}`
    : 'Nessuna riga selezionata';

  const commitPanelToneClass = commitRunState?.failureMessage
    ? 'border-rose-200 bg-rose-50/70'
    : commitBatchSummary?.status === 'rolledBack'
      ? 'border-slate-200 bg-slate-50/70'
      : commitBatchSummary
        ? 'border-emerald-200 bg-emerald-50/70'
        : 'border-amber-200 bg-amber-50/70';

  const commitPanelTitle = commitRunState?.failureMessage
    ? 'Importazione interrotta'
    : isCommitting
      ? 'Conferma importazione in corso'
      : commitBatchSummary?.status === 'rolledBack'
        ? 'Importazione annullata'
        : commitBatchSummary
          ? 'Importazione confermata'
          : 'Conferma importazione movimenti';

  const commitPanelProgressText = commitRunState
    ? commitRunState.failureMessage
      ? `${commitRunState.completedChunks} di ${commitRunState.totalChunks} chunk completati · ${commitRunState.totalCreatedRecordCount} record creati totali`
      : `${commitRunState.completedChunks} di ${commitRunState.totalChunks} chunk completati${commitRunState.currentChunk > commitRunState.completedChunks ? ` · chunk ${commitRunState.currentChunk} in corso` : ''} · ${commitRunState.totalCreatedRecordCount} record creati totali`
    : null;

  const commitBatchSummaryText = commitBatchSummary
    ? commitBatchSummary.status === 'rolledBack'
      ? `Batch ${commitBatchSummary.batchId} annullato${commitBatchSummary.removedRecordCount !== undefined ? ` · ${commitBatchSummary.removedRecordCount} record rimossi` : ''}`
      : `Ultimo batch confermato: batch ${commitBatchSummary.batchId} · ${commitBatchSummary.createdRecordCount} record creati totali${commitBatchSummary.wasIdempotent ? ' · richiesta idempotente' : ''}`
    : null;

  return (
    <PageContainer>
      <PageHeader
        label="Operativita"
        title="Anteprima import CSV"
        description="Nessun movimento viene salvato in questa fase. Controlla mapping e validazione prima dei prossimi milestone."
      />

      <Card>
        <CardHeader>
          <CardTitle>Preset import</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="preset-name">Nome preset</Label>
              <Input
                id="preset-name"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                placeholder="Preset conto principale"
              />
            </div>
            <div className="space-y-2">
              <Label>Preset salvati</Label>
              <Select
                value={selectedPresetId || undefined}
                onValueChange={setSelectedPresetId}
                disabled={isPresetLoading || presets.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={isPresetLoading ? 'Caricamento preset...' : 'Seleziona preset'} />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={savePreset} disabled={isPresetMutating || !user}>
              Salva preset
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={applySelectedPreset}
              disabled={isPresetMutating || !selectedPreset}
            >
              Carica preset
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={updatePreset}
              disabled={isPresetMutating || !selectedPresetId || !user}
            >
              Aggiorna preset
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={deletePreset}
              disabled={isPresetMutating || !selectedPresetId || !user}
            >
              Elimina preset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Carica file CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Il file grezzo viene elaborato nel browser e non viene salvato come CSV grezzo. Il contenuto resta processato nel browser fino alla validazione.
          </p>

          <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="csv-file">File CSV</Label>
              <Input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
              />
              <p className="text-xs text-muted-foreground">
                {selectedFileName ? `File selezionato: ${selectedFileName}` : 'Nessun file selezionato.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="csv-text">Contenuto CSV</Label>
              <Textarea
                id="csv-text"
                value={csvText}
                onChange={(event) => setCsvText(event.target.value)}
                rows={10}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleValidatePreview} disabled={isValidating}>
              {isValidating ? 'Validazione in corso...' : 'Valida anteprima'}
            </Button>
          </div>

          {apiError && (
            <p className="text-sm text-destructive">{apiError}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mappatura campi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-6 desktop:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Campi obbligatori</h3>
                <p className="text-sm text-muted-foreground">
                  Questi campi servono per generare l&apos;anteprima valida prima di ogni scrittura.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date-column">Colonna data</Label>
                  <Input
                    id="date-column"
                    value={dateColumn}
                    onChange={(event) => setDateColumn(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description-column">Colonna descrizione</Label>
                  <Input
                    id="description-column"
                    value={descriptionColumn}
                    onChange={(event) => setDescriptionColumn(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount-column">Colonna importo</Label>
                  <Input
                    id="amount-column"
                    value={amountColumn}
                    onChange={(event) => setAmountColumn(event.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Campi facoltativi</h3>
                <p className="text-sm text-muted-foreground">
                  I campi facoltativi rafforzano classificazione e riconciliazione senza cambiare la natura preview-only del flusso.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 text-sm text-muted-foreground sm:grid-cols-2">
                <div className="rounded-lg border bg-muted/30 p-3">Tipo movimento sorgente</div>
                <div className="rounded-lg border bg-muted/30 p-3">Conto origine</div>
                <div className="rounded-lg border bg-muted/30 p-3">Conto destinazione</div>
                <div className="rounded-lg border bg-muted/30 p-3">Ticker asset</div>
                <div className="rounded-lg border bg-muted/30 p-3">ISIN asset</div>
                <div className="rounded-lg border bg-muted/30 p-3">Nome asset</div>
                <div className="rounded-lg border bg-muted/30 p-3">Quantità</div>
                <div className="rounded-lg border bg-muted/30 p-3">Prezzo unitario</div>
                <div className="rounded-lg border bg-muted/30 p-3">Commissioni</div>
                <div className="rounded-lg border bg-muted/30 p-3">Tasse</div>
                <div className="rounded-lg border bg-muted/30 p-3">Valuta</div>
                <div className="rounded-lg border bg-muted/30 p-3">Categoria / sottocategoria</div>
              </div>
            </div>
          </div>

          {preview && (
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-medium">Validazione mapping</p>
              <div className="mt-3 grid grid-cols-1 gap-4 desktop:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Blocchi</p>
                  {preview.mappingValidation.blocking.length > 0 ? (
                    <ul className="space-y-1 text-sm text-destructive">
                      {preview.mappingValidation.blocking.map((issue) => (
                        <li key={`${issue.code}-${issue.field ?? 'row'}-${issue.message}`}>{issue.message}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nessun blocco di mapping.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avvisi</p>
                  {preview.mappingValidation.warnings.length > 0 ? (
                    <ul className="space-y-1 text-sm text-amber-600">
                      {preview.mappingValidation.warnings.map((issue) => (
                        <li key={`${issue.code}-${issue.field ?? 'row'}-${issue.message}`}>{issue.message}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nessun avviso di mapping.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Classificazione e regole</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            La classificazione resta deterministica e spiegabile: usa descrizione, tipo sorgente, importo, conti e riferimenti asset per spiegare ogni riga.
          </p>

          <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-medium">Ordine delle regole</p>
              <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                <li>1. Suffix e parole chiave sulla descrizione.</li>
                <li>2. Conti sorgente e destinazione per i trasferimenti.</li>
                <li>3. Quantità, prezzo e riferimenti asset per gli investimenti.</li>
                <li>4. Fallback su cashflow o movimento sconosciuto.</li>
              </ul>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-medium">Cosa vede l&apos;utente</p>
              <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                <li>Il motivo della classificazione per ogni riga.</li>
                <li>Il livello di confidenza della regola applicata.</li>
                <li>I riferimenti mancanti da confermare esplicitamente.</li>
                <li>I duplicati conservativi rilevati nella stessa anteprima.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Anteprima e riconciliazione</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {preview ? (
            <>
              <div className="grid grid-cols-1 gap-4 desktop:grid-cols-5">
                <div className="rounded-lg border bg-muted/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pronte</p>
                  <p className="mt-2 text-2xl font-semibold">{previewStats.readyRows}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Blocchi</p>
                  <p className="mt-2 text-2xl font-semibold">{previewStats.blockingRows}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Avvisi</p>
                  <p className="mt-2 text-2xl font-semibold">{previewStats.warningRows}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Duplicati</p>
                  <p className="mt-2 text-2xl font-semibold">{previewStats.duplicateRows}</p>
                </div>
                <div className="rounded-lg border bg-muted/20 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Riferimenti mancanti</p>
                  <p className="mt-2 text-2xl font-semibold">{previewStats.unresolvedReferenceRows}</p>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/10 p-4">
                <p className="text-sm font-medium">Movimenti rilevati</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(previewStats.summaryByKind).map(([kind, count]) => (
                    <span
                      key={kind}
                      className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground"
                    >
                      {getMovementKindLabel(kind as ImportMovementKind)}: {count}
                    </span>
                  ))}
                </div>
              </div>

              <div className={`rounded-lg border p-4 ${commitPanelToneClass}`}>
                <div className="flex flex-col gap-4 desktop:flex-row desktop:items-start desktop:justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">{commitPanelTitle}</p>
                    <p className="text-sm text-muted-foreground">
                      I movimenti cashflow ordinari, i transfer interni, le operazioni di investimento, i dividendi/cedole e le commissioni/imposte pronti vengono confermati in chunk da {CSV_IMPORT_COMMIT_CHUNK_SIZE} righe per mantenere il retry idempotente.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {cashflowCommitPreparation.rows.length > 0
                        ? `${cashflowCommitPreparation.rows.length} righe pronte verranno confermate. ${cashflowCommitPreparation.unresolvedReadyCategoryRows > 0 ? `${cashflowCommitPreparation.unresolvedReadyCategoryRows} righe cashflow, fee o tax richiedono una categoria esistente nel campo "Categoria / sottocategoria". ` : ''}${cashflowCommitPreparation.unresolvedReadyTransferRows > 0 ? `${cashflowCommitPreparation.unresolvedReadyTransferRows} transfer richiedono conto origine e destinazione. ` : ''}${cashflowCommitPreparation.unresolvedReadyInvestmentRows > 0 ? `${cashflowCommitPreparation.unresolvedReadyInvestmentRows} operazioni di investimento richiedono un riferimento asset nel campo "Nome asset", "Ticker asset" o "ISIN asset". ` : ''}${cashflowCommitPreparation.unresolvedReadyDividendRows > 0 ? `${cashflowCommitPreparation.unresolvedReadyDividendRows} dividendi richiedono un riferimento asset nel campo "Nome asset", "Ticker asset" o "ISIN asset". ` : ''}${cashflowCommitPreparation.duplicateReadyRows > 0 ? `${cashflowCommitPreparation.duplicateReadyRows} righe duplicate restano escluse dalla commit.` : ''}`
                        : categoriesLoading
                          ? 'Caricamento categorie in corso...'
                          : 'Compila categorie per cashflow, fee e tax, conti dei transfer o riferimenti asset per operazioni di investimento e dividendi per abilitare la conferma.'}
                    </p>
                    {commitPanelProgressText && (
                      <p className="text-xs text-muted-foreground">
                        {commitPanelProgressText}
                      </p>
                    )}
                    {commitRunState?.failureMessage && (
                      <p className="text-sm text-destructive">
                        {commitRunState.failureMessage}. I chunk successivi sono stati interrotti.
                      </p>
                    )}
                    {commitBatchSummaryText && (
                      <p className="text-sm text-muted-foreground">
                        {commitBatchSummaryText}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={handleCommitCashflowRows}
                      disabled={isCommitting || cashflowCommitPreparation.rows.length === 0}
                    >
                      {isCommitting ? 'Conferma in corso...' : 'Conferma importazione'}
                    </Button>
                    {commitBatchSummary?.status === 'committed' && (
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={handleRollbackCommittedBatch}
                        disabled={isRollingBack}
                      >
                        {isRollingBack ? 'Annullamento in corso...' : 'Annulla importazione batch'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-background p-4">
                <div className="flex flex-col gap-3 desktop:flex-row desktop:items-start desktop:justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Storico import CSV</p>
                    <p className="text-sm text-muted-foreground">
                      I batch confermati e annullati restano disponibili qui con stato, conteggi e record creati.
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void importHistoryQuery.refetch()}
                    disabled={importHistoryQuery.isFetching || !user}
                  >
                    {importHistoryQuery.isFetching ? 'Aggiornamento in corso...' : 'Ricarica storico'}
                  </Button>
                </div>

                {importHistoryError && (
                  <p className="mt-3 text-sm text-destructive">{importHistoryError}</p>
                )}

                {importHistoryQuery.isLoading ? (
                  <p className="mt-4 text-sm text-muted-foreground">Caricamento storico import...</p>
                ) : importHistory.length > 0 ? (
                  <div className="mt-4 space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Importazioni collegate
                    </p>
                    {importHistory.map((run) => {
                      const runRecordSummaries = groupBatchCreatedRecords(
                        run.childBatches.flatMap((childBatch) => childBatch.createdRecords)
                      );

                      return (
                        <div key={run.importRunId} className="rounded-lg border bg-muted/20 p-4">
                          <div className="flex flex-col gap-3 desktop:flex-row desktop:items-start desktop:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-medium">Importazione raggruppata {run.importRunId}</p>
                                <Badge
                                  variant="outline"
                                  className={getImportHistoryRunStatusBadgeClass(run.status)}
                                >
                                  {getImportHistoryRunStatusLabel(run.status)}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {run.status === 'rolledBack'
                                  ? `Annullata il ${formatImportHistoryBatchTimestamp(run.rolledBackAt)}`
                                  : `Confermata il ${formatImportHistoryBatchTimestamp(run.committedAt)}`}
                                {run.status === 'rolledBack' && run.rollbackReason
                                  ? ` · Motivo: ${run.rollbackReason}`
                                  : ''}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {run.childBatchCount} chunk collegati · {run.rowCount} righe · {run.createdRecordCount} record creati · {run.duplicateCount} duplicati · {run.errorCount} errori
                              </p>
                            </div>

                            {run.canRollbackGrouped && (
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="destructive"
                                  onClick={() => setImportHistoryRollbackTarget(run)}
                                  disabled={isRollingBack}
                                >
                                  Annulla importazione raggruppata
                                </Button>
                              </div>
                            )}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <p className="w-full text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Record creati per tipo
                            </p>
                            {runRecordSummaries.length > 0 ? runRecordSummaries.map((summary) => (
                              <Badge key={summary.kind} variant="outline" className="border-border bg-background text-foreground">
                                {summary.label}: {summary.count}
                              </Badge>
                            )) : (
                              <p className="text-sm text-muted-foreground">Nessun record creato.</p>
                            )}
                          </div>

                          <div className="mt-4 space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Chunk collegati
                            </p>
                            <div className="space-y-3">
                              {run.childBatches.map((childBatch) => {
                                const childRecordSummaries = groupBatchCreatedRecords(childBatch.createdRecords);

                                return (
                                  <div key={childBatch.id} className="rounded-lg border bg-background p-3">
                                    <div className="flex flex-col gap-3 desktop:flex-row desktop:items-start desktop:justify-between">
                                      <div className="space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="text-sm font-medium">Batch {childBatch.id}</p>
                                          <Badge
                                            variant="outline"
                                            className={getImportHistoryBatchStatusBadgeClass(childBatch.status)}
                                          >
                                            {getImportHistoryBatchStatusLabel(childBatch.status)}
                                          </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                          {childBatch.status === 'rolledBack'
                                            ? `Annullato il ${formatImportHistoryBatchTimestamp(childBatch.rolledBackAt)}`
                                            : `Confermato il ${formatImportHistoryBatchTimestamp(childBatch.committedAt)}`}
                                          {childBatch.status === 'rolledBack' && childBatch.rollbackReason
                                            ? ` · Motivo: ${childBatch.rollbackReason}`
                                            : ''}
                                        </p>
                                        <p className="text-sm text-muted-foreground">
                                          Chunk {childBatch.importChunkIndex ?? '—'}/{childBatch.importChunkCount ?? '—'} · {childBatch.rowCount} righe · {childBatch.createdRecordCount} record creati · {childBatch.duplicateCount} duplicati · {childBatch.errorCount} errori
                                        </p>
                                      </div>

                                      {childBatch.status === 'committed' && (
                                        <div className="flex flex-wrap gap-2">
                                          <Button
                                            type="button"
                                            variant="destructive"
                                            onClick={async () => {
                                              await rollbackImportBatch(childBatch.id);
                                            }}
                                            disabled={isRollingBack}
                                          >
                                            Annulla batch
                                          </Button>
                                        </div>
                                      )}
                                    </div>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                      <p className="w-full text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Record creati per tipo
                                      </p>
                                      {childRecordSummaries.length > 0 ? childRecordSummaries.map((summary) => (
                                        <Badge key={summary.kind} variant="outline" className="border-border bg-background text-foreground">
                                          {summary.label}: {summary.count}
                                        </Badge>
                                      )) : (
                                        <p className="text-sm text-muted-foreground">Nessun record creato.</p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-muted-foreground">Nessun batch import trovato per questo utente.</p>
                )}
              </div>

              <Dialog
                open={Boolean(importHistoryRollbackTarget)}
                onOpenChange={(open) => {
                  if (!open) {
                    setImportHistoryRollbackTarget(null);
                  }
                }}
              >
                <DialogContent showCloseButton={false} className="sm:max-w-xl">
                  {importHistoryRollbackTarget && (
                    <>
                      <DialogHeader>
                        <DialogTitle>Annulla importazione raggruppata</DialogTitle>
                        <DialogDescription>
                          L&apos;annullamento rimuove solo i record creati da questo import raggruppato, inclusi tutti i chunk collegati. Se alcuni record sono stati modificati manualmente, il server può bloccare l&apos;operazione.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-3 text-sm">
                        <p className="font-medium text-foreground">Importazione raggruppata {importHistoryRollbackTarget.importRunId}</p>
                        <p className="text-muted-foreground">
                          {importHistoryRollbackTarget.childBatchCount} chunk collegati · {importHistoryRollbackTarget.rowCount} righe · {importHistoryRollbackTarget.createdRecordCount} record creati · {importHistoryRollbackTarget.duplicateCount} duplicati · {importHistoryRollbackTarget.errorCount} errori
                        </p>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Chunk collegati
                        </p>
                        <div className="space-y-2">
                          {importHistoryRollbackTarget.childBatches.map((childBatch) => (
                            <div key={childBatch.id} className="rounded-md border bg-muted/20 p-3">
                              <p className="font-medium text-foreground">Batch {childBatch.id}</p>
                              <p className="text-xs text-muted-foreground">
                                Chunk {childBatch.importChunkIndex ?? '—'}/{childBatch.importChunkCount ?? '—'} · {childBatch.status === 'rolledBack'
                                  ? `Annullato il ${formatImportHistoryBatchTimestamp(childBatch.rolledBackAt)}`
                                  : `Confermato il ${formatImportHistoryBatchTimestamp(childBatch.committedAt)}`}
                              </p>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Record creati per tipo
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {groupBatchCreatedRecords(
                            importHistoryRollbackTarget.childBatches.flatMap((childBatch) => childBatch.createdRecords)
                          ).map((summary) => (
                            <Badge key={summary.kind} variant="outline" className="border-border bg-background text-foreground">
                              {summary.label}: {summary.count}
                            </Badge>
                          ))}
                        </div>
                        {importHistoryRollbackTarget.rollbackReason && (
                          <p className="text-muted-foreground">
                            Motivo annullamento: {importHistoryRollbackTarget.rollbackReason}
                          </p>
                        )}
                      </div>

                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setImportHistoryRollbackTarget(null)}
                          disabled={isRollingBack}
                        >
                          Chiudi
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={async () => {
                            if (!importHistoryRollbackTarget) {
                              return;
                            }

                            const success = await rollbackImportRun(importHistoryRollbackTarget.importRunId);
                            if (success) {
                              setImportHistoryRollbackTarget(null);
                            }
                          }}
                          disabled={isRollingBack}
                        >
                          {isRollingBack ? 'Annullamento in corso...' : 'Conferma annullamento'}
                        </Button>
                      </DialogFooter>
                    </>
                  )}
                </DialogContent>
              </Dialog>

              <div className="space-y-4 rounded-lg border bg-background p-4">
                <div className="grid grid-cols-1 gap-4 desktop:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Filtri anteprima</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={showOnlyErrors ? 'default' : 'outline'}
                        onClick={() => setShowOnlyErrors((currentValue) => !currentValue)}
                      >
                        Solo errori
                      </Button>
                      <Button
                        type="button"
                        variant={showOnlyWarnings ? 'default' : 'outline'}
                        onClick={() => setShowOnlyWarnings((currentValue) => !currentValue)}
                      >
                        Solo avvisi
                      </Button>
                      <Button
                        type="button"
                        variant={showOnlyDuplicates ? 'default' : 'outline'}
                        onClick={() => setShowOnlyDuplicates((currentValue) => !currentValue)}
                      >
                        Duplicati
                      </Button>
                      <Button
                        type="button"
                        variant={showOnlyUnknownMovement ? 'default' : 'outline'}
                        onClick={() => setShowOnlyUnknownMovement((currentValue) => !currentValue)}
                      >
                        Tipo movimento sconosciuto
                      </Button>
                      <Button
                        type="button"
                        variant={showOnlyMissingReferences ? 'default' : 'outline'}
                        onClick={() => setShowOnlyMissingReferences((currentValue) => !currentValue)}
                      >
                        Riferimenti mancanti
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="movement-kind-filter">Tipo movimento</Label>
                    <Select
                      value={movementKindFilter}
                      onValueChange={(value: string) => setMovementKindFilter(value as MovementKindFilter)}
                    >
                      <SelectTrigger id="movement-kind-filter">
                        <SelectValue placeholder="Tutti i tipi" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Tutti i tipi</SelectItem>
                        {Object.entries(MOVEMENT_KIND_LABELS).map(([kind, label]) => (
                          <SelectItem key={kind} value={kind}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1100px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-3 pr-3">
                          <span className="sr-only">Seleziona riga</span>
                        </th>
                        <th className="py-3 pr-3">Riga</th>
                        <th className="py-3 pr-3">Data</th>
                        <th className="py-3 pr-3">Importo</th>
                        <th className="py-3 pr-3">Tipo movimento</th>
                        <th className="py-3 pr-3">Classificazione</th>
                        <th className="py-3 pr-3">Dedupe</th>
                        <th className="py-3 pr-3">Stato</th>
                        <th className="py-3 pr-3">Problemi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.length > 0 ? filteredRows.map((row) => (
                        <tr
                          key={row.rowIndex}
                          className={[
                            'border-b align-top',
                            row.hasBlockingIssues ? 'bg-destructive/5' : row.hasWarningIssues ? 'bg-amber-50/50' : '',
                          ].join(' ')}
                        >
                          <td className="py-3 pr-3 align-top">
                            <input
                              type="checkbox"
                              checked={selectedRowIds.includes(row.rowIndex)}
                              onChange={() => toggleBulkSelection(row.rowIndex)}
                              aria-label={`Seleziona riga ${row.rowIndex}`}
                            />
                          </td>
                          <td className="py-3 pr-3 font-medium">
                            {row.rowIndex}
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            {formatPreviewDate(row.canonicalFields.date)}
                          </td>
                          <td className="py-3 pr-3 whitespace-nowrap">
                            {formatPreviewAmount(row.canonicalFields.amount, row.canonicalFields.currency)}
                          </td>
                          <td className="py-3 pr-3">
                            <div className="space-y-1">
                              <p className="font-medium">{getMovementKindLabel(row.movementKind)}</p>
                              <p className="text-xs text-muted-foreground">Confidenza: {getConfidenceLabel(row.confidence)}</p>
                            </div>
                          </td>
                          <td className="py-3 pr-3">
                            <div className="space-y-1">
                              <p>{row.classificationReason}</p>
                              {row.categoryLikeText && (
                                <p className="text-xs text-muted-foreground">Categoria locale: {row.categoryLikeText}</p>
                              )}
                            </div>
                          </td>
                          <td className="py-3 pr-3">
                            <span className="rounded-full border px-2 py-1 text-xs">
                              {row.dedupeStatus === 'unique'
                                ? 'Unico'
                                : row.dedupeStatus === 'possibleDuplicate'
                                  ? 'Possibile duplicato'
                                  : 'Duplicato'}
                            </span>
                          </td>
                          <td className="py-3 pr-3">
                            <span className={[
                              'rounded-full border px-2 py-1 text-xs font-medium',
                              row.hasBlockingIssues
                                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                : row.hasWarningIssues
                                  ? 'border-amber-300 bg-amber-50 text-amber-700'
                                  : 'border-emerald-300 bg-emerald-50 text-emerald-700',
                            ].join(' ')}>
                              {row.statusLabel}
                            </span>
                          </td>
                          <td className="py-3 pr-3">
                            <ul className="space-y-1 text-xs text-muted-foreground">
                              {getIssueSummary(row).map((issueMessage, issueIndex) => (
                                <li
                                  key={`${row.rowIndex}-${issueIndex}-${issueMessage}`}
                                  className={issueMessage.startsWith('Riferimenti mancanti')
                                    ? 'text-amber-700'
                                    : row.hasBlockingIssues
                                      ? 'text-destructive'
                                      : 'text-muted-foreground'}
                                >
                                  {issueMessage}
                                </li>
                              ))}
                            </ul>
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                            Nessuna riga corrisponde ai filtri attivi.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Carica un file e avvia la validazione per vedere l&apos;anteprima e la riconciliazione.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 desktop:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Correzione riga</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedRow ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="selected-row">Riga selezionata</Label>
                  <Select
                    value={selectedRowValue}
                    onValueChange={(value: string) => setSelectedRowId(Number(value))}
                  >
                    <SelectTrigger id="selected-row">
                      <SelectValue placeholder="Seleziona riga" />
                    </SelectTrigger>
                    <SelectContent>
                      {displayRows.map((row) => (
                        <SelectItem key={row.rowIndex} value={String(row.rowIndex)}>
                          Riga {row.rowIndex} - {row.canonicalFields.description ?? 'Senza descrizione'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                  <p className="font-medium">{selectedRowTitle}</p>
                  <p className="mt-1 text-muted-foreground">{selectedRow.classificationReason}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Confidenza: {getConfidenceLabel(selectedRow.confidence)}</p>
                  {selectedRow.hasBlockingIssues && (
                    <p className="mt-2 text-xs font-medium text-destructive">
                      Le righe con errori bloccanti non possono essere marcate come pronte.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="selected-movement-kind">Tipo movimento</Label>
                  <Select
                    value={selectedRow.movementKind}
                    onValueChange={(value: string) => updateRowOverride(selectedRow.rowIndex, { movementKind: value as ImportMovementKind })}
                  >
                    <SelectTrigger id="selected-movement-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(MOVEMENT_KIND_LABELS).map(([kind, label]) => (
                        <SelectItem key={kind} value={kind}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="selected-description">Descrizione</Label>
                    <Input
                      id="selected-description"
                      value={selectedRow.canonicalFields.description ?? ''}
                      onChange={(event) => updateRowOverride(selectedRow.rowIndex, { description: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="selected-source-account">Conto origine</Label>
                    <Input
                      id="selected-source-account"
                      value={selectedRow.canonicalFields.sourceAccount ?? ''}
                      onChange={(event) => updateRowOverride(selectedRow.rowIndex, { sourceAccount: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="selected-destination-account">Conto destinazione</Label>
                    <Input
                      id="selected-destination-account"
                      value={selectedRow.canonicalFields.destinationAccount ?? ''}
                      onChange={(event) => updateRowOverride(selectedRow.rowIndex, { destinationAccount: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="selected-asset-name">Nome asset</Label>
                    <Input
                      id="selected-asset-name"
                      value={selectedRow.canonicalFields.assetName ?? ''}
                      onChange={(event) => updateRowOverride(selectedRow.rowIndex, { assetName: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="selected-asset-ticker">Ticker asset</Label>
                    <Input
                      id="selected-asset-ticker"
                      value={selectedRow.canonicalFields.assetTicker ?? ''}
                      onChange={(event) => updateRowOverride(selectedRow.rowIndex, { assetTicker: event.target.value.toUpperCase() })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="selected-asset-isin">ISIN asset</Label>
                    <Input
                      id="selected-asset-isin"
                      value={selectedRow.canonicalFields.assetIsin ?? ''}
                      onChange={(event) => updateRowOverride(selectedRow.rowIndex, { assetIsin: event.target.value.toUpperCase() })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="selected-category-like-text">Categoria / sottocategoria</Label>
                    <Input
                      id="selected-category-like-text"
                      value={selectedRow.categoryLikeText}
                      onChange={(event) => updateRowOverride(selectedRow.rowIndex, { categoryLikeText: event.target.value })}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={toggleReadyState}
                    disabled={selectedRow.hasBlockingIssues}
                  >
                    {selectedRow.ready ? 'Segna come da rivedere' : 'Segna come pronta'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => resetRowOverride(selectedRow.rowIndex)}
                  >
                    Ripristina riga
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Esegui la validazione per aprire la correzione riga.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Modifica massiva</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Applica la stessa correzione locale alle righe selezionate per velocizzare le rettifiche ripetitive.
            </p>

            <div className="space-y-2">
              <Label htmlFor="bulk-movement-kind">Tipo movimento</Label>
              <Select
                value={bulkMovementKind}
                onValueChange={(value: string) => setBulkMovementKind(value as MovementKindFilter)}
              >
                <SelectTrigger id="bulk-movement-kind">
                  <SelectValue placeholder="Nessuna modifica" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Nessuna modifica</SelectItem>
                  {Object.entries(MOVEMENT_KIND_LABELS).map(([kind, label]) => (
                    <SelectItem key={kind} value={kind}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-description">Descrizione</Label>
              <Input
                id="bulk-description"
                value={bulkDescription}
                onChange={(event) => setBulkDescription(event.target.value)}
                placeholder="Testo descrittivo da riutilizzare"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk-category-like-text">Categoria / sottocategoria</Label>
              <Input
                id="bulk-category-like-text"
                value={bulkCategoryLikeText}
                onChange={(event) => setBulkCategoryLikeText(event.target.value)}
                placeholder="Categoria locale"
              />
            </div>

            <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Righe selezionate</p>
              <p className="mt-1">{selectedRowIds.length > 0 ? `${selectedRowIds.length} righe pronte per la modifica massiva.` : 'Seleziona almeno una riga nella tabella per usare la modifica massiva.'}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={applyBulkEdit} disabled={selectedRowIds.length === 0}>
                Applica modifica massiva
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Collegamento assistito</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-medium">Nessuna creazione automatica</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Asset, account, categorie e sottocategorie richiedono conferma esplicita prima di qualunque collegamento locale.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-lg border bg-background p-3">
                <p className="font-medium">Asset</p>
                <p className="mt-1 text-muted-foreground">Il matching resta assistito e non crea elementi nuovi senza conferma.</p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="font-medium">Account</p>
                <p className="mt-1 text-muted-foreground">I conti vengono collegati solo dopo verifica esplicita.</p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="font-medium">Categorie</p>
                <p className="mt-1 text-muted-foreground">Le categorie suggerite restano in bozza fino alla conferma dell&apos;utente.</p>
              </div>
              <div className="rounded-lg border bg-background p-3">
                <p className="font-medium">Sottocategorie</p>
                <p className="mt-1 text-muted-foreground">Nessuna creazione automatica: serve un consenso esplicito.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}

export default ImportCsvPage;
