import type { BudgetConfig, BudgetItem } from "@/types/budget";

const BUDGET_API_PATH = "/api/budget";

export async function getBudgetConfig(
  _userId: string
): Promise<BudgetConfig | null> {
  const response = await fetch(BUDGET_API_PATH, {
    method: "GET",
    headers: { "content-type": "application/json" },
  });

  return readBudgetResponse<BudgetConfig | null>(
    response,
    "Errore nel caricamento del budget."
  );
}

export async function saveBudgetConfig(
  _userId: string,
  items: BudgetItem[]
): Promise<void> {
  const response = await fetch(BUDGET_API_PATH, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items }),
  });

  await readBudgetResponse<BudgetConfig>(
    response,
    "Errore nel salvataggio del budget."
  );
}

async function readBudgetResponse<T>(
  response: Response,
  fallbackMessage: string
): Promise<T> {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(body?.error ?? fallbackMessage);
  }

  return body as T;
}
