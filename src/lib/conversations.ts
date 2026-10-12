import type Anthropic from "@anthropic-ai/sdk";
import { Prisma, type Channel } from "@prisma/client";
import { runAgentTurn, type CreateMessage } from "./agent/run";
import { aiBudgetExceeded, modelFor, recordAiUsage } from "./ai-usage";
import { db } from "./db";
import { inShippingFlow, isMenuCommand, runMenuBot, saveMenuState, type MenuState } from "./menu-bot";
import { sendToCustomer } from "./messaging";
import { redactPersonalData } from "./privacy";

const LOCK_MS = 3 * 60 * 1000;
// Pasado este tiempo sin mensajes, el vendedor empieza una conversación nueva
// (los pedidos anteriores siguen disponibles con la herramienta consultar_pedidos).
const HISTORY_RESET_MS = 24 * 60 * 60 * 1000;

export async function receiveCustomerMessage(input: {
  businessId: string;
  waId: string;
  profileName: string | null;
  text: string;
  waMessageId: string | null;
  channel: Channel;
}): Promise<string | null> {
  const customer = await db.customer.upsert({
    where: { businessId_waId: { businessId: input.businessId, waId: input.waId } },
    create: { businessId: input.businessId, waId: input.waId, name: input.profileName },
    update: input.profileName ? { name: input.profileName } : {},
  });
  const conversation = await db.conversation.upsert({
    where: { customerId_channel: { customerId: customer.id, channel: input.channel } },
    create: { businessId: input.businessId, customerId: customer.id, channel: input.channel },
    update: {},
  });
  try {
    await db.message.create({
      data: {
        conversationId: conversation.id,
        direction: "ENTRANTE",
        author: "CLIENTE",
        text: input.text,
        waMessageId: input.waMessageId,
      },
    });
  } catch (err) {
    // Meta reintenta los webhooks: si el mensaje ya existe, se ignora.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return null;
    throw err;
  }
  await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
  return conversation.id;
}

// Cuando una persona de la tienda responde (desde su celular o el panel), el bot se hace a un
// lado en ese chat por unas horas y después retoma solo.
export const OWNER_PAUSE_HOURS = Number(process.env.OWNER_PAUSE_HOURS ?? 12);

export async function pauseBotForOwner(conversationId: string) {
  const conversation = await db.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  // Si alguien tomó el control sin plazo ("Tomar el control" o derivación), se respeta.
  if (conversation.mode === "HUMANO" && !conversation.humanUntil) return;
  await db.conversation.update({
    where: { id: conversationId },
    data: { mode: "HUMANO", needsHuman: false, humanUntil: new Date(Date.now() + OWNER_PAUSE_HOURS * 3600 * 1000) },
  });
}

// Registra un mensaje que el dueño envió desde la app WhatsApp Business (coexistencia).
export async function recordOwnerEcho(input: { businessId: string; waId: string; text: string; waMessageId: string }) {
  const customer = await db.customer.upsert({
    where: { businessId_waId: { businessId: input.businessId, waId: input.waId } },
    create: { businessId: input.businessId, waId: input.waId },
    update: {},
  });
  const conversation = await db.conversation.upsert({
    where: { customerId_channel: { customerId: customer.id, channel: "WHATSAPP" } },
    create: { businessId: input.businessId, customerId: customer.id, channel: "WHATSAPP" },
    update: {},
  });
  try {
    await db.message.create({
      data: {
        conversationId: conversation.id,
        direction: "SALIENTE",
        author: "HUMANO",
        text: input.text,
        waMessageId: input.waMessageId,
        processed: true,
      },
    });
  } catch (err) {
    // Eco repetido, o de un mensaje que envió el propio sistema.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    throw err;
  }
  await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
  await pauseBotForOwner(conversation.id);
}

