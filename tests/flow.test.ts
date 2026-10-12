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

function userText(params: Anthropic.Beta.MessageCreateParamsNonStreaming): string {
  const first = params.messages.findLast((m) => m.role === "user" && typeof m.content === "string");
  return String(first?.content ?? "");
}

// Simula a la IA atendiendo una compra: busca, agrega al carrito y le pasa al sistema
// la toma privada de datos de envío.
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
        return message([toolUse("t3", "pedir_datos_envio", {})], "tool_use");
      case 4:
        return message([text("¡Perfecto! Ahora te pido los datos para el despacho 📦")], "end_turn");
      default:
        return message([text("Llega en 2 a 5 días hábiles 🚚")], "end_turn");
    }
  };
}

describe("flujo completo: WhatsApp → pedido → pago → etiqueta → despacho", () => {
  beforeEach(resetDb);

  it("la IA vende, el sistema toma los datos de envío en privado y el pago genera la etiqueta", async () => {
    const business = await createBusiness();
    const calls: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
    const seller = scriptedSeller(calls);
    const say = async (text: string) => {
      const id = await receiveCustomerMessage({
        businessId: business.id,
        waId: "56911112222",
        profileName: "Ana",
        text,
        waMessageId: null,
        channel: "SIMULADOR",
      });
      await processConversation(id!, seller);
      return id!;
    };

    const conversationId = await say("Hola! quiero 2 poleras negras talla M. Mi fono es +56 9 1234 5678");
    expect(calls).toHaveLength(4);
    expect(calls[0].model).toBe("deepseek-v4-flash");
    expect(calls[0].fallbacks).toBeUndefined();
    expect(calls[0].tools?.some((t) => "strict" in t)).toBe(false);
    // La IA no recibe el teléfono ni el nombre del perfil de WhatsApp.
    expect(userText(calls[0])).toContain("[teléfono oculto]");
    expect(userText(calls[0])).not.toContain("1234");
    expect(JSON.stringify(calls[0])).not.toContain("56911112222");

    let messages = await db.message.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } });
    expect(messages.map((m) => m.author)).toEqual(["CLIENTE", "BOT", "MENU"]);
    expect(messages[2].text).toContain("¿A nombre de quién");
    expect(messages[2].private).toBe(true);

    // Los datos de envío los toma el sistema: la IA no se llama.
    for (const t of ["Ana Pérez", "Los Aromos 45", "Depto 3B", "Viña del Mar", "6", "1"]) await say(t);
    expect(calls).toHaveLength(4);

    const order = await db.order.findFirstOrThrow({ where: { conversationId }, include: { items: true } });
    expect(order.status).toBe("PENDIENTE_PAGO");
    expect(order.items).toHaveLength(1);
    expect(order.total).toBe(29970);
    expect(order.recipientName).toBe("Ana Pérez");
    expect(order.street).toBe("Los Aromos");
    expect(order.streetNumber).toBe("45");
    expect(order.recipientPhone).toBe("56911112222");
    expect(order.paymentUrl).toBe(`https://pedidos.test/pago-simulado/${order.id}`);

    messages = await db.message.findMany({ where: { conversationId }, orderBy: { createdAt: "asc" } });
    const linkMsg = messages.find((m) => m.text.includes(order.paymentUrl!));
    expect(linkMsg?.private).toBe(true);
    expect(messages.filter((m) => m.text === "Ana Pérez" || m.text === "Los Aromos 45").every((m) => m.private)).toBe(true);

    // De vuelta con la IA: sabe que se tomaron los datos, pero no los ve.
    await say("gracias! cuánto demora?");
    expect(calls).toHaveLength(5);
    const context = userText(calls[4]);
    expect(context).toContain("ocultos por privacidad");
    expect(context).not.toContain("Aromos");
    expect(context).not.toContain("Ana Pérez");

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
    const last = await db.message.findFirstOrThrow({ where: { conversationId }, orderBy: { createdAt: "desc" } });
    expect(last.text).toContain(paid.trackingNumber!);
  });

  it("si la IA falla, el cliente recibe el menú y el chat queda marcado", async () => {
    const business = await createBusiness();
    const id = await receiveCustomerMessage({
      businessId: business.id,
      waId: "56944445555",
      profileName: null,
      text: "hola",
      waMessageId: null,
      channel: "SIMULADOR",
    });
    await processConversation(id!, async () => {
      throw new Error("DeepSeek no responde");
    });
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: id! }, include: { messages: true } });
    expect(conv.needsHuman).toBe(true);
    expect(conv.messages.some((m) => m.author === "MENU" && m.text.includes("Responde con el número"))).toBe(true);
  });

  it("el bot retoma solo cuando vence la pausa de una persona", async () => {
    const business = await createBusiness();
    const base = { businessId: business.id, waId: "56966667777", profileName: null, waMessageId: null, channel: "SIMULADOR" as const };
    const id = await receiveCustomerMessage({ ...base, text: "hola" });
    await db.conversation.update({ where: { id: id! }, data: { mode: "HUMANO", humanUntil: new Date(Date.now() - 1000) } });
    let called = 0;
    await processConversation(id!, async () => {
      called++;
      return message([text("¡Hola! ¿Qué buscas?")], "end_turn");
    });
    expect(called).toBe(1);
    const conv = await db.conversation.findUniqueOrThrow({ where: { id: id! } });
    expect(conv.mode).toBe("BOT");
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
