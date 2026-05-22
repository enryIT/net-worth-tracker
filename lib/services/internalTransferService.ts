import type {
  InternalTransfer,
  InternalTransferFormData,
} from "@/types/investments";

const INTERNAL_TRANSFERS_API_PATH = "/api/internal-transfers";

export async function getInternalTransfers(
  _userId: string
): Promise<InternalTransfer[]> {
  const response = await fetch(INTERNAL_TRANSFERS_API_PATH, {
    method: "GET",
    headers: { "content-type": "application/json" },
  });

  return readInternalTransferResponse<InternalTransfer[]>(
    response,
    "Errore nel caricamento dei trasferimenti."
  );
}

export async function createInternalTransfer(
  _userId: string,
  input: InternalTransferFormData
): Promise<string> {
  const response = await fetch(INTERNAL_TRANSFERS_API_PATH, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(serializeInternalTransferInput(input)),
  });

  const transfer = await readInternalTransferResponse<InternalTransfer>(
    response,
    "Errore nel salvataggio del trasferimento."
  );

  return transfer.id;
}

export async function updateInternalTransfer(
  transferId: string,
  input: InternalTransferFormData
): Promise<void> {
  const response = await fetch(`${INTERNAL_TRANSFERS_API_PATH}/${transferId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(serializeInternalTransferInput(input)),
  });

  await readInternalTransferResponse<InternalTransfer>(
    response,
    "Errore nel salvataggio del trasferimento."
  );
}

export async function deleteInternalTransfer(transferId: string): Promise<void> {
  const response = await fetch(`${INTERNAL_TRANSFERS_API_PATH}/${transferId}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
  });

  await readInternalTransferResponse<{ success: true }>(
    response,
    "Errore nell eliminazione del trasferimento."
  );
}

function serializeInternalTransferInput(input: InternalTransferFormData) {
  return {
    ...input,
    date: input.date.toISOString(),
  };
}

async function readInternalTransferResponse<T>(
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
