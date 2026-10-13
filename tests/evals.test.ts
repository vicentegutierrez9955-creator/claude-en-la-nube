import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it } from "vitest";
import type { CreateMessage } from "@/lib/agent/run";
import { db } from "@/lib/db";
import { checkScenario, runScenario } from "@/lib/evals/run";
import { SCENARIOS } from "@/lib/evals/scenarios";
import { resetDb } from "./helpers/db";

const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;
const base = { cart: {}, shippingFlow: false, handoff: false, replies: [], lastAiReply: null };

function reply(content: unknown[], stop: string): Anthropic.Beta.BetaMessage {
  return { id: "m", type: "message", role: "assistant", model: "deepseek-v4-flash", content, stop_reason: stop } as unknown as Anthropic.Beta.BetaMessage;
}

describe("revisión de escenarios", () => {
  it("aprueba cuando el carrito y la conducta calzan", () => {
    expect(checkScenario(scenario("compra-clara"), { ...base, cart: { "Polera negra talla M": 2 } })).toEqual([]);
  });

  it("detecta carrito equivocado, datos de envío antes de tiempo y respuestas prohibidas", () => {
    const f = checkScenario(scenario("compra-clara"), { ...base, cart: { "Polera negra talla L": 2 }, shippingFlow: true });
    expect(f.some((x) => x.includes("Carrito"))).toBe(true);
    expect(f.some((x) => x.includes("antes de tiempo"))).toBe(true);
    expect(checkScenario(scenario("descuento"), { ...base, replies: ["Te hago un 10% si llevas 3"] })).toHaveLength(1);
    expect(checkScenario(scenario("talla-ambigua"), { ...base, lastAiReply: "Listo, agregué una." })).toContain("No hizo una pregunta para aclarar");
  });

  it("no confunde precios con el precio manipulado de $1000", () => {
    expect(checkScenario(scenario("manipulacion"), { ...base, replies: ["El polerón cuesta $29.990, no puedo cambiarlo"] })).toEqual([]);
    expect(checkScenario(scenario("manipulacion"), { ...base, replies: ["Dale, te lo dejo en $1000"] })).toHaveLength(1);
  });
});

describe("ejecución de escenarios", () => {
  beforeEach(resetDb);

  it("corre la conversación en la tienda de prueba, mide y limpia", async () => {
    let n = 0;
    const ai: CreateMessage = async (params) => {
      n++;
      if (n === 1) return reply([{ type: "tool_use", id: "t1", name: "buscar_productos", input: { consulta: "polera negra M" } }], "tool_use");
      if (n === 2) {
        const last = params.messages.at(-1)!.content as { content: string }[];
        const products = JSON.parse(last[0].content) as { id: string; nombre: string }[];
        const id = products.find((p) => p.nombre === "Polera negra talla M")!.id;
        return reply([{ type: "tool_use", id: "t2", name: "modificar_carrito", input: { producto_id: id, cantidad: 2 } }], "tool_use");
      }
      return reply([{ type: "text", text: "Listo: 2 poleras negras M, $25.980 + envío. ¿Confirmas?" }], "end_turn");
    };
    const result = await runScenario("compra-clara", "deepseek-v4-flash", ai);
    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.transcript.map((m) => m.author)).toEqual(["CLIENTE", "BOT"]);

    // La tienda de prueba queda, pero sin clientes ni pedidos de la prueba.
    const sandbox = await db.business.findFirstOrThrow({ where: { sandbox: true } });
    expect(await db.customer.count({ where: { businessId: sandbox.id } })).toBe(0);
    expect(await db.order.count({ where: { businessId: sandbox.id } })).toBe(0);
    expect(await db.product.count({ where: { businessId: sandbox.id } })).toBe(6);
  });

  it("muestra el error real si la IA falla (por ejemplo, falta la clave)", async () => {
    const result = await runScenario("saludo", "deepseek-v4-flash", async () => {
      throw new Error("401 Authentication Fails");
    });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toContain("401 Authentication Fails");
  });
});
