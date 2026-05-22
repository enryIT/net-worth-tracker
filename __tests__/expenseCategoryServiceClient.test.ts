import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("@/lib/firebase/config", () => ({
  db: {},
}));

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  Timestamp: { now: vi.fn() },
  updateDoc: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@/lib/services/expenseService", () => ({
  clearExpensesCategoryAssignment: vi.fn(),
  getExpenseCountByCategoryId: vi.fn(),
  getExpenseCountBySubCategoryId: vi.fn(),
  moveExpensesFromSubCategory: vi.fn(),
  moveExpensesToCategory: vi.fn(),
  reassignExpensesCategory: vi.fn(),
  reassignExpensesSubCategory: vi.fn(),
  updateExpensesCategoryName: vi.fn(),
  updateExpensesSubCategoryName: vi.fn(),
  updateExpensesType: vi.fn(),
}));

import {
  addSubCategory,
  createCategory,
  deleteCategory,
  getAllCategories,
  getCategoriesByType,
  getCategoryById,
  removeSubCategory,
  updateCategory,
  updateSubCategory,
} from "@/lib/services/expenseCategoryService";
import { collection } from "firebase/firestore";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

const categoryPayload = {
  id: "category-1",
  userId: "session-user",
  name: "Alimentari",
  type: "variable",
  color: "#3b82f6",
  subCategories: [{ id: "sub-1", name: "Supermercato" }],
  createdAt: "2026-05-22T08:00:00.000Z",
  updatedAt: "2026-05-22T09:00:00.000Z",
};

describe("expenseCategoryService client wrapper", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.mocked(collection).mockClear();
  });

  it("lists categories through the local API without reading Firestore", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([categoryPayload]));

    const categories = await getAllCategories("legacy-firebase-user");

    expect(fetchMock).toHaveBeenCalledWith("/api/expense-categories", {
      method: "GET",
      credentials: "same-origin",
    });
    expect(collection).not.toHaveBeenCalled();
    expect(categories[0]).toMatchObject({
      id: "category-1",
      userId: "session-user",
      name: "Alimentari",
    });
    expect(categories[0].createdAt).toBeInstanceOf(Date);
    expect(categories[0].updatedAt).toBeInstanceOf(Date);
  });

  it("filters categories by type after reading from the local API", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        categoryPayload,
        { ...categoryPayload, id: "category-2", name: "Stipendio", type: "income" },
      ])
    );

    const categories = await getCategoriesByType("legacy-firebase-user", "income");

    expect(fetchMock).toHaveBeenCalledWith("/api/expense-categories", {
      method: "GET",
      credentials: "same-origin",
    });
    expect(categories).toHaveLength(1);
    expect(categories[0].name).toBe("Stipendio");
    expect(collection).not.toHaveBeenCalled();
  });

  it("gets one category by id through the local API list", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([categoryPayload]));

    const category = await getCategoryById("category-1");

    expect(category?.id).toBe("category-1");
    expect(fetchMock).toHaveBeenCalledWith("/api/expense-categories", {
      method: "GET",
      credentials: "same-origin",
    });
    expect(collection).not.toHaveBeenCalled();
  });

  it("creates categories through the local API and returns the created id", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(categoryPayload, { status: 201 }));

    const id = await createCategory("legacy-firebase-user", {
      name: "Alimentari",
      type: "variable",
      color: "#3b82f6",
    });

    expect(id).toBe("category-1");
    expect(fetchMock).toHaveBeenCalledWith("/api/expense-categories", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alimentari",
        type: "variable",
        color: "#3b82f6",
      }),
    });
    expect(collection).not.toHaveBeenCalled();
  });

  it("updates categories through the local API", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([categoryPayload]))
      .mockResolvedValueOnce(jsonResponse({ ...categoryPayload, name: "Spesa" }));

    await updateCategory("category-1", { name: "Spesa", type: "variable" }, "legacy-firebase-user");

    expect(fetchMock).toHaveBeenLastCalledWith("/api/expense-categories/category-1", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Spesa", type: "variable" }),
    });
    expect(collection).not.toHaveBeenCalled();
  });

  it("deletes categories through the local API", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    await deleteCategory("category-1");

    expect(fetchMock).toHaveBeenCalledWith("/api/expense-categories/category-1", {
      method: "DELETE",
      credentials: "same-origin",
    });
    expect(collection).not.toHaveBeenCalled();
  });

  it("adds subcategories through the category update API", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1770000000000);
    vi.spyOn(Math, "random").mockReturnValue(0.123456789);
    fetchMock
      .mockResolvedValueOnce(jsonResponse([categoryPayload]))
      .mockResolvedValueOnce(
        jsonResponse({
          ...categoryPayload,
          subCategories: [
            ...categoryPayload.subCategories,
            { id: "1770000000000-4fzzzxjyl", name: "Bar" },
          ],
        })
      );

    await addSubCategory("category-1", "Bar");

    expect(fetchMock).toHaveBeenLastCalledWith("/api/expense-categories/category-1", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alimentari",
        type: "variable",
        color: "#3b82f6",
        subCategories: [
          { id: "sub-1", name: "Supermercato" },
          { id: "1770000000000-4fzzzxjyl", name: "Bar" },
        ],
      }),
    });
  });

  it("removes subcategories through the category update API", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([categoryPayload]))
      .mockResolvedValueOnce(jsonResponse({ ...categoryPayload, subCategories: [] }));

    await removeSubCategory("category-1", "sub-1");

    expect(fetchMock).toHaveBeenLastCalledWith("/api/expense-categories/category-1", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alimentari",
        type: "variable",
        color: "#3b82f6",
        subCategories: [],
      }),
    });
  });

  it("updates subcategory names through the category update API", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse([categoryPayload]))
      .mockResolvedValueOnce(
        jsonResponse({
          ...categoryPayload,
          subCategories: [{ id: "sub-1", name: "Market" }],
        })
      );

    await updateSubCategory("category-1", "sub-1", "Market", "legacy-firebase-user");

    expect(fetchMock).toHaveBeenLastCalledWith("/api/expense-categories/category-1", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Alimentari",
        type: "variable",
        color: "#3b82f6",
        subCategories: [{ id: "sub-1", name: "Market" }],
      }),
    });
  });

  it("surfaces local API errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "Autenticazione richiesta." }, { status: 401 }));

    await expect(getAllCategories("legacy-firebase-user")).rejects.toThrow(
      "Autenticazione richiesta."
    );
  });
});