async function acquireLock(conversationId: string): Promise<boolean> {
  const now = new Date();
  const res = await db.conversation.updateMany({
    where: { id: conversationId, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
  });
  return res.count === 1;
}

type LoadedConversation = Prisma.ConversationGetPayload<{ include: { business: true; customer: true } }>;
type PendingMessage = { id: string; text: string; createdAt: Date };

const AUTHOR_CONTEXT: Record<string, string> = {
  CLIENTE: "Cliente",
  MENU: "Menú automático",
  HUMANO: "Equipo de la tienda",
  SISTEMA: "Aviso automático del sistema",
};

// Atiende los mensajes pendientes de una conversación. Si otro proceso ya la está
// atendiendo, ese proceso tomará también los mensajes nuevos.
export async function processConversation(conversationId: string, createMessage?: CreateMessage): Promise<void> {
  if (!(await acquireLock(conversationId))) return;
  try {
    for (let round = 0; round < 5; round++) {
      const pending = await db.message.findMany({
        where: { conversationId, direction: "ENTRANTE", processed: false },
        orderBy: { createdAt: "asc" },
      });
      if (pending.length === 0) return;

      let conversation = await loadConversation(conversationId);
      if (await skipIfHuman(conversation, pending)) return;

      // Si la tienda pasó su tope mensual de IA, atiende solo el menú (sin costo).
      const configured = conversation.business.botMode;
      const mode = configured !== "MENU" && (await aiBudgetExceeded(conversation.business)) ? "MENU" : configured;

      // El sistema atiende mensaje por mensaje mientras corresponda (menú, o toma privada de
      // datos de envío); el resto de los mensajes se los pasa a la IA de una vez.
      let aiFrom = -1;
      for (const [i, msg] of pending.entries()) {
        conversation = await loadConversation(conversationId);
        if (await skipIfHuman(conversation, pending.slice(i))) return;
        const state = conversation.botState as MenuState;
        const shippingFlow = inShippingFlow(state);
        const hybridAiActive =
          mode === "HIBRIDO" &&
          state.engine === "ia" &&
          !!state.updatedAt &&
          Date.now() - new Date(state.updatedAt).getTime() < HISTORY_RESET_MS &&
          !isMenuCommand(msg.text);
        if (!shippingFlow && (mode === "IA" || hybridAiActive)) {
          aiFrom = i;
          break;
        }
        let res: Awaited<ReturnType<typeof runMenuBot>>;
        try {
          res = await runMenuBot({
            business: conversation.business,
            customer: conversation.customer,
            conversationId,
            state,
            text: msg.text,
            allowAi: mode === "HIBRIDO" && !shippingFlow,
          });
        } catch (err) {
          console.error(`[menu] conversación ${conversationId}`, err);
          await db.message.update({ where: { id: msg.id }, data: { processed: true } });
          await db.conversation.update({
            where: { id: conversationId },
            data: { needsHuman: true, handoffReason: "Error del menú automático" },
          });
          continue;
        }
        if (res.result === "use_ai") {
          aiFrom = i;
          break;
        }
        await db.message.update({ where: { id: msg.id }, data: { processed: true, private: res.private } });
      }
      if (aiFrom >= 0) {
        conversation = await loadConversation(conversationId);
        await runAi(conversation, pending.slice(aiFrom), createMessage);
        if (mode === "HIBRIDO") {
          const fresh = (await loadConversation(conversationId)).botState as MenuState;
          if (!inShippingFlow(fresh)) await saveMenuState(conversationId, { ...fresh, engine: "ia" });
        }
      }
    }
  } finally {
    await db.conversation.update({ where: { id: conversationId }, data: { lockedUntil: null } });
  }
}

function loadConversation(conversationId: string): Promise<LoadedConversation> {
  return db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { business: true, customer: true } });
}

// Si atiende una persona (o el bot está apagado), los mensajes quedan para el equipo.
// Cuando la pausa tiene plazo (el dueño respondió desde su celular) y venció, el bot retoma solo.
async function skipIfHuman(conversation: LoadedConversation, pending: PendingMessage[]): Promise<boolean> {
  if (conversation.mode === "HUMANO" && conversation.humanUntil && conversation.humanUntil < new Date()) {
    await db.conversation.update({ where: { id: conversation.id }, data: { mode: "BOT", humanUntil: null } });
    if (conversation.business.botEnabled) return false;
  }
  if (conversation.mode !== "HUMANO" && conversation.business.botEnabled) return false;
  await db.message.updateMany({ where: { id: { in: pending.map((m) => m.id) } }, data: { processed: true } });
  await db.conversation.update({ where: { id: conversation.id }, data: { needsHuman: true } });
  return true;
}

