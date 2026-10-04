import type Anthropic from "@anthropic-ai/sdk";
import type { Business } from "@prisma/client";
import { db } from "./db";

// Precios oficiales por millón de tokens (USD). La escritura en caché (5 min) cuesta 1,25x la entrada.
type Price = { input: number; output: number; cacheRead: number };
const PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
  // Modelos a los que la API puede derivar si rechaza una solicitud (fallback).
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
};

export const AI_MODELS = [
  { id: "claude-opus-5-5", label: "Opus 5.5", note: "El más capaz · costo alto" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", note: "Muy bueno · la mitad del costo de Opus" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", note: "Rápido y económico · un cuarto del costo de Opus" },
] as const;

export const DEFAULT_MODEL = process.env.AI_MODEL ?? "claude-opus-5-5";

export function modelFor(business: Pick<Business, "aiModel">): string {
  return business.aiModel || DEFAULT_MODEL;
}

export function modelLabel(id: string): string {
  return AI_MODELS.find((m) => m.id === id)?.label ?? id;
}

export function usdToClp(usd: number): number {
  return Math.round(usd * Number(process.env.USD_CLP ?? 950));
}

export function costUsd(model: string, usage: Partial<Anthropic.Beta.BetaUsage> | undefined): number {
  if (!usage) return 0;
  const price = PRICES[model] ?? PRICES[DEFAULT_MODEL] ?? PRICES["claude-opus-5-5"];
  const input = usage.input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  return (input * price.input + cacheWrite * price.input * 1.25 + cacheRead * price.cacheRead + output * price.output) / 1_000_000;
}

export async function recordAiUsage(businessId: string, conversationId: string | null, response: Anthropic.Beta.BetaMessage) {
  const usage = response.usage;
  if (!usage) return;
  await db.aiUsage.create({
    data: {
      businessId,
      conversationId,
      model: response.model,
      inputTokens: usage.input_tokens ?? 0,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
      outputTokens: usage.output_tokens ?? 0,
      costUsd: costUsd(response.model, usage),
    },
  });
}

// Primer instante del mes actual en hora de Chile.
export function startOfMonthChile(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  // Chile está entre UTC-3 y UTC-4: se toma UTC-4 para no dejar fuera las primeras horas del mes.
  return new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
}

export async function monthlyAiSummary(businessId: string) {
  const since = startOfMonthChile();
  const [agg, conversations] = await Promise.all([
    db.aiUsage.aggregate({ where: { businessId, createdAt: { gte: since } }, _sum: { costUsd: true }, _count: true }),
    db.aiUsage.findMany({
      where: { businessId, createdAt: { gte: since }, conversationId: { not: null } },
      distinct: ["conversationId"],
      select: { conversationId: true },
    }),
  ]);
  return { costUsd: agg._sum.costUsd ?? 0, calls: agg._count, conversations: conversations.length };
}

// ¿Puede usar IA este mes? Si pasó su tope, el vendedor atiende solo con el menú.
export async function aiBudgetExceeded(business: Pick<Business, "id" | "aiMonthlyLimitUsd">): Promise<boolean> {
  if (!business.aiMonthlyLimitUsd || business.aiMonthlyLimitUsd <= 0) return false;
  const { costUsd } = await monthlyAiSummary(business.id);
  return costUsd >= business.aiMonthlyLimitUsd;
}
