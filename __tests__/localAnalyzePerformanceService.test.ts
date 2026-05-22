import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { anthropicCreateMock } = vi.hoisted(() => ({
  anthropicCreateMock: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class AnthropicMock {
    messages = { create: anthropicCreateMock };
    constructor(_options: unknown) {}
  },
}));

import { analyzeLocalPerformance } from "@/lib/server/ai/localAnalyzePerformanceService";
import type { PerformanceMetrics } from "@/types/performance";

const metrics: PerformanceMetrics = {
  timePeriod: "YTD",
  startDate: new Date("2026-01-01T00:00:00.000Z"),
  endDate: new Date("2026-05-31T00:00:00.000Z"),
  dividendEndDate: new Date("2026-05-31T00:00:00.000Z"),
  startNetWorth: 100000,
  endNetWorth: 112000,
  cashFlows: [],
  roi: 12,
  cagr: 9,
  timeWeightedReturn: 10,
  moneyWeightedReturn: 8,
  sharpeRatio: 1.1,
  volatility: 12,
  maxDrawdown: -4,
  drawdownDuration: 2,
  recoveryTime: 1,
  riskFreeRate: 2,
  totalContributions: 5000,
  totalWithdrawals: 0,
  netCashFlow: 5000,
  totalIncome: 10000,
  totalExpenses: 5000,
  totalDividendIncome: 300,
  numberOfMonths: 5,
  yocGross: 2.5,
  yocNet: 1.8,
  yocDividendsGross: 300,
  yocDividendsNet: 220,
  yocCostBasis: 12000,
  yocAssetCount: 2,
  currentYield: 2.1,
  currentYieldNet: 1.5,
  currentYieldDividends: 300,
  currentYieldDividendsNet: 220,
  currentYieldPortfolioValue: 14000,
  currentYieldAssetCount: 2,
  hasInsufficientData: false,
};

async function* createAnthropicChunks() {
  yield {
    type: "content_block_delta",
    delta: { type: "text_delta", text: "Analisi " },
  };
  yield {
    type: "content_block_delta",
    delta: { type: "text_delta", text: "completa" },
  };
  yield {
    type: "content_block_delta",
    delta: { type: "input_json_delta", partial_json: "{}" },
  };
}

async function readStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    result += decoder.decode(value);
  }

  return result;
}

describe("local analyze performance service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
    anthropicCreateMock.mockResolvedValue(createAnthropicChunks());
  });

  it("creates an Anthropic performance-analysis stream and emits SSE text deltas", async () => {
    const stream = await analyzeLocalPerformance(metrics, "YTD");

    expect(anthropicCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-6",
        stream: true,
        messages: [
          {
            role: "user",
            content: expect.stringContaining("analista finanziario italiano"),
          },
        ],
      })
    );
    await expect(readStream(stream)).resolves.toBe(
      'data: {"text":"Analisi "}\n\ndata: {"text":"completa"}\n\ndata: [DONE]\n\n'
    );
  });

  it("fails clearly when Anthropic is not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;

    await expect(analyzeLocalPerformance(metrics, "YTD")).rejects.toThrow(
      "ANTHROPIC_API_KEY is not configured"
    );
  });
});
