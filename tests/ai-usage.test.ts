import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it } from "vitest";
import { modelParams, type CreateMessage } from "@/lib/agent/run";
import { costUsd, monthlyAiSummary } from "@/lib/ai-usage";
import { processConversation, receiveCustomerMessage } from "@/lib/conversations";
import { db } from "@/lib/db";
import { createBusiness, resetDb } from "./helpers/db";

describe("costo de IA", () => {
  it("calcula el costo con los precios por millón de tokens", () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 2_000_000, cache_creation_input_tokens: 0 };
    // Opus 5.5: 1M x $4 + 0,1M x $20 + 2M x $0,20 = 4 + 2 + 0,4
    expect(costUsd("claude-opus-5-5", usage)).toBeCloseTo(6.4);
    // Haiku 4.5: 1 + 0,5 + 0,2
    expect(costUsd("claude-haiku-4-5", usage)).toBeCloseTo(1.7);
    // Escritura en caché = 1,25x la entrada
    expect(costUsd("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(2.5);
  });

  it("Haiku no recibe parámetros que no soporta", () => {
    expect(modelParams("claude-haiku-4-5")).toEqual({ model: "claude-haiku-4-5" });
    const opus = modelParams("claude-opus-5-5");
    expect(opus.fallbacks).toBe("default");
    expect(opus.output_config?.effort).toBe("medium");
  });
});

describe("medidor de consumo y tope mensual", () => {
  beforeEach(resetDb);

  function aiReplying(calls: Anthropic.Beta.MessageCreateParamsNonStreaming[]): CreateMessage {
    return async (params) => {
      calls.push(params);
      return {
        id: "m",
        type: "message",
        role: "assistant",
        model: params.model,
        content: [{ type: "text", text: "¡Hola! ¿En qué te ayudo?" }],
        stop_reason: "end_turn",
        // 100.000 tokens de entrada y 10.000 de salida en Haiku = US$0,15
        usage: { input_tokens: 100_000, output_tokens: 10_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      } as unknown as Anthropic.Beta.BetaMessage;
    };
  }

  it("registra el costo, usa el modelo de la tienda y pasa al menú al llegar al tope", async () => {
    const business = await createBusiness("IA");
    await db.business.update({ where: { id: business.id }, data: { aiModel: "claude-haiku-4-5", aiMonthlyLimitUsd: 0.2 } });
    const calls: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
    const say = async (text: string) => {
      const id = await receiveCustomerMessage({ businessId: business.id, waId: "56900001111", profileName: null, text, waMessageId: null, channel: "SIMULADOR" });
      await processConversation(id!, aiReplying(calls));
      return db.message.findFirstOrThrow({ where: { conversationId: id!, direction: "SALIENTE" }, orderBy: { createdAt: "desc" } });
    };

    expect((await say("hola")).author).toBe("BOT");
    expect(calls[0].model).toBe("claude-haiku-4-5");
    expect(calls[0].fallbacks).toBeUndefined();

    const summary = await monthlyAiSummary(business.id);
    expect(summary.costUsd).toBeCloseTo(0.15);
    expect(summary.conversations).toBe(1);

    await say("tienen poleras?"); // US$0,30 acumulado: pasa el tope de US$0,20
    expect(calls).toHaveLength(2);

    const afterLimit = await say("hola de nuevo");
    expect(calls).toHaveLength(2); // ya no llama a la IA
    expect(afterLimit.author).toBe("MENU");
  });
});
