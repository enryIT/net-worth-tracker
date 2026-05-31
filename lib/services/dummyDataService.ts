export interface DummyDataCount {
  snapshots: number;
  expenses: number;
  categories: number;
  total: number;
}

const DUMMY_DATA_API_PATH = "/api/dummy-data";
const DUMMY_DATA_ERROR = "Errore durante la gestione dei dati dummy.";

type DummyDeleteTarget = "snapshots" | "expenses" | "categories";

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;

  if (!response.ok) {
    throw new Error(
      payload && typeof payload === "object" && "error" in payload && payload.error
        ? payload.error
        : DUMMY_DATA_ERROR
    );
  }

  return payload as T;
}

async function deleteDummyData(target?: DummyDeleteTarget): Promise<DummyDataCount> {
  const url = target
    ? `${DUMMY_DATA_API_PATH}?target=${encodeURIComponent(target)}`
    : DUMMY_DATA_API_PATH;

  const response = await fetch(url, {
    method: "DELETE",
    credentials: "same-origin",
  });

  return parseJsonResponse<DummyDataCount>(response);
}

/**
 * Gets count of all dummy data for a user
 */
export async function getDummyDataCount(_userId: string): Promise<DummyDataCount> {
  const response = await fetch(DUMMY_DATA_API_PATH, {
    method: "GET",
    credentials: "same-origin",
  });

  return parseJsonResponse<DummyDataCount>(response);
}

/**
 * Deletes all dummy snapshots for a user
 */
export async function deleteDummySnapshots(_userId: string): Promise<number> {
  return (await deleteDummyData("snapshots")).snapshots;
}

/**
 * Deletes all dummy expenses for a user
 */
export async function deleteDummyExpenses(_userId: string): Promise<number> {
  return (await deleteDummyData("expenses")).expenses;
}

/**
 * Deletes all dummy expense categories for a user
 */
export async function deleteDummyCategories(_userId: string): Promise<number> {
  return (await deleteDummyData("categories")).categories;
}

/**
 * Deletes all dummy data (snapshots, expenses, and categories) for a user
 * Returns the total number of items deleted
 */
export async function deleteAllDummyData(_userId: string): Promise<{
  snapshots: number;
  expenses: number;
  categories: number;
  total: number;
}> {
  return deleteDummyData();
}
