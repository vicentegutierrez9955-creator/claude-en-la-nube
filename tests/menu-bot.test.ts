import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it } from "vitest";
import type { CreateMessage } from "@/lib/agent/run";
import { processConversation, receiveCustomerMessage } from "@/lib/conversations";
import { db } from "@/lib/db";
import { matchFaq, splitStreet } from "@/lib/menu-bot";
import { createBusiness, resetDb } from "./helpers/db";

let aiCalls = 0;
const noAi: CreateMessage = async () => {
  aiCalls++;
  throw new Error("En modo menú no se debe llamar a la IA");
};

function customerChat(businessId: string, waId = "56911112222", createMessage: CreateMessage = noAi) {
  return async (text: string): Promise<string> => {
    const id = await receiveCustomerMessage({ businessId, waId, profileName: "Ana", text, waMessageId: null, channel: "WHATSAPP" });
    await processConversation(id!, createMessage);
    const last = await db.message.findFirstOrThrow({
      where: { conversationId: id!, direction: "SALIENTE" },
      orderBy: { createdAt: "desc" },
    });
    return last.text;
  };
}

describe("menú de respuestas predeterminadas (sin IA)", () => {
  beforeEach(async () => {
    await resetDb();
    aiCalls = 0;
  });

  it("lleva al cliente del saludo al link de pago sin usar IA", async () => {
    const business = await createBusiness("MENU");
    const say = customerChat(business.id);

    expect(await say("hola")).toContain("Bienvenido/a a *Poleras Valpo*");
    const catalog = await say("1");
    expect(catalog).toContain("Gorro de lana");
    expect(catalog).toContain("Polera negra M");

    // Orden alfabético: 1. Gorro de lana, 2. Polera negra M
    expect(await say("2")).toContain("¿Cuántas unidades quieres?");
    const cart = await say("2");
    expect(cart).toContain("2 x Polera negra M");
    expect(cart).toContain("$29.970");

    expect(await say("2")).toContain("¿A nombre de quién");
    expect(await say("Ana Pérez")).toContain("calle y número");
    expect(await say("Av. Libertad 870")).toContain("depto");
    expect(await say("Depto 1203")).toContain("comuna");
    expect(await say("Viña del Mar")).toContain("región");
    const confirm = await say("6");
    expect(confirm).toContain("Av. Libertad 870, Depto 1203, Viña del Mar, Valparaíso");
    expect(await say("1")).toContain("te avisaremos");

    const order = await db.order.findFirstOrThrow({ where: { businessId: business.id }, include: { items: true } });
    expect(order.status).toBe("PENDIENTE_PAGO");
    expect(order.recipientName).toBe("Ana Pérez");
    expect(order.street).toBe("Av. Libertad");
    expect(order.streetNumber).toBe("870");
    expect(order.recipientPhone).toBe("56911112222");
    const linkMsg = await db.message.findFirst({ where: { text: { contains: order.paymentUrl! } } });
    expect(linkMsg?.author).toBe("MENU");
    expect(aiCalls).toBe(0);
  });

  it("encuentra productos escritos con palabras y responde preguntas frecuentes", async () => {
    const business = await createBusiness("MENU");
    await db.faqEntry.create({
      data: { businessId: business.id, question: "¿Hacen envíos a regiones?", keywords: "envio, regiones, despacho", answer: "Sí, enviamos a todo Chile con Blue Express 🚚" },
    });
    const say = customerChat(business.id);

    const first = await say("hola tienen poleras?");
    expect(first).toContain("Encontré esto");
    expect(first).toContain("Polera negra M");
    expect(first).not.toContain("Gorro");

    expect(await say("hacen envíos a regiones?")).toContain("enviamos a todo Chile");
    expect(await say("menú")).toContain("Preguntas frecuentes");
    expect(aiCalls).toBe(0);
  });

  it("busca sin importar tildes ni plurales", async () => {
    const business = await createBusiness("MENU");
    await db.product.create({ data: { businessId: business.id, name: "Polerón canguro", price: 29990, stock: 3 } });
    const say = customerChat(business.id);
    const reply = await say("hola! tienen polerones?");
    expect(reply).toContain("Polerón canguro");
    expect(reply).not.toContain("Polera negra");
  });

  it("si no entiende, lo dice y ofrece hablar con una persona", async () => {
    const business = await createBusiness("MENU");
    const say = customerChat(business.id);
    await say("hola");
    expect(await say("asdf qwerty")).toContain("No te entendí");
    expect(await say("zzzz yyyy")).toContain("persona");
    expect(await say("quiero hablar con una persona")).toContain("Una persona del equipo");
    const conv = await db.conversation.findFirstOrThrow({ where: { businessId: business.id } });
    expect(conv.mode).toBe("HUMANO");
    expect(conv.needsHuman).toBe(true);
    expect(aiCalls).toBe(0);
  });

  it("ofrece reutilizar la dirección de la compra anterior", async () => {
    const business = await createBusiness("MENU");
    const say = customerChat(business.id);
    for (const t of ["hola", "1", "1", "1", "2", "Ana Pérez", "Los Aromos 45", "no", "Concepción", "biobio"]) await say(t);
    await say("1"); // confirmar y pagar
    for (const t of ["menu", "1", "2", "1"]) await say(t);
    const reuse = await say("2");
    expect(reuse).toContain("misma dirección");
    expect(reuse).toContain("Los Aromos 45, Concepción, Biobío");
    expect(await say("1")).toContain("Confirmar y pagar");
  });

  it("en el carrito, 'pagar' cierra la compra aunque exista una respuesta rápida sobre pagos", async () => {
    const business = await createBusiness("MENU");
    await db.faqEntry.create({ data: { businessId: business.id, question: "¿Cómo pago?", keywords: "pagar, pago", answer: "Con Mercado Pago" } });
    const say = customerChat(business.id);
    for (const t of ["hola", "1", "2", "1"]) await say(t);
    expect(await say("pagar")).toContain("¿A nombre de quién");
  });

  it("no deja pedir más que el stock", async () => {
    const business = await createBusiness("MENU");
    const say = customerChat(business.id);
    await say("hola");
    await say("1");
    await say("1"); // Gorro de lana, stock 2
    expect(await say("5")).toContain("Solo quedan 2");
  });
});

