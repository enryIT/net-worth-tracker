'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { toast } from 'sonner';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedFetch } from '@/lib/utils/authFetch';
import { formatCurrency, formatDate } from '@/lib/utils/formatters';
import { toDate } from '@/lib/utils/dateHelpers';
import type { CsvImportPreviewResult, ImportDedupeStatus, ImportIssue, ImportMovementKind, NormalizedImportRow } from '@/lib/server/imports/types';
import type { CsvImportPreset } from '@/lib/server/imports/presetTypes';

const VALIDATE_ENDPOINT = '/api/imports/validate';
const PRESET_ENDPOINT = '/api/imports/presets';

const DEFAULT_CSV = [
  'Data;Descrizione;Importo',
  '01/05/2026;Stipendio;2500,00',
  '02/05/2026;Spesa supermercato;-95,30',
].join('\n');

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
  canonicalFields: NormalizedImportRow['canonicalFields']
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

  if (
    movementKind === 'investmentOperation'
    || movementKind === 'dividend'
    || movementKind === 'fee'
    || movementKind === 'tax'
  ) {
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
    const missingReferences = buildMissingReferences(row.movementKind, row.canonicalFields);
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

function ImportCsvPage() {
  const { user } = useAuth();
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
  const selectedPreset = useMemo(
    () => presets.find((preset) => preset.id === selectedPresetId) ?? null,
    [presets, selectedPresetId]
  );

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
    void loadPresets();
  }, [loadPresets]);

  const buildPresetPayload = useCallback(() => ({
    mapping: {
      date: dateColumn,
      description: descriptionColumn,
      amount: amountColumn,
    },
    locale: {
      dateFormats: ['dd/MM/yyyy', 'yyyy-MM-dd'],
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
            dateFormats: ['dd/MM/yyyy', 'yyyy-MM-dd'],
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

  const toggleReadyState = useCallback(() => {
    if (!selectedRow) {
      return;
    }

    if (selectedRow.hasBlockingIssues) {
      return;
    }

    updateRowOverride(selectedRow.rowIndex, { ready: !selectedRow.ready });
  }, [selectedRow, updateRowOverride]);

  const selectedRowTitle = selectedRow
    ? `Riga ${selectedRow.rowIndex}`
    : 'Nessuna riga selezionata';

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
