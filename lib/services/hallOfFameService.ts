/**
 * Hall of Fame client service wrapper.
 *
 * Runtime reads and writes are delegated to local authenticated API routes.
 */

import { authenticatedFetch } from "@/lib/utils/authFetch";
import { toDate } from "@/lib/utils/dateHelpers";
import {
  HallOfFameData,
  HallOfFameNote,
  HallOfFameSectionKey,
} from "@/types/hall-of-fame";

type DateInput = Date | string | { toDate: () => Date } | null | undefined;

type HallOfFameNoteInput = {
  text: string;
  sections: HallOfFameSectionKey[];
  year: number;
  month?: number;
};

type HallOfFameNoteUpdates = {
  text?: string;
  sections?: HallOfFameSectionKey[];
};

async function parseJsonResponse<T>(
  response: Response,
  fallbackError: string
): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;

  if (!response.ok) {
    throw new Error(
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : fallbackError
    );
  }

  return payload as T;
}

function normalizeNote(note: HallOfFameNote): HallOfFameNote {
  return {
    ...note,
    createdAt: toDate(note.createdAt as DateInput),
    updatedAt: toDate(note.updatedAt as DateInput),
  };
}

function normalizeHallOfFameData(data: HallOfFameData): HallOfFameData {
  return {
    ...data,
    notes: Array.isArray(data.notes) ? data.notes.map(normalizeNote) : [],
    updatedAt: toDate(data.updatedAt as DateInput),
  };
}

/**
 * Fetch Hall of Fame data for the authenticated user.
 */
export async function getHallOfFameData(userId: string): Promise<HallOfFameData | null> {
  try {
    const response = await authenticatedFetch("/api/hall-of-fame", {
      method: "GET",
    });

    if (response.status === 404) {
      return null;
    }

    const payload = await parseJsonResponse<HallOfFameData | null>(
      response,
      "Errore nel caricamento Hall of Fame."
    );

    return payload ? normalizeHallOfFameData(payload) : null;
  } catch (error) {
    console.error("Error fetching Hall of Fame data:", error);
    throw new Error(`Failed to fetch Hall of Fame data for user ${userId}`, {
      cause: error,
    });
  }
}

/**
 * Trigger Hall of Fame rankings recalculation for the authenticated user.
 */
export async function updateHallOfFame(userId: string): Promise<void> {
  try {
    const response = await authenticatedFetch("/api/hall-of-fame/recalculate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId }),
    });

    await parseJsonResponse<{ success?: boolean }>(
      response,
      "Errore nel ricalcolo Hall of Fame."
    );
  } catch (error) {
    console.error("Error updating Hall of Fame:", error);
    throw new Error(`Failed to update Hall of Fame for user ${userId}`, {
      cause: error,
    });
  }
}

/**
 * Get notes for a specific period and section.
 */
export function getNotesForPeriod(
  notes: HallOfFameNote[],
  section: HallOfFameSectionKey,
  year: number,
  month?: number
): HallOfFameNote[] {
  return notes.filter(
    (note) => note.year === year && note.month === month && note.sections.includes(section)
  );
}

/**
 * Add a new Hall of Fame note.
 */
export async function addHallOfFameNote(
  userId: string,
  noteData: HallOfFameNoteInput
): Promise<HallOfFameNote> {
  try {
    const response = await authenticatedFetch("/api/hall-of-fame/notes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(noteData),
    });

    const payload = await parseJsonResponse<HallOfFameNote>(
      response,
      "Errore nel salvataggio della nota Hall of Fame."
    );

    return normalizeNote(payload);
  } catch (error) {
    console.error("Error adding Hall of Fame note:", error);
    throw new Error(`Failed to add Hall of Fame note for user ${userId}`, {
      cause: error,
    });
  }
}

/**
 * Update an existing Hall of Fame note.
 */
export async function updateHallOfFameNote(
  userId: string,
  noteId: string,
  updates: HallOfFameNoteUpdates
): Promise<void> {
  try {
    const response = await authenticatedFetch(`/api/hall-of-fame/notes/${noteId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    });

    await parseJsonResponse<{ success?: boolean }>(
      response,
      "Errore nell'aggiornamento della nota Hall of Fame."
    );
  } catch (error) {
    console.error("Error updating Hall of Fame note:", error);
    throw new Error(`Failed to update Hall of Fame note ${noteId} for user ${userId}`, {
      cause: error,
    });
  }
}

/**
 * Delete a Hall of Fame note.
 */
export async function deleteHallOfFameNote(userId: string, noteId: string): Promise<void> {
  try {
    const response = await authenticatedFetch(`/api/hall-of-fame/notes/${noteId}`, {
      method: "DELETE",
    });

    await parseJsonResponse<{ success?: boolean }>(
      response,
      "Errore durante l'eliminazione della nota Hall of Fame."
    );
  } catch (error) {
    console.error("Error deleting Hall of Fame note:", error);
    throw new Error(`Failed to delete Hall of Fame note ${noteId} for user ${userId}`, {
      cause: error,
    });
  }
}
