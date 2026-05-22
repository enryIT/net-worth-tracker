import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  getLocalSettingsMock,
  prismaMock,
  resendSendMock,
} = vi.hoisted(() => ({
  getLocalSettingsMock: vi.fn(),
  prismaMock: {
    dividend: {
      findMany: vi.fn(),
    },
    expense: {
      findMany: vi.fn(),
    },
    monthlySnapshot: {
      findFirst: vi.fn(),
    },
  },
  resendSendMock: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/server/settings/localSettingsService", () => ({
  getLocalSettings: getLocalSettingsMock,
}));

vi.mock("resend", () => {
  class ResendMock {
    emails = { send: resendSendMock };
    constructor(_apiKey?: string) {}
  }

  return { Resend: ResendMock };
});

vi.mock("@/lib/utils/dateHelpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils/dateHelpers")>(
    "@/lib/utils/dateHelpers"
  );

  return {
    ...actual,
    getItalyMonthYear: vi.fn(() => ({ month: 5, year: 2026 })),
  };
});

import { sendLocalPeriodicEmail } from "@/lib/server/email/localPeriodicEmailService";

describe("local periodic email service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLocalSettingsMock.mockResolvedValue({
      monthlyEmailEnabled: true,
      quarterlyEmailEnabled: true,
      yearlyEmailEnabled: true,
      monthlyEmailRecipients: ["user@example.com"],
    });
    prismaMock.monthlySnapshot.findFirst
      .mockResolvedValueOnce({
        year: 2026,
        month: 5,
        totalNetWorth: 110000,
        liquidNetWorth: 90000,
        byAssetClass: { equity: 90000, cash: 20000 },
        byParticipant: {
          self: { participantName: "Enrico", totalValue: 110000 },
        },
      })
      .mockResolvedValueOnce({
        year: 2026,
        month: 4,
        totalNetWorth: 100000,
        byAssetClass: { equity: 80000, cash: 20000 },
      });
    prismaMock.expense.findMany.mockResolvedValue([
      {
        type: "expense",
        amount: -120,
        categoryName: "Casa",
        notes: "Affitto",
      },
      {
        type: "income",
        amount: 3000,
        categoryName: "Stipendio",
        notes: "Stipendio",
      },
    ]);
    prismaMock.dividend.findMany.mockResolvedValue([
      { grossAmountEur: 42, grossAmount: 45 },
    ]);
    resendSendMock.mockResolvedValue({ data: {}, error: null });
  });

  it("returns disabled when the selected period is not enabled", async () => {
    getLocalSettingsMock.mockResolvedValue({
      monthlyEmailEnabled: false,
      monthlyEmailRecipients: ["user@example.com"],
    });

    await expect(sendLocalPeriodicEmail("user-1", "monthly")).resolves.toEqual({
      status: "disabled",
      error: "L'email mensile non e abilitata per questo account",
    });
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("returns no recipients when settings have no recipient list", async () => {
    getLocalSettingsMock.mockResolvedValue({
      monthlyEmailEnabled: true,
      monthlyEmailRecipients: [],
    });

    await expect(sendLocalPeriodicEmail("user-1", "monthly")).resolves.toEqual({
      status: "no_recipients",
      error: "Nessun destinatario configurato",
    });
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("returns no snapshot when the current period snapshot is missing", async () => {
    prismaMock.monthlySnapshot.findFirst.mockReset();
    prismaMock.monthlySnapshot.findFirst.mockResolvedValue(null);

    await expect(sendLocalPeriodicEmail("user-1", "monthly")).resolves.toEqual({
      status: "no_snapshot",
      error: "Nessuno snapshot trovato per il periodo richiesto: salva prima uno snapshot",
    });
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("builds local period data and sends the email with Resend", async () => {
    await expect(sendLocalPeriodicEmail("user-1", "monthly")).resolves.toEqual({
      status: "sent",
    });

    expect(prismaMock.monthlySnapshot.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        userId: "user-1",
        year: 2026,
        month: 5,
        isDummy: false,
      },
    });
    expect(prismaMock.expense.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        date: {
          gte: new Date(2026, 4, 1),
          lte: new Date(2026, 5, 0, 23, 59, 59),
        },
      },
    });
    expect(resendSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["user@example.com"],
        subject: "Riepilogo Maggio 2026 - Net Worth Tracker",
        html: expect.stringContaining("Patrimonio netto"),
      })
    );
  });
});
