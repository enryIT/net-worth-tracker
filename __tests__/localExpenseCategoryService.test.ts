import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    expenseCategory: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

import {
  createLocalExpenseCategory,
  deleteLocalExpenseCategory,
  listLocalExpenseCategories,
  updateLocalExpenseCategory,
} from "@/lib/server/cashflow/localExpenseCategoryService";

describe("local expense category service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists categories scoped to a user ordered by type and name", async () => {
    prismaMock.expenseCategory.findMany.mockResolvedValue([
      {
        id: "category-1",
        userId: "user-1",
        name: "Stipendio",
        type: "income",
        color: "#16a34a",
        icon: "briefcase",
        subCategories: [{ id: "sub-1", name: "Base" }],
        legacyFirebaseId: null,
        createdAt: new Date("2026-05-17T10:00:00.000Z"),
        updatedAt: new Date("2026-05-17T10:00:00.000Z"),
      },
    ]);

    const categories = await listLocalExpenseCategories("user-1");

    expect(prismaMock.expenseCategory.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    });
    expect(categories[0]).toMatchObject({
      id: "category-1",
      userId: "user-1",
      name: "Stipendio",
      type: "income",
      subCategories: [{ id: "sub-1", name: "Base" }],
    });
  });

  it("creates a user-scoped category", async () => {
    prismaMock.expenseCategory.create.mockResolvedValue({
      id: "category-1",
      userId: "user-1",
      name: "Casa",
      type: "fixed",
      color: null,
      icon: null,
      subCategories: [],
      legacyFirebaseId: null,
      createdAt: new Date("2026-05-17T10:00:00.000Z"),
      updatedAt: new Date("2026-05-17T10:00:00.000Z"),
    });

    await createLocalExpenseCategory("user-1", {
      name: "Casa",
      type: "fixed",
    });

    expect(prismaMock.expenseCategory.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        name: "Casa",
        type: "fixed",
        color: undefined,
        icon: undefined,
        subCategories: [],
      },
    });
  });

  it("updates a category only when it belongs to the user", async () => {
    prismaMock.expenseCategory.update.mockResolvedValue({
      id: "category-1",
      userId: "user-1",
      name: "Casa aggiornata",
      type: "fixed",
      color: "#64748b",
      icon: "home",
      subCategories: [],
      legacyFirebaseId: null,
      createdAt: new Date("2026-05-17T10:00:00.000Z"),
      updatedAt: new Date("2026-05-17T11:00:00.000Z"),
    });

    const category = await updateLocalExpenseCategory("user-1", "category-1", {
      name: "Casa aggiornata",
      type: "fixed",
      color: "#64748b",
      icon: "home",
    });

    expect(prismaMock.expenseCategory.update).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: "category-1",
          userId: "user-1",
        },
      },
      data: {
        name: "Casa aggiornata",
        type: "fixed",
        color: "#64748b",
        icon: "home",
        subCategories: [],
      },
    });
    expect(category?.name).toBe("Casa aggiornata");
  });

  it("deletes only categories owned by the user", async () => {
    prismaMock.expenseCategory.deleteMany.mockResolvedValue({ count: 1 });

    const deleted = await deleteLocalExpenseCategory("user-1", "category-1");

    expect(prismaMock.expenseCategory.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "category-1",
        userId: "user-1",
      },
    });
    expect(deleted).toBe(true);
  });
});
