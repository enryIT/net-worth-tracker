import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { formatTimePeriodLabel } from "@/lib/utils/formatters";
import type { PerformanceMetrics, TimePeriod } from "@/types/performance";

export async function analyzeLocalPerformance(
  performanceMetrics: PerformanceMetrics,
  timePeriod: string
): Promise<ReadableStream> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
  const anthropicStream = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16000,
    thinking: {
      type: "enabled",
      budget_tokens: 10000,
    },
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 3,
      } as never,
    ],
    messages: [
      {
        role: "user",
        content: buildAnalysisPrompt(performanceMetrics, timePeriod),
      },
    ],
    stream: true,
  });

  return buildPerformanceSseStream(anthropicStream as AsyncIterable<unknown>);
}

function buildPerformanceSseStream(
  anthropicStream: AsyncIterable<unknown>
): ReadableStream {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of anthropicStream) {
          if (isTextDeltaChunk(chunk)) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
            );
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        const message = getStreamErrorMessage(error);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`)
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });
}

function buildAnalysisPrompt(
  performanceMetrics: PerformanceMetrics,
  timePeriod: string
): string {
  const periodLabel = formatTimePeriodLabel(
    timePeriod as TimePeriod,
    performanceMetrics
  );
  const dateRange = `(${format(performanceMetrics.startDate, "dd/MM/yyyy", {
    locale: it,
  })} - ${format(performanceMetrics.endDate, "dd/MM/yyyy", { locale: it })})`;
  const today = format(new Date(), "dd/MM/yyyy", { locale: it });

  return `Oggi e il ${today}. Sei un esperto analista finanziario italiano.

Prima di rispondere, usa la web search per trovare i principali eventi di mercato nel periodo ${periodLabel} ${dateRange}: decisioni delle banche centrali, eventi geopolitici rilevanti, rally o correzioni di mercato significativi.

Poi analizza le seguenti metriche di performance del portafoglio per il periodo ${periodLabel} ${dateRange}:

**Metriche di Rendimento:**
- ROI Totale: ${formatMetric(performanceMetrics.roi)}
- CAGR: ${formatMetric(performanceMetrics.cagr)}
- Time-Weighted Return: ${formatMetric(performanceMetrics.timeWeightedReturn)}
- Money-Weighted Return (IRR): ${formatMetric(performanceMetrics.moneyWeightedReturn)}

**Metriche di Rischio:**
- Volatilita: ${formatMetric(performanceMetrics.volatility)}
- Sharpe Ratio: ${formatMetric(performanceMetrics.sharpeRatio)}
- Max Drawdown: ${formatMetric(performanceMetrics.maxDrawdown)} (${performanceMetrics.maxDrawdownDate || "n/a"})
- Durata Drawdown: ${performanceMetrics.drawdownDuration || "n/a"} mesi
- Recovery Time: ${performanceMetrics.recoveryTime || "n/a"} mesi

**Metriche di Contesto:**
- Patrimonio Iniziale: ${formatCurrency(performanceMetrics.startNetWorth)}
- Patrimonio Finale: ${formatCurrency(performanceMetrics.endNetWorth)}
- Contributi Netti: ${formatCurrency(performanceMetrics.netCashFlow)}
- Durata: ${performanceMetrics.numberOfMonths} mesi

${performanceMetrics.yocGross !== null ? `**Metriche Dividendi:**
- YOC Lordo: ${formatMetric(performanceMetrics.yocGross)}
- YOC Netto: ${formatMetric(performanceMetrics.yocNet)}
- Current Yield Lordo: ${formatMetric(performanceMetrics.currentYield)}
- Current Yield Netto: ${formatMetric(performanceMetrics.currentYieldNet)}` : ""}

Fornisci un'analisi concisa e actionable (massimo 350 parole) che:
1. Interpreta le metriche chiave e cosa significano per questo portafoglio
2. Decomponi la variazione del patrimonio: quanta parte della crescita o perdita e organica vs apporti di nuovo capitale
3. Identifica gli eventi chiave dei mercati finanziari nel periodo analizzato e spiega come potrebbero aver influenzato la performance
4. Evidenzia i punti di forza della performance
5. Identifica aree di miglioramento o rischi da considerare
6. Se appropriato, offri 1-2 suggerimenti concreti

Usa un tono professionale ma accessibile. Rispondi in italiano con formattazione markdown.`;
}

function isTextDeltaChunk(
  chunk: unknown
): chunk is { type: "content_block_delta"; delta: { type: "text_delta"; text: string } } {
  if (!isRecord(chunk) || chunk.type !== "content_block_delta") {
    return false;
  }

  const delta = chunk.delta;
  return isRecord(delta) && delta.type === "text_delta" && typeof delta.text === "string";
}

function getStreamErrorMessage(error: unknown): string {
  if (isRecord(error) && isRecord(error.error)) {
    if (error.error.type === "overloaded_error") {
      return 'I server AI sono temporaneamente sovraccarichi. Clicca "Rigenera" per riprovare.';
    }

    if (typeof error.error.message === "string") {
      return error.error.message;
    }
  }

  return error instanceof Error ? error.message : "Errore durante la generazione";
}

function formatMetric(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return `${value.toFixed(2)}%`;
}

function formatCurrency(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