describe("modo híbrido", () => {
  beforeEach(resetDb);

  it("usa el menú para lo simple y la IA solo cuando el menú no entiende", async () => {
    const business = await createBusiness("HIBRIDO");
    let calls = 0;
    const ai: CreateMessage = async () => {
      calls++;
      return {
        id: "m",
        type: "message",
        role: "assistant",
        model: "test",
        content: [{ type: "text", text: "¡Claro! Para regalo te recomiendo el gorro 🎁" }],
        stop_reason: "end_turn",
      } as unknown as Anthropic.Beta.BetaMessage;
    };
    const say = customerChat(business.id, "56922223333", ai);

    expect(await say("hola")).toContain("Responde con el número");
    expect(await say("1")).toContain("Gorro de lana");
    expect(calls).toBe(0);

    expect(await say("algo bonito para regalarle a mi mamá?")).toContain("te recomiendo el gorro");
    expect(calls).toBe(1);
    // Una vez que la IA tomó la conversación, sigue ella...
    await say("y viene en colores?");
    expect(calls).toBe(2);
    // ...hasta que el cliente pide el menú.
    expect(await say("menú")).toContain("Responde con el número");
    expect(calls).toBe(2);
  });
});

describe("utilidades del menú", () => {
  it("separa calle y número", () => {
    expect(splitStreet("Av. Libertad 870")).toEqual({ street: "Av. Libertad", number: "870" });
    expect(splitStreet("Los Aromos #45")).toEqual({ street: "Los Aromos", number: "45" });
    expect(splitStreet("Pasaje Las Rosas")).toEqual({ street: "Pasaje Las Rosas", number: null });
    expect(splitStreet("Calle 5 Oriente 1234")).toEqual({ street: "Calle 5 Oriente", number: "1234" });
  });

  it("encuentra preguntas frecuentes por palabra clave sin importar tildes ni plurales", () => {
    const faq = { id: "1", keywords: "envío, despacho", question: "", answer: "a" } as Parameters<typeof matchFaq>[1][number];
    expect(matchFaq("hacen ENVÍOS?", [faq])).toBe(faq);
    expect(matchFaq("cuanto demora el despacho", [faq])).toBe(faq);
    expect(matchFaq("hola", [faq])).toBeNull();
  });
});
