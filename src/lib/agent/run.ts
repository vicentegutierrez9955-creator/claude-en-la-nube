import Anthropic from "@anthropic-ai/sdk";
import type { Business, FaqEntry } from "@prisma/client";
import { buildSystemPrompt } from "./prompt";
import { runTool, TOOL_DEFINITIONS, type ToolContext } from "./tools";

export type CreateMessage = (
  params: Anthropic.Beta.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Beta.BetaMessage>;

export function isDeepSeek(model: string): boolean {
  return model.startsWith("deepseek");
}

let claudeClient: Anthropic | null = null;
let deepseekClient: Anthropic | null = null;

// DeepSeek ofrece un endpoint compatible con la API de Mensajes de Anthropic, así que
// se usa el mismo SDK apuntando a su URL. Solo acepta los parámetros estándar.
export const defaultCreateMessage: CreateMessage = async (params) => {
  if (isDeepSeek(params.model)) {
    deepseekClient ??= new Anthropic({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/anthropic",
    });
    const response = await deepseekClient.messages.create(params as unknown as Anthropic.MessageCreateParamsNonStreaming);
    return response as unknown as Anthropic.Beta.BetaMessage;
  }
  claudeClient ??= new Anthropic();
  return claudeClient.beta.messages.create(params);
};

const MAX_STEPS = 10;
type Effort = "low" | "medium" | "high" | "xhigh" | "max";

// Parámetros según el modelo: DeepSeek y Haiku 4.5 no aceptan "effort" ni el fallback del servidor.
export function modelParams(
  model: string,
): Pick<Anthropic.Beta.MessageCreateParamsNonStreaming, "model" | "output_config" | "betas" | "fallbacks"> {
  if (isDeepSeek(model) || model.startsWith("claude-haiku")) return { model };
  return {
    model,
    output_config: { effort: (process.env.AI_EFFORT as Effort | undefined) ?? "medium" },
    // Si un clasificador de seguridad rechaza la solicitud, la API reintenta con el modelo recomendado.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };
}

export type AgentTurnResult = {
  history: Anthropic.Beta.BetaMessageParam[];
  reply: string | null;
  refused: boolean;
};

// Ejecuta un turno del vendedor: agrega el mensaje del cliente al historial,
// deja que la IA use las herramientas y devuelve el texto a enviar por WhatsApp.
export async function runAgentTurn(opts: {
  business: Business;
  faqs?: FaqEntry[];
  history: Anthropic.Beta.BetaMessageParam[];
  userText: string;
  ctx: ToolContext;
  model: string;
  createMessage?: CreateMessage;
  // Se llama con cada respuesta de la IA (para registrar el consumo).
  onResponse?: (response: Anthropic.Beta.BetaMessage) => Promise<void>;
}): Promise<AgentTurnResult> {
  const createMessage = opts.createMessage ?? defaultCreateMessage;
  const history = [...opts.history, { role: "user" as const, content: opts.userText }];
  const system = buildSystemPrompt(opts.business, opts.faqs ?? []);

  for (let step = 0; step < MAX_STEPS; step++) {
    const deepseek = isDeepSeek(opts.model);
    const response = await createMessage({
      ...modelParams(opts.model),
      max_tokens: deepseek ? 8000 : 16000,
      system,
      // DeepSeek cachea solo los prefijos repetidos y no conoce "strict"; Claude necesita cache_control.
      tools: deepseek ? TOOL_DEFINITIONS.map(({ strict: _strict, ...tool }) => tool) : TOOL_DEFINITIONS,
      messages: history,
      ...(deepseek ? {} : { cache_control: { type: "ephemeral" as const } }),
    });
    await opts.onResponse?.(response);

    // Se guarda el contenido completo (incluye bloques de razonamiento) y el historial solo crece al final.
    history.push({ role: "assistant", content: response.content as Anthropic.Beta.BetaContentBlockParam[] });

    if (response.stop_reason === "refusal") {
      return { history, reply: null, refused: true };
    }
    if (response.stop_reason === "pause_turn") continue;

    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason === "tool_use" && toolUses.length > 0) {
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      // En orden: varias herramientas pueden tocar el mismo carrito.
      for (const toolUse of toolUses) {
        const result = await runTool(toolUse.name, toolUse.input, opts.ctx);
        results.push({ type: "tool_result", tool_use_id: toolUse.id, content: result.content, is_error: result.isError });
      }
      history.push({ role: "user", content: results });
      continue;
    }

    const reply = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { history, reply: reply || null, refused: false };
  }

  return { history, reply: null, refused: false };
}
