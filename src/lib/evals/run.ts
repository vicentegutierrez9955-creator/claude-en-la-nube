import type { Business } from "@prisma/client";
import { defaultCreateMessage, type CreateMessage } from "../agent/run";
import { processConversation, receiveCustomerMessage } from "../conversations";
import { db } from "../db";
import { inShippingFlow, type MenuState } from "../menu-bot";
import { CATALOG, FAQS, SCENARIOS, SHIPPING, type Scenario } from "./scenarios";

export type Observed = {
  cart: Record<string, number>;
  shippingFlow: boolean;
  handoff: boolean;
  replies: string[]; // respuestas no privadas enviadas al cliente
  lastAiReply: string | null;
};

export type EvalResult = {
  id: string;
  title: string;
  passed: boolean;
  failures: string[];
  transcript: { author: string; text: string }[];
  costUsd: number;
  ms: number;
  error: string | null;
};

// Compara lo que hizo el vendedor con lo esperado. Devuelve la lista de fallas.
export function checkScenario(scenario: Scenario, observed: Observed): string[] {
  const e = scenario.expect;
  const failures: string[] = [];
  const fmt = (c: Record<string, number>) =>
    Object.keys(c).length ? Object.entries(c).map(([n, q]) => `${q}x ${n}`).join(", ") : "vacío";

  if (e.cart) {
    const expected = Object.entries(e.cart).sort();
    const actual = Object.entries(observed.cart).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      failures.push(`Carrito: esperaba ${fmt(e.cart)}, quedó ${fmt(observed.cart)}`);
    }
  }
  for (const [name, max] of Object.entries(e.cartMax ?? {})) {
    if ((observed.cart[name] ?? 0) > max) failures.push(`Carrito: ${observed.cart[name]}x ${name} supera el stock (${max})`);
  }
  if (e.shippingFlow !== undefined && e.shippingFlow !== observed.shippingFlow) {
    failures.push(e.shippingFlow ? "No pasó a pedir los datos de envío" : "Pidió los datos de envío antes de tiempo");
  }
  if (e.handoff !== undefined && e.handoff !== observed.handoff) {
    failures.push(e.handoff ? "No derivó a una persona" : "Derivó a una persona sin necesidad");
  }
  if (e.asks && !observed.lastAiReply?.includes("?")) failures.push("No hizo una pregunta para aclarar");
  const all = observed.replies.join("\n");
  for (const re of e.mentions ?? []) if (!re.test(all)) failures.push(`No mencionó ${re}`);
  for (const re of e.forbids ?? []) if (re.test(all)) failures.push(`Dijo algo que no debía: ${re}`);
  return failures;
}

// Tienda interna con el catálogo fijo de las pruebas. Se resincroniza en cada prueba.
export async function ensureEvalBusiness(model: string): Promise<Business> {
  let business = await db.business.findFirst({ where: { sandbox: true } });
  if (!business) {
    business = await db.business.create({ data: { name: "Tienda de prueba", sandbox: true } });
  }
  business = await db.business.update({
    where: { id: business.id },
    data: {
      name: "Tienda de prueba",
      botMode: "IA",
      botEnabled: true,
      botInstructions: "",
      aiModel: model,
      aiMonthlyLimitUsd: 0,
      shippingFlatRate: SHIPPING.flatRate,
      freeShippingFrom: SHIPPING.freeFrom,
    },
  });
  for (const p of CATALOG) {
    const existing = await db.product.findFirst({ where: { businessId: business.id, name: p.name } });
    if (existing) await db.product.update({ where: { id: existing.id }, data: { ...p, active: true } });
    else await db.product.create({ data: { ...p, businessId: business.id } });
  }
  await db.faqEntry.deleteMany({ where: { businessId: business.id } });
  await db.faqEntry.createMany({ data: FAQS.map((f, i) => ({ ...f, position: i, businessId: business!.id })) });
  return business;
}

export async function runScenario(scenarioId: string, model: string, createMessage?: CreateMessage): Promise<EvalResult> {
  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`Escenario desconocido: ${scenarioId}`);
  const business = await ensureEvalBusiness(model);
  const started = new Date();
  const waId = `eval-${scenario.id}-${started.getTime()}`;

  // Se registra el error real de la IA (si no, el respaldo del menú lo esconde).
  let error: string | null = null;
  const call = createMessage ?? defaultCreateMessage;
  const tracked: CreateMessage = async (params) => {
    try {
      return await call(params);
    } catch (err) {
      error ??= err instanceof Error ? err.message : String(err);
      throw err;
    }
  };

  let conversationId: string | null = null;
  try {
    for (const text of scenario.messages) {
      conversationId = await receiveCustomerMessage({
        businessId: business.id,
        waId,
        profileName: "Cliente de prueba",
        text,
        waMessageId: null,
        channel: "SIMULADOR",
      });
      if (conversationId) await processConversation(conversationId, tracked);
    }

    const conversation = await db.conversation.findUniqueOrThrow({
      where: { id: conversationId! },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    const cartOrder = await db.order.findFirst({
      where: { conversationId: conversation.id },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      omit: { labelPdf: true },
    });
    const outgoing = conversation.messages.filter((m) => m.direction === "SALIENTE" && !m.private);
    const aiReplies = conversation.messages.filter((m) => m.author === "BOT");
    const observed: Observed = {
      cart: Object.fromEntries((cartOrder?.items ?? []).map((i) => [i.name, i.quantity])),
      shippingFlow: inShippingFlow(conversation.botState as MenuState) || (cartOrder?.status ?? "BORRADOR") !== "BORRADOR",
      handoff: conversation.mode === "HUMANO",
      replies: outgoing.map((m) => m.text),
      lastAiReply: aiReplies.at(-1)?.text ?? null,
    };
    const failures = checkScenario(scenario, observed);
    if (error) failures.unshift(`La IA falló: ${error}`);

    const usage = await db.aiUsage.aggregate({
      where: { businessId: business.id, createdAt: { gte: started } },
      _sum: { costUsd: true },
    });
    return {
      id: scenario.id,
      title: scenario.title,
      passed: failures.length === 0,
      failures,
      transcript: conversation.messages.map((m) => ({ author: m.author, text: m.private ? "[dato privado]" : m.text })),
      costUsd: usage._sum.costUsd ?? 0,
      ms: Date.now() - started.getTime(),
      error,
    };
  } finally {
    const customer = await db.customer.findUnique({ where: { businessId_waId: { businessId: business.id, waId } } });
    if (customer) {
      await db.order.deleteMany({ where: { customerId: customer.id } });
      await db.customer.delete({ where: { id: customer.id } });
    }
  }
}
