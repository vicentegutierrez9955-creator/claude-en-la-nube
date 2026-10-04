import type Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";
import { beforeEach, describe, expect, it } from "vitest";
import type { CreateMessage } from "@/lib/agent/run";
import { processConversation, receiveCustomerMessage } from "@/lib/conversations";
import { db } from "@/lib/db";
import { markDispatched, markOrderPaid } from "@/lib/orders";
import { createBusiness, resetDb } from "./helpers/db";

type Block = Anthropic.Beta.BetaContentBlock;

function message(content: Block[], stop: Anthropic.Beta.BetaMessage["stop_reason"]): Anthropic.Beta.BetaMessage {
  return { id: "msg", type: "message", role: "assistant", model: "test", content, stop_reason: stop } as unknown as Anthropic.Beta.BetaMessage;
}
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }) as unknown as Block;
const text = (t: string) => ({ type: "text", text: t }) as unknown as Block;

function lastToolResult(params: Anthropic.Beta.MessageCreateParamsNonStreaming): string {
  const last = params.messages[params.messages.length - 1];
  const block = (last.content as Anthropic.Beta.BetaToolResultBlockParam[])[0];
  return String(block.content);
}

// Simula a Claude atendiendo una compra completa usando las herramientas reales.
function scriptedSeller(calls: Anthropic.Beta.MessageCreateParamsNonStreaming[]): CreateMessage {
  return async (params) => {
    calls.push(params);
    switch (calls.length) {
      case 1:
        return message([toolUse("t1", "buscar_productos", { consulta: "polera" })], "tool_use");
      case 2: {
        const products = JSON.parse(lastToolResult(params)) as { id: string }[];
        return message([toolUse("t2", "modificar_carrito", { producto_id: products[0].id, cantidad: 2 })], "tool_use");
      }
      case 3:
        return message(
          [
            toolUse("t3", "guardar_datos_envio", {
              nombre: "Ana Pérez",
              telefono: "",
              rut: "",
              calle: "Los Aromos",
              numero: "45",
              depto: "Depto 3B",
              comuna: "Viña del Mar",
              region: "Valparaíso",
              referencias: "",
            }),
          ],
          "tool_use",
        );
      case 4:
        return message([toolUse("t4", "confirmar_pedido", {})], "tool_use");
      default:
        return message([text("¡Listo Ana! Te mandé el link de pago 🙌")], "end_turn");
    }
  };
}

describe("flujo completo: WhatsApp → pedido → pago → etiqueta → despacho", () => {
  beforeEach(resetDb);

  it("el vendedor IA arma el pedido y el pago genera la etiqueta", async () => {
    const business = await createBusiness();
    const conversationId = await receiveCustomerMessage({
      businessId: business.id,
      waId: "56911112222",
      profileName: "Ana",
      text: "Hola! quiero 2 poleras negras talla M, a Los Aromos 45 depto 3B, Viña del Mar. Ana Pérez",
      waMessageId: null,
      channel: "SIMULADOR",
    });
    expect(conversationId).toBeTruthy();

    const calls: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
    await processConversation(conversationId!, scriptedSeller(calls));

    expect(calls).toHaveLength(5);
    expect(calls[0].model).toBe("claude-opus-5-5");
    expect(calls[0].fallbacks).toBe("default");
    expect(String(calls[0].system)).toContain("Poleras Valpo");

    const order = await db.order.findFirstOrThrow({ where: { conversationId: conversationId! }, include: { items: true } });
    expect(order.status).toBe("PENDIENTE_PAGO");
    expect(order.items).toHaveLength(1);
    expect(order.subtotal).toBe(25980);
    expect(order.shippingCost).toBe(3990);
    expect(order.total).toBe(29970);
    expect(order.recipientPhone).toBe("56911112222"); // usa el WhatsApp si no dio otro
    expect(order.paymentUrl).toBe(`https://pedidos.test/pago-simulado/${order.id}`);

    const messages = await db.message.findMany({ where: { conversationId: conversationId! }, orderBy: { createdAt: "asc" } });
    expect(messages.map((m) => m.author)).toEqual(["CLIENTE", "BOT", "BOT"]);
    expect(messages[1].text).toContain(order.paymentUrl);
    expect(messages[2].text).toContain("Te mandé el link");
    expect(messages[0].processed).toBe(true);

    // El historial guardado incluye todo el turno, para continuar la conversación.
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: conversationId! } });
    expect((conv.agentHistory as unknown[]).length).toBe(10);
    expect(conv.lockedUntil).toBeNull();

    // Pago aprobado → descuenta stock → etiqueta lista
    expect(await markOrderPaid(order.id, "mp-999")).toBe(true);
    expect(await markOrderPaid(order.id, "mp-999")).toBe(false); // idempotente
    const paid = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid.status).toBe("ETIQUETA_LISTA");
    expect(paid.trackingNumber).toMatch(/^SIM\d{9}$/);
    const pdf = await PDFDocument.load(paid.labelPdf!);
    expect(pdf.getPageCount()).toBe(1);
    const product = await db.product.findFirstOrThrow({ where: { name: "Polera negra M" } });
    expect(product.stock).toBe(3);

    // Despacho → aviso con seguimiento
    expect(await markDispatched(business.id, [order.id])).toBe(1);
    const last = await db.message.findFirstOrThrow({ where: { conversationId: conversationId! }, orderBy: { createdAt: "desc" } });
    expect(last.text).toContain(paid.trackingNumber!);
  });

  it("no deja agregar más unidades que el stock", async () => {
    const business = await createBusiness();
    const conversationId = await receiveCustomerMessage({
      businessId: business.id,
      waId: "56933334444",
      profileName: null,
      text: "quiero 5 gorros",
      waMessageId: null,
      channel: "SIMULADOR",
    });
    const gorro = await db.product.findFirstOrThrow({ where: { name: "Gorro de lana" } });
    const results: string[] = [];
    let n = 0;
    await processConversation(conversationId!, async (params) => {
      n++;
      if (n === 1) return message([toolUse("t1", "modificar_carrito", { producto_id: gorro.id, cantidad: 5 })], "tool_use");
      results.push(lastToolResult(params));
      return message([text("Solo me quedan 2 😅")], "end_turn");
    });
    expect(results[0]).toContain("Solo quedan 2");
  });

  it("ignora mensajes duplicados de WhatsApp y no responde si atiende una persona", async () => {
    const business = await createBusiness();
    const base = { businessId: business.id, waId: "56955556666", profileName: "Luis", text: "hola", channel: "WHATSAPP" as const };
    const id = await receiveCustomerMessage({ ...base, waMessageId: "wamid.dup" });
    expect(await receiveCustomerMessage({ ...base, waMessageId: "wamid.dup" })).toBeNull();

    await db.conversation.update({ where: { id: id! }, data: { mode: "HUMANO" } });
    let called = false;
    await processConversation(id!, async () => {
      called = true;
      throw new Error("no debería llamarse");
    });
    expect(called).toBe(false);
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: id! } });
    expect(conv.needsHuman).toBe(true);
  });

  it("si el modelo rechaza, deriva a una persona", async () => {
    const business = await createBusiness();
    const id = await receiveCustomerMessage({
      businessId: business.id,
      waId: "56977778888",
      profileName: null,
      text: "...",
      waMessageId: null,
      channel: "SIMULADOR",
    });
    await processConversation(id!, async () => message([], "refusal"));
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: id! }, include: { messages: true } });
    expect(conv.mode).toBe("HUMANO");
    expect(conv.messages.some((m) => m.author === "BOT" && m.text.includes("persona"))).toBe(true);
  });
});
