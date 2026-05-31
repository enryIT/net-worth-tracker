import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  deleteLocalDummyCategoriesMock,
  deleteLocalDummyDataMock,
  deleteLocalDummyExpensesMock,
  deleteLocalDummySnapshotsMock,
  getLocalDummyDataCountMock,
  requireUserSessionMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  deleteLocalDummyCategoriesMock: vi.fn(),
  deleteLocalDummyDataMock: vi.fn(),
  deleteLocalDummyExpensesMock: vi.fn(),
  deleteLocalDummySnapshotsMock: vi.fn(),
  getLocalDummyDataCountMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
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

vi.mock("@/lib/server/dummy/localDummyDataService", () => ({
  deleteLocalDummyCategories: deleteLocalDummyCategoriesMock,
  deleteLocalDummyData: deleteLocalDummyDataMock,
  deleteLocalDummyExpenses: deleteLocalDummyExpensesMock,
  deleteLocalDummySnapshots: deleteLocalDummySnapshotsMock,
  getLocalDummyDataCount: getLocalDummyDataCountMock,
}));

import { DELETE, GET } from "@/app/api/dummy-data/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

describe("local dummy data route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
  });

  it("returns dummy counts for the authenticated user", async () => {
    getLocalDummyDataCountMock.mockResolvedValue({
      snapshots: 3,
      expenses: 5,
      categories: 2,
      total: 10,
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(getLocalDummyDataCountMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({
      snapshots: 3,
      expenses: 5,
      categories: 2,
      total: 10,
    });
  });

  it("returns 401 when reading counts without a session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Autenticazione richiesta.",
    });
  });

  it("deletes all dummy data for writable users by default", async () => {
    deleteLocalDummyDataMock.mockResolvedValue({
      snapshots: 4,
      expenses: 6,
      categories: 1,
      total: 11,
    });

    const response = await DELETE(
      new NextRequest("http://localhost/api/dummy-data", { method: "DELETE" })
    );

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(deleteLocalDummyDataMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({
      snapshots: 4,
      expenses: 6,
      categories: 1,
      total: 11,
    });
  });

  it("deletes only dummy snapshots when target=snapshots", async () => {
    deleteLocalDummySnapshotsMock.mockResolvedValue(2);

    const response = await DELETE(
      new NextRequest("http://localhost/api/dummy-data?target=snapshots", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(200);
    expect(deleteLocalDummySnapshotsMock).toHaveBeenCalledWith("user-1");
    expect(deleteLocalDummyDataMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      snapshots: 2,
      expenses: 0,
      categories: 0,
      total: 2,
    });
  });

  it("deletes only dummy expenses when target=expenses", async () => {
    deleteLocalDummyExpensesMock.mockResolvedValue(7);

    const response = await DELETE(
      new NextRequest("http://localhost/api/dummy-data?target=expenses", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(200);
    expect(deleteLocalDummyExpensesMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({
      snapshots: 0,
      expenses: 7,
      categories: 0,
      total: 7,
    });
  });

  it("deletes only dummy categories when target=categories", async () => {
    deleteLocalDummyCategoriesMock.mockResolvedValue(3);

    const response = await DELETE(
      new NextRequest("http://localhost/api/dummy-data?target=categories", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(200);
    expect(deleteLocalDummyCategoriesMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual({
      snapshots: 0,
      expenses: 0,
      categories: 3,
      total: 3,
    });
  });

  it("rejects invalid delete target values", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost/api/dummy-data?target=invalid", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(400);
    expect(deleteLocalDummyDataMock).not.toHaveBeenCalled();
    expect(deleteLocalDummySnapshotsMock).not.toHaveBeenCalled();
    expect(deleteLocalDummyExpensesMock).not.toHaveBeenCalled();
    expect(deleteLocalDummyCategoriesMock).not.toHaveBeenCalled();
  });

  it("blocks delete for demo users", async () => {
    assertWritableUserMock.mockImplementation(() => {
      throw new AuthSessionError(
        "Non disponibile in modalita demo.",
        "DEMO_READONLY"
      );
    });

    const response = await DELETE(
      new NextRequest("http://localhost/api/dummy-data", { method: "DELETE" })
    );

    expect(response.status).toBe(403);
    expect(deleteLocalDummyDataMock).not.toHaveBeenCalled();
  });
});
