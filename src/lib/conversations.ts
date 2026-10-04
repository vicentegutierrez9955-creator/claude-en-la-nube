import type Anthropic from "@anthropic-ai/sdk";
import { Prisma, type Channel } from "@prisma/client";
import { runAgentTurn, type CreateMessage } from "./agent/run";
import { db } from "./db";
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
      const ids = pending.map((m) => m.id);

      const conversation = await db.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        include: { business: true, customer: true },
      });
      if (conversation.mode === "HUMANO" || !conversation.business.botEnabled) {
        await db.message.updateMany({ where: { id: { in: ids } }, data: { processed: true } });
        await db.conversation.update({ where: { id: conversationId }, data: { needsHuman: true } });
        return;
      }

      const now = new Date();
      const lastRun = conversation.lastAgentRunAt;
      const stale = !lastRun || now.getTime() - lastRun.getTime() > HISTORY_RESET_MS;
      const history = stale ? [] : (conversation.agentHistory as unknown as Anthropic.Beta.BetaMessageParam[]);

      // Mensajes que el equipo o el sistema enviaron desde la última respuesta del vendedor.
      const outsideMessages = lastRun
        ? await db.message.findMany({
            where: { conversationId, direction: "SALIENTE", author: { in: ["HUMANO", "SISTEMA"] }, createdAt: { gt: lastRun } },
            orderBy: { createdAt: "asc" },
          })
        : [];

      const parts = [
        `[${now.toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "full", timeStyle: "short" })}]`,
      ];
      if (stale) {
        parts.push(`[Cliente: ${conversation.customer.name ?? "sin nombre"}, WhatsApp +${conversation.customer.waId}]`);
      }
      for (const m of outsideMessages) {
        parts.push(`[Mensaje enviado al cliente por ${m.author === "HUMANO" ? "el equipo" : "el sistema"}]: ${m.text}`);
      }
      parts.push(...pending.map((m) => m.text));

      try {
        const result = await runAgentTurn({
          business: conversation.business,
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
        return;
      }
    }
  } finally {
    await db.conversation.update({ where: { id: conversationId }, data: { lockedUntil: null } });
  }
}
