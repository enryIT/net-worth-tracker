import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { UserRole } from "@prisma/client";

vi.mock("server-only", () => ({}));

const {
  assertWritableUserMock,
  collectionMock,
  prismaMock,
  requireUserSessionMock,
} = vi.hoisted(() => ({
  assertWritableUserMock: vi.fn(),
  collectionMock: vi.fn(),
  prismaMock: {
    expense: {
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  requireUserSessionMock: vi.fn(),
}));

vi.mock("@/lib/firebase/config", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: collectionMock,
  deleteField: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  setDoc: vi.fn(),
  Timestamp: { now: vi.fn(), fromDate: vi.fn() },
  updateDoc: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({ prisma: prismaMock }));

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

import {
  clearExpensesCategoryAssignment,
  getExpenseCountByCategoryId,
  getExpenseCountBySubCategoryId,
  moveExpensesFromSubCategory,
  moveExpensesToCategory,
  reassignExpensesCategory,
  reassignExpensesSubCategory,
} from "@/lib/services/expenseService";
import {
  clearLocalExpensesCategoryAssignment,
  countLocalExpensesByCategory,
  countLocalExpensesBySubCategory,
  moveLocalExpensesToCategory,
  reassignLocalExpensesCategory,
} from "@/lib/server/cashflow/localExpenseService";
import { POST } from "@/app/api/expenses/category-assignment/route";
import { AuthSessionError } from "@/lib/server/auth/session";

const authenticatedUser = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  role: UserRole.USER,
  isDemo: false,
};

function createJsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/expenses/category-assignment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("expense category assignment local migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUserSessionMock.mockResolvedValue(authenticatedUser);
    global.fetch = vi.fn();
  });

  it("client category helpers call the local API instead of Firestore", async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 7 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 5 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 4 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 3 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 2 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 9 }), { status: 200 }));

    await expect(getExpenseCountByCategoryId("old-category", "legacy-firebase-user")).resolves.toBe(7);
    await expect(getExpenseCountBySubCategoryId("old-category", "old-sub", "legacy-firebase-user")).resolves.toBe(5);
    await expect(reassignExpensesCategory("old-category", "new-category", "Casa", "legacy-firebase-user", "new-sub", "Affitto")).resolves.toBe(4);
    await expect(clearExpensesCategoryAssignment("old-category", "legacy-firebase-user")).resolves.toBe(3);
    await expect(reassignExpensesSubCategory("old-category", "old-sub", "legacy-firebase-user", "new-sub", "Affitto")).resolves.toBe(2);
    await expect(moveExpensesToCategory("old-category", "variable", "new-category", "Stipendio", "income", "legacy-firebase-user")).resolves.toBe(1);
    await expect(moveExpensesFromSubCategory("old-category", "old-sub", "variable", "new-category", "Casa", "fixed", "legacy-firebase-user")).resolves.toBe(9);

    expect(collectionMock).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/expenses/category-assignment",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "countByCategory", categoryId: "old-category" }),
      })
    );
  });

  it("server service counts expenses by category with user scoping", async () => {
    prismaMock.expense.count.mockResolvedValue(7);

    await expect(countLocalExpensesByCategory("user-1", "category-1")).resolves.toBe(7);

    expect(prismaMock.expense.count).toHaveBeenCalledWith({
      where: { userId: "user-1", categoryId: "category-1" },
    });
  });

  it("server service clears deleted category assignments to uncategorized", async () => {
    prismaMock.expense.updateMany.mockResolvedValue({ count: 3 });

    await expect(clearLocalExpensesCategoryAssignment("user-1", "category-1")).resolves.toBe(3);

    expect(prismaMock.expense.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", categoryId: "category-1" },
      data: {
        categoryId: "uncategorized",
        categoryName: "Uncategorized",
        subCategoryId: null,
        subCategoryName: null,
      },
    });
  });

  it("server service reassigns categories and clears subcategory when no destination is provided", async () => {
    prismaMock.expense.updateMany.mockResolvedValue({ count: 4 });

    await expect(reassignLocalExpensesCategory("user-1", {
      oldCategoryId: "old-category",
      newCategoryId: "new-category",
      newCategoryName: "Casa",
    })).resolves.toBe(4);

    expect(prismaMock.expense.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", categoryId: "old-category" },
      data: {
        categoryId: "new-category",
        categoryName: "Casa",
        subCategoryId: null,
        subCategoryName: null,
      },
    });
  });

  it("server service moves categories and flips signs across income boundary", async () => {
    prismaMock.expense.updateMany.mockResolvedValue({ count: 2 });

    await expect(moveLocalExpensesToCategory("user-1", {
      oldCategoryId: "old-category",
      oldType: "variable",
      newCategoryId: "new-category",
      newCategoryName: "Stipendio",
      newType: "income",
    })).resolves.toBe(2);

    expect(prismaMock.expense.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", categoryId: "old-category" },
      data: {
        amount: { multiply: -1 },
        categoryId: "new-category",
        categoryName: "Stipendio",
        subCategoryId: null,
        subCategoryName: null,
        type: "income",
      },
    });
  });

  it("route delegates category assignment actions to the local service for writable sessions", async () => {
    prismaMock.expense.updateMany.mockResolvedValue({ count: 4 });

    const response = await POST(createJsonRequest({
      action: "reassignCategory",
      oldCategoryId: "old-category",
      newCategoryId: "new-category",
      newCategoryName: "Casa",
    }));

    expect(response.status).toBe(200);
    expect(assertWritableUserMock).toHaveBeenCalledWith(authenticatedUser);
    expect(prismaMock.expense.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", categoryId: "old-category" },
      data: {
        categoryId: "new-category",
        categoryName: "Casa",
        subCategoryId: null,
        subCategoryName: null,
      },
    });
    await expect(response.json()).resolves.toEqual({ count: 4 });
  });

  it("route rejects writes for demo users", async () => {
    assertWritableUserMock.mockImplementation(() => {
      throw new AuthSessionError("Demo non modificabile.", "DEMO_READONLY");
    });

    const response = await POST(createJsonRequest({
      action: "reassignCategory",
      oldCategoryId: "old-category",
      newCategoryId: "new-category",
      newCategoryName: "Casa",
    }));

    expect(response.status).toBe(403);
    expect(prismaMock.expense.updateMany).not.toHaveBeenCalled();
  });

  it("server service counts expenses by subcategory with user scoping", async () => {
    prismaMock.expense.count.mockResolvedValue(5);

    await expect(countLocalExpensesBySubCategory("user-1", "category-1", "sub-1")).resolves.toBe(5);

    expect(prismaMock.expense.count).toHaveBeenCalledWith({
      where: { userId: "user-1", categoryId: "category-1", subCategoryId: "sub-1" },
    });
  });
});
