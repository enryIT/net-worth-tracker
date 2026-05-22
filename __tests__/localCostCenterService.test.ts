import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    costCenter: {
      create: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    expense: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(async (operations: unknown[]) => Promise.all(operations)),
  },
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

import {
  createLocalCostCenter,
  deleteLocalCostCenter,
  listLocalCostCenters,
  updateLocalCostCenter,
} from "@/lib/server/cashflow/localCostCenterService";

describe("local cost center service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists cost centers scoped to a user ordered by creation date", async () => {
    prismaMock.costCenter.findMany.mockResolvedValue([
      {
        id: "cost-center-1",
        userId: "user-1",
        name: "Automobile",
        description: "Dacia",
        color: "#3b82f6",
        legacyFirebaseId: null,
        createdAt: new Date("2026-05-17T10:00:00.000Z"),
        updatedAt: new Date("2026-05-17T10:00:00.000Z"),
      },
    ]);

    const costCenters = await listLocalCostCenters("user-1");

    expect(prismaMock.costCenter.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: [{ createdAt: "asc" }],
    });
    expect(costCenters[0]).toMatchObject({
      id: "cost-center-1",
      userId: "user-1",
      name: "Automobile",
      description: "Dacia",
    });
  });

  it("creates a user-scoped cost center", async () => {
    prismaMock.costCenter.create.mockResolvedValue({
      id: "cost-center-1",
      userId: "user-1",
      name: "Automobile",
      description: null,
      color: "#3b82f6",
      legacyFirebaseId: null,
      createdAt: new Date("2026-05-17T10:00:00.000Z"),
      updatedAt: new Date("2026-05-17T10:00:00.000Z"),
    });

    await createLocalCostCenter("user-1", {
      name: " Automobile ",
      color: "#3b82f6",
    });

    expect(prismaMock.costCenter.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        name: "Automobile",
        description: undefined,
        color: "#3b82f6",
      },
    });
  });

  it("renames linked expenses when updating a cost center name", async () => {
    prismaMock.costCenter.update.mockResolvedValue({
      id: "cost-center-1",
      userId: "user-1",
      name: "Auto nuova",
      description: null,
      color: "#3b82f6",
      legacyFirebaseId: null,
      createdAt: new Date("2026-05-17T10:00:00.000Z"),
      updatedAt: new Date("2026-05-17T11:00:00.000Z"),
    });
    prismaMock.expense.updateMany.mockResolvedValue({ count: 3 });

    const costCenter = await updateLocalCostCenter(
      "user-1",
      "cost-center-1",
      { name: "Auto nuova", color: "#3b82f6" },
      "Automobile"
    );

    expect(prismaMock.costCenter.update).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: "cost-center-1",
          userId: "user-1",
        },
      },
      data: {
        name: "Auto nuova",
        description: undefined,
        color: "#3b82f6",
      },
    });
    expect(prismaMock.expense.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        costCenterId: "cost-center-1",
      },
      data: {
        costCenterName: "Auto nuova",
      },
    });
    expect(costCenter?.name).toBe("Auto nuova");
  });

  it("deletes a cost center and unlinks associated expenses", async () => {
    prismaMock.expense.updateMany.mockResolvedValue({ count: 2 });
    prismaMock.costCenter.deleteMany.mockResolvedValue({ count: 1 });

    const deleted = await deleteLocalCostCenter("user-1", "cost-center-1");

    expect(prismaMock.expense.updateMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        costCenterId: "cost-center-1",
      },
      data: {
        costCenterId: null,
        costCenterName: null,
      },
    });
    expect(prismaMock.costCenter.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "cost-center-1",
        userId: "user-1",
      },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledOnce();
    expect(deleted).toBe(true);
  });
});