// Contexto para la IA con lo que pasó en el chat sin ella. Los mensajes privados
// (datos de envío) se reemplazan por un aviso y el resto pasa por el filtro de datos personales.
function outsideContext(messages: { author: string; text: string; private: boolean }[]): string[] {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.private) {
      const note = "[El cliente le dio sus datos de envío al sistema: ocultos por privacidad]";
      if (lines[lines.length - 1] !== note) lines.push(note);
    } else {
      lines.push(`${AUTHOR_CONTEXT[m.author] ?? m.author}: ${redactPersonalData(m.text)}`);
    }
  }
  return lines;
}

async function runAi(conversation: LoadedConversation, pending: PendingMessage[], createMessage?: CreateMessage) {
  const conversationId = conversation.id;
  const ids = pending.map((m) => m.id);
  const now = new Date();
  const lastRun = conversation.lastAgentRunAt;
  const stale = !lastRun || now.getTime() - lastRun.getTime() > HISTORY_RESET_MS;
  const history = stale ? [] : (conversation.agentHistory as unknown as Anthropic.Beta.BetaMessageParam[]);

  // Lo que pasó en el chat sin la IA desde su última respuesta (sistema, equipo, avisos).
  const since = lastRun && !stale ? lastRun : new Date(now.getTime() - HISTORY_RESET_MS);
  const outside = await db.message.findMany({
    where: { conversationId, author: { not: "BOT" }, id: { notIn: ids }, createdAt: { gt: since, lt: pending[0].createdAt } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  // La IA nunca recibe el nombre ni el teléfono del cliente.
  const parts = [`[${now.toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "full", timeStyle: "short" })}]`];
  if (outside.length > 0) {
    parts.push("[Mensajes anteriores en este chat, ya respondidos sin ti:]", ...outsideContext(outside.reverse()));
    parts.push("[Mensaje nuevo del cliente:]");
  }
  parts.push(...pending.map((m) => redactPersonalData(m.text)));

  const ctx = { businessId: conversation.businessId, conversationId, afterReply: [] as { text: string; private: boolean }[] };
  try {
    const faqs = await db.faqEntry.findMany({ where: { businessId: conversation.businessId }, orderBy: { position: "asc" } });
    const result = await runAgentTurn({
      business: conversation.business,
      model: modelFor(conversation.business),
      onResponse: (response) => recordAiUsage(conversation.businessId, conversationId, response),
      faqs,
      history,
      userText: parts.join("\n"),
      ctx,
      createMessage,
    });
    await db.message.updateMany({ where: { id: { in: ids } }, data: { processed: true } });
    await db.conversation.update({
      where: { id: conversationId },
      data: {
        agentHistory: result.history as unknown as Prisma.InputJsonValue,
        lastAgentRunAt: new Date(),
        ...(result.refused ? { mode: "HUMANO", needsHuman: true, handoffReason: "El asistente no pudo responder" } : {}),
      },
    });
    if (result.refused) {
      await sendToCustomer(conversationId, "Te comunico con una persona del equipo, te responderá en breve 🙌", "BOT");
      return;
    }
    if (result.reply) await sendToCustomer(conversationId, result.reply, "BOT");
    for (const m of ctx.afterReply) await sendToCustomer(conversationId, m.text, "MENU", { private: m.private });
  } catch (err) {
    console.error(`[agente] conversación ${conversationId}`, err);
    await db.message.updateMany({ where: { id: { in: ids } }, data: { processed: true } });
    await db.conversation.update({
      where: { id: conversationId },
      data: { needsHuman: true, handoffReason: "La IA no respondió: el cliente recibió el menú automático" },
    });
    // Respaldo: si la IA falla (caída del proveedor, clave inválida), el cliente recibe el menú.
    try {
      await runMenuBot({
        business: conversation.business,
        customer: conversation.customer,
        conversationId,
        state: {},
        text: pending[pending.length - 1].text,
        allowAi: false,
      });
    } catch (menuErr) {
      console.error(`[menu] respaldo falló en ${conversationId}`, menuErr);
    }
  }
}
