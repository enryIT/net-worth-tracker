'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { CsvImportPreviewResult } from '@/lib/server/imports/types';
import type { CsvImportPreset } from '@/lib/server/imports/presetTypes';

const VALIDATE_ENDPOINT = '/api/imports/validate';
const PRESET_ENDPOINT = '/api/imports/presets';

const DEFAULT_CSV = [
  'Data;Descrizione;Importo',
  '01/05/2026;Stipendio;2500,00',
  '02/05/2026;Spesa supermercato;-95,30',
].join('\n');

export default function ImportCsvPage() {
  const { user } = useAuth();
  const [csvText, setCsvText] = useState(DEFAULT_CSV);
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

  const validatePreview = async () => {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setApiError(message);
      setPreview(null);
    } finally {
      setIsValidating(false);
    }
  };

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
          <CardTitle>Dati CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 desktop:grid-cols-3">
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

          <div className="grid grid-cols-1 gap-4 desktop:grid-cols-3">
            <div className="space-y-2">
              <Label>Separatore decimale</Label>
              <Select
                value={decimalSeparator}
                onValueChange={(value: string) => setDecimalSeparator(value as ',' | '.')}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=",">Virgola (,)</SelectItem>
                  <SelectItem value=".">Punto (.)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Separatore migliaia</Label>
              <Select
                value={thousandsSeparator}
                onValueChange={(value: string) => setThousandsSeparator(value as ',' | '.' | ' ' | "'")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=".">Punto (.)</SelectItem>
                  <SelectItem value=",">Virgola (,)</SelectItem>
                  <SelectItem value=" ">Spazio</SelectItem>
                  <SelectItem value="'">Apostrofo (&apos;)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="default-currency">Valuta default</Label>
              <Input
                id="default-currency"
                value={defaultCurrency}
                onChange={(event) => setDefaultCurrency(event.target.value.toUpperCase())}
                maxLength={3}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="csv-text">Contenuto CSV</Label>
            <Textarea
              id="csv-text"
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              rows={12}
            />
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={validatePreview} disabled={isValidating}>
              {isValidating ? 'Validazione in corso...' : 'Valida anteprima'}
            </Button>
          </div>

          {apiError && (
            <p className="text-sm text-destructive">{apiError}</p>
          )}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>Risultato anteprima</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 text-sm desktop:grid-cols-4">
            <p>Righe totali: <strong>{preview.summary.totalRows}</strong></p>
            <p>Pronte: <strong>{preview.summary.readyRows}</strong></p>
            <p>Con blocchi: <strong>{preview.summary.blockingRows}</strong></p>
            <p>Con avvisi: <strong>{preview.summary.warningRows}</strong></p>
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
