import { CostCenter, CostCenterFormData } from '@/types/costCenters';
import { Expense } from '@/types/expenses';

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as { error?: string } | T | null;

  if (!response.ok) {
    throw new Error(
      payload && typeof payload === 'object' && 'error' in payload && payload.error
        ? payload.error
        : 'Errore durante la gestione dei centri di costo.'
    );
  }

  return payload as T;
}

function mapCostCenter(input: CostCenter): CostCenter {
  return {
    ...input,
    createdAt: new Date(input.createdAt as Date),
    updatedAt: new Date(input.updatedAt as Date),
  };
}

function mapExpense(input: Expense): Expense {
  return {
    ...input,
    date: new Date(input.date as Date),
    createdAt: new Date(input.createdAt as Date),
    updatedAt: new Date(input.updatedAt as Date),
  };
}

export async function getCostCenters(_userId: string): Promise<CostCenter[]> {
  const response = await fetch('/api/cost-centers', {
    method: 'GET',
    credentials: 'same-origin',
  });

  const costCenters = await parseJsonResponse<CostCenter[]>(response);
  return costCenters.map(mapCostCenter);
}

export async function getExpensesForCostCenter(
  _userId: string,
  costCenterId: string
): Promise<Expense[]> {
  const params = new URLSearchParams({ costCenterId, sort: 'asc' });
  const response = await fetch(`/api/expenses?${params.toString()}`, {
    method: 'GET',
    credentials: 'same-origin',
  });

  const expenses = await parseJsonResponse<Expense[]>(response);
  return expenses.map(mapExpense);
}

export async function createCostCenter(
  _userId: string,
  formData: CostCenterFormData
): Promise<CostCenter> {
  const response = await fetch('/api/cost-centers', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
  });

  return mapCostCenter(await parseJsonResponse<CostCenter>(response));
}

export async function updateCostCenter(
  costCenter: CostCenter,
  formData: CostCenterFormData
): Promise<void> {
  await parseJsonResponse<CostCenter>(await fetch(`/api/cost-centers/${costCenter.id}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...formData,
      previousName: costCenter.name,
    }),
  }));
}

export async function deleteCostCenter(
  _userId: string,
  costCenterId: string
): Promise<void> {
  await parseJsonResponse<{ success: boolean }>(await fetch(`/api/cost-centers/${costCenterId}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  }));
}
