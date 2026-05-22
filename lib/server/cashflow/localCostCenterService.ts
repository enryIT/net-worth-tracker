import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import type { CostCenter, CostCenterFormData } from "@/types/costCenters";

type CostCenterRow = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function listLocalCostCenters(userId: string): Promise<CostCenter[]> {
  const rows = await prisma.costCenter.findMany({
    where: { userId },
    orderBy: [{ createdAt: "asc" }],
  });

  return rows.map(mapCostCenterRow);
}

export async function createLocalCostCenter(
  userId: string,
  formData: CostCenterFormData
): Promise<CostCenter> {
  const row = await prisma.costCenter.create({
    data: {
      userId,
      ...buildCostCenterData(formData),
    },
  });

  return mapCostCenterRow(row);
}

export async function updateLocalCostCenter(
  userId: string,
  costCenterId: string,
  formData: CostCenterFormData,
  previousName?: string
): Promise<CostCenter | null> {
  try {
    const nextData = buildCostCenterData(formData);
    const row = await prisma.costCenter.update({
      where: {
        id_userId: {
          id: costCenterId,
          userId,
        },
      },
      data: nextData,
    });

    if (previousName !== undefined && previousName !== nextData.name) {
      await prisma.expense.updateMany({
        where: {
          userId,
          costCenterId,
        },
        data: {
          costCenterName: nextData.name,
        },
      });
    }

    return mapCostCenterRow(row);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return null;
    }

    throw error;
  }
}

export async function deleteLocalCostCenter(
  userId: string,
  costCenterId: string
): Promise<boolean> {
  const unlinkExpenses = prisma.expense.updateMany({
    where: {
      userId,
      costCenterId,
    },
    data: {
      costCenterId: null,
      costCenterName: null,
    },
  });
  const deleteCostCenter = prisma.costCenter.deleteMany({
    where: {
      id: costCenterId,
      userId,
    },
  });

  const [, deleteResult] = await prisma.$transaction([
    unlinkExpenses,
    deleteCostCenter,
  ]);

  return deleteResult.count > 0;
}

type LocalCostCenterWriteData = {
  name: string;
  description?: string;
  color?: string;
};

function buildCostCenterData(formData: CostCenterFormData): LocalCostCenterWriteData {
  return {
    name: formData.name.trim(),
    description: formData.description?.trim() || undefined,
    color: formData.color,
  };
}

function mapCostCenterRow(row: CostCenterRow): CostCenter {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description ?? undefined,
    color: row.color ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
