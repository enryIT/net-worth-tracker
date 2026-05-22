import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    budgetConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

import {
  getLocalBudgetConfig,
  saveLocalBudgetConfig,
} from "@/lib/server/cashflow/localBudgetService";

describe("local budget service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the user has no budget config", async () => {
    prismaMock.budgetConfig.findUnique.mockResolvedValue(null);

    await expect(getLocalBudgetConfig("user-1")).resolves.toBeNull();
    expect(prismaMock.budgetConfig.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("maps stored budget items for a user", async () => {
    const updatedAt = new Date("2026-05-17T10:00:00.000Z");
    prismaMock.budgetConfig.findUnique.mockResolvedValue({
      id: "budget-config-1",
      userId: "user-1",
      items: [
        {
          id: "budget-1",
          scope: "category",
          categoryId: "category-1",
          categoryName: "Casa",
          monthlyAmount: 900,
          order: 1,
        },
      ],
      updatedAt,
    });

    await expect(getLocalBudgetConfig("user-1")).resolves.toEqual({
      userId: "user-1",
      items: [
        {
          id: "budget-1",
          scope: "category",
          categoryId: "category-1",
          categoryName: "Casa",
          monthlyAmount: 900,
          order: 1,
        },
      ],
      updatedAt,
    });
  });

  it("upserts a complete budget config with sanitized items", async () => {
    const updatedAt = new Date("2026-05-17T10:00:00.000Z");
    prismaMock.budgetConfig.upsert.mockResolvedValue({
      id: "budget-config-1",
      userId: "user-1",
      items: [
        {
          id: "budget-1",
          scope: "subcategory",
          categoryId: "category-1",
          categoryName: "Casa",
          subCategoryId: "sub-1",
          subCategoryName: "Affitto",
          monthlyAmount: 900,
          attributionProfileId: "profile-1",
          attributionProfileName: "Persona",
          attributionSplits: [
            {
              participantId: "self",
              participantName: "Persona",
              percentage: 100,
            },
          ],
          order: 1,
        },
      ],
      updatedAt,
    });

    const result = await saveLocalBudgetConfig("user-1", [
      {
        id: "budget-1",
        scope: "subcategory",
        categoryId: "category-1",
        categoryName: "Casa",
        subCategoryId: "sub-1",
        subCategoryName: "Affitto",
        monthlyAmount: 900,
        attributionProfileId: "profile-1",
        attributionProfileName: "Persona",
        attributionSplits: [
          {
            participantId: "self",
            participantName: "Persona",
            percentage: 100,
          },
        ],
        order: 1,
      },
    ]);

    expect(prismaMock.budgetConfig.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: {
        userId: "user-1",
        items: [
          {
            id: "budget-1",
            scope: "subcategory",
            categoryId: "category-1",
            categoryName: "Casa",
            subCategoryId: "sub-1",
            subCategoryName: "Affitto",
            monthlyAmount: 900,
            attributionProfileId: "profile-1",
            attributionProfileName: "Persona",
            attributionSplits: [
              {
                participantId: "self",
                participantName: "Persona",
                percentage: 100,
              },
            ],
            order: 1,
          },
        ],
      },
      update: {
        items: [
          {
            id: "budget-1",
            scope: "subcategory",
            categoryId: "category-1",
            categoryName: "Casa",
            subCategoryId: "sub-1",
            subCategoryName: "Affitto",
            monthlyAmount: 900,
            attributionProfileId: "profile-1",
            attributionProfileName: "Persona",
            attributionSplits: [
              {
                participantId: "self",
                participantName: "Persona",
                percentage: 100,
              },
            ],
            order: 1,
          },
        ],
      },
    });
    expect(result.items).toHaveLength(1);
  });
});
