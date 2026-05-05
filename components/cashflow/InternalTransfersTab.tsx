'use client';

import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useAssets } from '@/lib/hooks/useAssets';
import { useInternalTransfers } from '@/lib/hooks/useInvestmentOperations';
import { createInternalTransfer } from '@/lib/services/investmentOperationService';
import { queryKeys } from '@/lib/query/queryKeys';
import { formatCurrency } from '@/lib/utils/formatters';

export function InternalTransfersTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: assets = [] } = useAssets(user?.uid);
  const { data: transfers = [], isLoading } = useInternalTransfers(user?.uid);
  const cashAssets = useMemo(() => assets.filter(asset => asset.assetClass === 'cash'), [assets]);

  const [fromCashAssetId, setFromCashAssetId] = useState('__none__');
  const [toCashAssetId, setToCashAssetId] = useState('__none__');
  const [amount, setAmount] = useState('');
  const [fees, setFees] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleCreate = async () => {
    if (!user) return;
    const parsedAmount = Number(amount);
    const parsedFees = fees ? Number(fees) : 0;

    if (fromCashAssetId === '__none__' || toCashAssetId === '__none__') {
      toast.error('Seleziona conto di partenza e conto di arrivo');
      return;
    }
    if (fromCashAssetId === toCashAssetId) {
      toast.error('I due conti devono essere diversi');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('Inserisci un importo valido');
      return;
    }
    if (!Number.isFinite(parsedFees) || parsedFees < 0) {
      toast.error('Inserisci commissioni valide');
      return;
    }

    try {
      setIsSaving(true);
      await createInternalTransfer(user.uid, {
        fromCashAssetId,
        toCashAssetId,
        amount: parsedAmount,
        fees: parsedFees,
        date: new Date(`${date}T00:00:00`),
        notes: notes.trim() || undefined,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all(user.uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.transfers(user.uid) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.overview(user.uid) }),
      ]);
      setAmount('');
      setFees('');
      setNotes('');
      toast.success('Trasferimento registrato');
    } catch (error) {
      console.error('Error creating internal transfer:', error);
      toast.error('Errore nel salvataggio del trasferimento');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Trasferimenti Interni</h2>
        <p className="text-muted-foreground mt-1">
          Sposta liquidità tra conti senza alterare entrate, spese o risparmio netto
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5" />
            Nuovo trasferimento
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 desktop:grid-cols-6 desktop:items-end">
          <div className="space-y-2 desktop:col-span-2">
            <Label>Da conto</Label>
            <Select value={fromCashAssetId} onValueChange={setFromCashAssetId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona conto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Seleziona conto</SelectItem>
                {cashAssets.map(asset => (
                  <SelectItem key={asset.id} value={asset.id}>{asset.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 desktop:col-span-2">
            <Label>A conto</Label>
            <Select value={toCashAssetId} onValueChange={setToCashAssetId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona conto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Seleziona conto</SelectItem>
                {cashAssets.map(asset => (
                  <SelectItem key={asset.id} value={asset.id}>{asset.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Importo</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Data</Label>
            <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Commissioni</Label>
            <Input type="number" min="0" step="0.01" value={fees} onChange={(event) => setFees(event.target.value)} />
          </div>
          <div className="space-y-2 desktop:col-span-4">
            <Label>Note</Label>
            <Input value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          <Button onClick={handleCreate} disabled={isSaving || cashAssets.length < 2} className="desktop:col-span-1">
            <Plus className="mr-2 h-4 w-4" />
            Registra
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storico trasferimenti</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento trasferimenti...</p>
          ) : transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun trasferimento interno registrato.</p>
          ) : (
            <div className="space-y-3">
              {transfers.map(transfer => (
                <div key={transfer.id} className="flex flex-col gap-2 rounded-md border p-3 desktop:flex-row desktop:items-center desktop:justify-between">
                  <div>
                    <p className="font-medium">
                      {transfer.fromCashAssetName} → {transfer.toCashAssetName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(transfer.date as Date).toLocaleDateString('it-IT')}
                      {transfer.notes ? ` · ${transfer.notes}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatCurrency(transfer.amount)}</p>
                    {!!transfer.fees && transfer.fees > 0 && (
                      <p className="text-xs text-red-600">Commissioni {formatCurrency(transfer.fees)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
