import type Anthropic from "@anthropic-ai/sdk";
import { Prisma, type Channel } from "@prisma/client";
import { runAgentTurn, type CreateMessage } from "./agent/run";
import { aiBudgetExceeded, modelFor, recordAiUsage } from "./ai-usage";
import { db } from "./db";
import { isMenuCommand, runMenuBot, saveMenuState, type MenuState } from "./menu-bot";
import { sendToCustomer } from "./messaging";

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
      if (mode === "IA") {
        await runAi(conversation, pending, createMessage);
        continue;
      }

      // MENU o HIBRIDO: el menú atiende mensaje por mensaje; en híbrido puede pasarle el resto a la IA.
      let aiFrom = -1;
      for (const [i, msg] of pending.entries()) {
        conversation = await loadConversation(conversationId);
        if (await skipIfHuman(conversation, pending.slice(i))) return;
        const state = conversation.botState as MenuState;
        const aiActive =
          mode === "HIBRIDO" &&
          state.engine === "ia" &&
          !!state.updatedAt &&
          Date.now() - new Date(state.updatedAt).getTime() < HISTORY_RESET_MS;
        if (aiActive && !isMenuCommand(msg.text)) {
          aiFrom = i;
          break;
        }
        let result: Awaited<ReturnType<typeof runMenuBot>>;
        try {
          result = await runMenuBot({
            business: conversation.business,
            customer: conversation.customer,
            conversationId,
            state,
            text: msg.text,
            allowAi: mode === "HIBRIDO",
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
        if (result === "use_ai") {
          aiFrom = i;
          break;
        }
        await db.message.update({ where: { id: msg.id }, data: { processed: true } });
      }
      if (aiFrom >= 0) {
        conversation = await loadConversation(conversationId);
        await runAi(conversation, pending.slice(aiFrom), createMessage);
        await saveMenuState(conversationId, { ...(conversation.botState as MenuState), engine: "ia" });
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
async function skipIfHuman(conversation: LoadedConversation, pending: PendingMessage[]): Promise<boolean> {
  if (conversation.mode !== "HUMANO" && conversation.business.botEnabled) return false;
  await db.message.updateMany({ where: { id: { in: pending.map((m) => m.id) } }, data: { processed: true } });
  await db.conversation.update({ where: { id: conversation.id }, data: { needsHuman: true } });
  return true;
}

async function runAi(conversation: LoadedConversation, pending: PendingMessage[], createMessage?: CreateMessage) {
  const conversationId = conversation.id;
  const ids = pending.map((m) => m.id);
  const now = new Date();
  const lastRun = conversation.lastAgentRunAt;
  const stale = !lastRun || now.getTime() - lastRun.getTime() > HISTORY_RESET_MS;
  const history = stale ? [] : (conversation.agentHistory as unknown as Anthropic.Beta.BetaMessageParam[]);

  // Lo que pasó en el chat sin la IA desde su última respuesta (menú, equipo, avisos).
  const since = lastRun && !stale ? lastRun : new Date(now.getTime() - HISTORY_RESET_MS);
  const outside = await db.message.findMany({
    where: { conversationId, author: { not: "BOT" }, id: { notIn: ids }, createdAt: { gt: since, lt: pending[0].createdAt } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const parts = [`[${now.toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "full", timeStyle: "short" })}]`];
  if (stale) {
    parts.push(`[Cliente: ${conversation.customer.name ?? "sin nombre"}, WhatsApp +${conversation.customer.waId}]`);
  }
  if (outside.length > 0) {
    parts.push("[Mensajes anteriores en este chat, ya respondidos sin ti:]");
    for (const m of outside.reverse()) parts.push(`${AUTHOR_CONTEXT[m.author] ?? m.author}: ${m.text}`);
    parts.push("[Mensaje nuevo del cliente:]");
  }
  parts.push(...pending.map((m) => m.text));

  try {
    const faqs = await db.faqEntry.findMany({ where: { businessId: conversation.businessId }, orderBy: { position: "asc" } });
    const result = await runAgentTurn({
      business: conversation.business,
      model: modelFor(conversation.business),
      onResponse: (response) => recordAiUsage(conversation.businessId, conversationId, response),
      faqs,
      history,
      userText: parts.join("\n"),
      ctx: { businessId: conversation.businessId, conversationId, customerWaId: conversation.customer.waId },
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
    } else if (result.reply) {
      await sendToCustomer(conversationId, result.reply, "BOT");
    }
  } catch (err) {
    console.error(`[agente] conversación ${conversationId}`, err);
    await db.message.updateMany({ where: { id: { in: ids } }, data: { processed: true } });
    await db.conversation.update({
      where: { id: conversationId },
      data: { needsHuman: true, handoffReason: "Error del asistente automático" },
    });
  }
}
