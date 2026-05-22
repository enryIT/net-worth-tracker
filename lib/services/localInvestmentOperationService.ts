import type {
  InvestmentOperation,
  InvestmentOperationFormData,
  RealizedInvestmentSummary,
} from "@/types/investments";

const INVESTMENT_OPERATIONS_API_PATH = "/api/investment-operations";

export async function getInvestmentOperations(
  _userId: string
): Promise<InvestmentOperation[]> {
  const response = await fetch(INVESTMENT_OPERATIONS_API_PATH, {
    method: "GET",
    headers: { "content-type": "application/json" },
  });

  return readInvestmentOperationResponse<InvestmentOperation[]>(
    response,
    "Errore nel caricamento delle operazioni."
  );
}

export async function getRealizedInvestmentSummary(
  _userId: string
): Promise<RealizedInvestmentSummary> {
  const response = await fetch(`${INVESTMENT_OPERATIONS_API_PATH}/realized-summary`, {
    method: "GET",
    headers: { "content-type": "application/json" },
  });

  return readInvestmentOperationResponse<RealizedInvestmentSummary>(
    response,
    "Errore nel caricamento del riepilogo realizzato."
  );
}

export async function createInvestmentOperation(
  _userId: string,
  input: InvestmentOperationFormData
): Promise<string> {
  const response = await fetch(INVESTMENT_OPERATIONS_API_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(serializeInvestmentOperationInput(input)),
  });

  const operation = await readInvestmentOperationResponse<InvestmentOperation>(
    response,
    "Errore nel salvataggio dell operazione."
  );

  return operation.id;
}

export async function updateInvestmentOperation(
  operationId: string,
  input: InvestmentOperationFormData
): Promise<void> {
  const response = await fetch(`${INVESTMENT_OPERATIONS_API_PATH}/${operationId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(serializeInvestmentOperationInput(input)),
  });

  await readInvestmentOperationResponse<InvestmentOperation>(
    response,
    "Errore nel salvataggio dell operazione."
  );
}

export async function deleteInvestmentOperation(operationId: string): Promise<void> {
  const response = await fetch(`${INVESTMENT_OPERATIONS_API_PATH}/${operationId}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
  });

  await readInvestmentOperationResponse<{ success: true }>(
    response,
    "Errore nell eliminazione dell operazione."
  );
}

function serializeInvestmentOperationInput(input: InvestmentOperationFormData) {
  return {
    ...input,
    date: input.date.toISOString(),
  };
}

async function readInvestmentOperationResponse<T>(
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
