import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  createLocalExpenseCategoryMock,
  deleteLocalExpenseCategoryMock,
  listLocalExpenseCategoriesMock,
  requireUserSessionMock,
  updateLocalExpenseCategoryMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  createLocalExpenseCategoryMock: vi.fn(),
  deleteLocalExpenseCategoryMock: vi.fn(),
  listLocalExpenseCategoriesMock: vi.fn(),
  requireUserSessionMock: vi.fn(),
  updateLocalExpenseCategoryMock: vi.fn(),
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

vi.mock("@/lib/server/cashflow/localExpenseCategoryService", () => ({
  createLocalExpenseCategory: createLocalExpenseCategoryMock,
  deleteLocalExpenseCategory: deleteLocalExpenseCategoryMock,
  listLocalExpenseCategories: listLocalExpenseCategoriesMock,
  updateLocalExpenseCategory: updateLocalExpenseCategoryMock,
}));

import {
  GET,
  POST,
} from "@/app/api/expense-categories/route";
import {
  DELETE,
  PUT,
} from "@/app/api/expense-categories/[categoryId]/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

const params = Promise.resolve({ categoryId: "category-1" });

function createJsonRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("local expense categories routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
  });

  it("lists categories for the authenticated user", async () => {
    listLocalExpenseCategoriesMock.mockResolvedValue([{ id: "category-1" }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(listLocalExpenseCategoriesMock).toHaveBeenCalledWith("user-1");
    await expect(response.json()).resolves.toEqual([{ id: "category-1" }]);
  });

  it("returns 401 when listing without a session", async () => {
    requireUserSessionMock.mockRejectedValue(
      new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED")
    );

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("creates categories for writable users", async () => {
    createLocalExpenseCategoryMock.mockResolvedValue({ id: "category-1" });

    const response = await POST(
      createJsonRequest("http://localhost/api/expense-categories", {
        name: "Casa",
        type: "fixed",
        subCategories: [{ id: "sub-1", name: "Affitto" }],
      })
    );

    expect(response.status).toBe(201);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(createLocalExpenseCategoryMock).toHaveBeenCalledWith("user-1", {
      name: "Casa",
      type: "fixed",
      subCategories: [{ id: "sub-1", name: "Affitto" }],
    });
  });

  it("rejects invalid category payloads", async () => {
    const response = await POST(
      createJsonRequest("http://localhost/api/expense-categories", {
        name: "",
        type: "fixed",
      })
    );

    expect(response.status).toBe(400);
    expect(createLocalExpenseCategoryMock).not.toHaveBeenCalled();
  });

  it("updates categories for writable users", async () => {
    updateLocalExpenseCategoryMock.mockResolvedValue({ id: "category-1" });

    const response = await PUT(
      createJsonRequest("http://localhost/api/expense-categories/category-1", {
        name: "Casa aggiornata",
        type: "fixed",
      }),
      { params }
    );

    expect(response.status).toBe(200);
    expect(updateLocalExpenseCategoryMock).toHaveBeenCalledWith(
      "user-1",
      "category-1",
      {
        name: "Casa aggiornata",
        type: "fixed",
      }
    );
  });

  it("returns 404 when updating a non-owned category", async () => {
    updateLocalExpenseCategoryMock.mockResolvedValue(null);

    const response = await PUT(
      createJsonRequest("http://localhost/api/expense-categories/category-1", {
        name: "Casa aggiornata",
        type: "fixed",
      }),
      { params }
    );

    expect(response.status).toBe(404);
  });

  it("deletes categories for writable users", async () => {
    deleteLocalExpenseCategoryMock.mockResolvedValue(true);

    const response = await DELETE(
      new NextRequest("http://localhost/api/expense-categories/category-1", {
        method: "DELETE",
      }),
      { params }
    );

    expect(response.status).toBe(200);
    expect(deleteLocalExpenseCategoryMock).toHaveBeenCalledWith(
      "user-1",
      "category-1"
    );
  });
});
