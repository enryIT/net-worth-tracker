import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  addLocalHallOfFameNoteMock,
  assertWritableUserMock,
  deleteLocalHallOfFameNoteMock,
  getLocalHallOfFameDataMock,
  requireUserSessionMock,
  updateLocalHallOfFameNoteMock,
} = vi.hoisted(() => ({
  addLocalHallOfFameNoteMock: vi.fn(),
  assertWritableUserMock: vi.fn(),
  deleteLocalHallOfFameNoteMock: vi.fn(),
  getLocalHallOfFameDataMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  updateLocalHallOfFameNoteMock: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
  AuthSessionError: class AuthSessionError extends Error {
    constructor(
      message: string,
      public readonly code: string
    ) {
      super(message);
      this.name = "AuthSessionError";
    }
  },
  assertWritableUser: assertWritableUserMock,
  requireUserSession: requireUserSessionMock,
}));

vi.mock("@/lib/server/hall-of-fame/localHallOfFameService", () => ({
  addLocalHallOfFameNote: addLocalHallOfFameNoteMock,
  deleteLocalHallOfFameNote: deleteLocalHallOfFameNoteMock,
  getLocalHallOfFameData: getLocalHallOfFameDataMock,
  updateLocalHallOfFameNote: updateLocalHallOfFameNoteMock,
}));

import { GET } from "@/app/api/hall-of-fame/route";
import { POST } from "@/app/api/hall-of-fame/notes/route";
import { DELETE, PUT } from "@/app/api/hall-of-fame/notes/[noteId]/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

const hallOfFamePayload = {
  userId: "user-1",
  notes: [],
  bestMonthsByNetWorthGrowth: [],
  bestMonthsByIncome: [],
  worstMonthsByNetWorthDecline: [],
  worstMonthsByExpenses: [],
  bestYearsByNetWorthGrowth: [],
  bestYearsByIncome: [],
  worstYearsByNetWorthDecline: [],
  worstYearsByExpenses: [],
  updatedAt: new Date("2026-05-31T10:00:00.000Z"),
};

const notePayload = {
  text: "Nota Hall of Fame",
  sections: ["bestMonthsByIncome"],
  year: 2026,
  month: 5,
};

function createJsonRequest(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local hall of fame routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
  });

  it("returns Hall of Fame data for the authenticated user", async () => {
    getLocalHallOfFameDataMock.mockResolvedValue(hallOfFamePayload);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(getLocalHallOfFameDataMock).toHaveBeenCalledWith("user-1");

    await expect(response.json()).resolves.toEqual({
      ...hallOfFamePayload,
      updatedAt: "2026-05-31T10:00:00.000Z",
    });
  });

  it("returns null when Hall of Fame has not been calculated yet", async () => {
    getLocalHallOfFameDataMock.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toBeNull();
  });

  it("returns 401 when reading without a session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("adds notes for writable users", async () => {
    addLocalHallOfFameNoteMock.mockResolvedValue({
      id: "note-1",
      ...notePayload,
      createdAt: new Date("2026-05-31T10:00:00.000Z"),
      updatedAt: new Date("2026-05-31T10:00:00.000Z"),
    });

    const response = await POST(
      createJsonRequest("http://localhost/api/hall-of-fame/notes", "POST", notePayload)
    );

    expect(response.status).toBe(201);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(addLocalHallOfFameNoteMock).toHaveBeenCalledWith("user-1", notePayload);
  });

  it("rejects invalid note payloads before reaching the service", async () => {
    const response = await POST(
      createJsonRequest("http://localhost/api/hall-of-fame/notes", "POST", {
        text: " ",
        sections: [],
        year: 2026,
      })
    );

    expect(response.status).toBe(400);
    expect(addLocalHallOfFameNoteMock).not.toHaveBeenCalled();
  });

  it("updates notes for writable users", async () => {
    updateLocalHallOfFameNoteMock.mockResolvedValue(undefined);

    const response = await PUT(
      createJsonRequest(
        "http://localhost/api/hall-of-fame/notes/note-1",
        "PUT",
        {
          text: "Nota aggiornata",
          sections: ["bestYearsByIncome"],
        }
      ),
      { params: Promise.resolve({ noteId: "note-1" }) }
    );

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(updateLocalHallOfFameNoteMock).toHaveBeenCalledWith("user-1", "note-1", {
      text: "Nota aggiornata",
      sections: ["bestYearsByIncome"],
    });
  });

  it("deletes notes for writable users", async () => {
    deleteLocalHallOfFameNoteMock.mockResolvedValue(undefined);

    const response = await DELETE(
      new NextRequest("http://localhost/api/hall-of-fame/notes/note-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ noteId: "note-1" }) }
    );

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(deleteLocalHallOfFameNoteMock).toHaveBeenCalledWith("user-1", "note-1");
  });

  it("blocks note writes for demo users", async () => {
    assertWritableUserMock.mockImplementation(() => {
      throw new AuthSessionError(
        "Non disponibile in modalita demo.",
        "DEMO_READONLY"
      );
    });

    const response = await POST(
      createJsonRequest("http://localhost/api/hall-of-fame/notes", "POST", notePayload)
    );

    expect(response.status).toBe(403);
    expect(addLocalHallOfFameNoteMock).not.toHaveBeenCalled();
  });
});
