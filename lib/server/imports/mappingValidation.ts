import type {
  CanonicalImportColumn,
  ImportColumnMapping,
  ImportIssue,
  MappingValidationResult,
} from '@/lib/server/imports/types';

const REQUIRED_FIELDS: CanonicalImportColumn[] = ['date', 'description'];

function makeIssue(issue: Omit<ImportIssue, 'severity'> & { severity: 'blocking' | 'warning' }): ImportIssue {
  return issue;
}

export function validateColumnMapping(
  headers: string[],
  mapping: ImportColumnMapping
): MappingValidationResult {
  const blocking: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const headerSet = new Set(headers.map((header) => header.trim()));

  for (const requiredField of REQUIRED_FIELDS) {
    if (!mapping[requiredField]) {
      blocking.push(
        makeIssue({
          code: 'missing_required_mapping',
          severity: 'blocking',
          field: requiredField,
          message: `Mappatura obbligatoria mancante: ${requiredField}.`,
        })
      );
    }
  }

  const hasAmount = Boolean(mapping.amount);
  const hasDebit = Boolean(mapping.debit);
  const hasCredit = Boolean(mapping.credit);

  if (!hasAmount && !hasDebit && !hasCredit) {
    blocking.push(
      makeIssue({
        code: 'missing_required_mapping',
        severity: 'blocking',
        field: 'amount',
        message: 'Devi mappare almeno Importo oppure una colonna Addebito/Accredito.',
      })
    );
  }

  if (hasAmount && (hasDebit || hasCredit)) {
    warnings.push(
      makeIssue({
        code: 'conflicting_amount_mapping',
        severity: 'warning',
        field: 'amount',
        message: 'Sono mappati sia Importo sia Addebito/Accredito: verrà usato Importo come priorità.',
      })
    );
  }

  if ((hasDebit && !hasCredit) || (!hasDebit && hasCredit)) {
    warnings.push(
      makeIssue({
        code: 'incomplete_debit_credit_mapping',
        severity: 'warning',
        field: hasDebit ? 'debit' : 'credit',
        message: 'È mappata solo una colonna tra Addebito e Accredito.',
      })
    );
  }

  if (!mapping.sourceType) {
    warnings.push(
      makeIssue({
        code: 'classification_low_confidence',
        severity: 'warning',
        field: 'sourceType',
        message: 'Tipo sorgente non mappato: la classificazione potrebbe avere confidenza più bassa.',
      })
    );
  }

  const reverseMap = new Map<string, CanonicalImportColumn[]>();
  for (const [field, sourceColumn] of Object.entries(mapping) as Array<[CanonicalImportColumn, string | undefined]>) {
    if (!sourceColumn) continue;
    const normalized = sourceColumn.trim();
    if (!normalized) continue;

    if (!headerSet.has(normalized)) {
      blocking.push(
        makeIssue({
          code: 'unknown_mapped_column',
          severity: 'blocking',
          field,
          message: `La colonna mappata "${normalized}" non esiste nel CSV.`,
        })
      );
      continue;
    }

    const fields = reverseMap.get(normalized) ?? [];
    fields.push(field);
    reverseMap.set(normalized, fields);
  }

  for (const [sourceColumn, fields] of reverseMap.entries()) {
    if (fields.length <= 1) continue;

    warnings.push(
      makeIssue({
        code: 'duplicated_source_column_mapping',
        severity: 'warning',
        field: sourceColumn,
        message: `La colonna "${sourceColumn}" è mappata su più campi (${fields.join(', ')}).`,
      })
    );
  }

  return {
    blocking,
    warnings,
  };
}
