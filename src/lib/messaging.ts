import type { MessageAuthor } from "@prisma/client";
import { decryptSecret } from "./crypto";
import { db } from "./db";
import { sendWhatsAppText } from "./whatsapp";

// Envía un mensaje al cliente por el canal de la conversación y lo deja registrado.
// En el simulador no se llama a WhatsApp: el mensaje solo queda en la base de datos.
export async function sendToCustomer(conversationId: string, text: string, author: MessageAuthor): Promise<boolean> {
  const conversation = await db.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { business: true, customer: true },
  });

  let waMessageId: string | null = null;
  let delivered = true;
  if (conversation.channel === "WHATSAPP") {
    const accessToken = decryptSecret(conversation.business.whatsappAccessToken);
    const phoneNumberId = conversation.business.whatsappPhoneNumberId;
    if (!accessToken || !phoneNumberId) {
      console.error(`[whatsapp] negocio ${conversation.businessId} sin credenciales de WhatsApp`);
      delivered = false;
    } else {
      try {
        waMessageId = await sendWhatsAppText({ phoneNumberId, accessToken, to: conversation.customer.waId, text });
      } catch (err) {
        console.error("[whatsapp] error enviando mensaje", err);
        delivered = false;
      }
    }
  }

  await db.message.create({
    data: {
      conversationId,
      direction: "SALIENTE",
      author,
      text: delivered ? text : `⚠️ No se pudo entregar por WhatsApp:\n${text}`,
      waMessageId,
      processed: true,
    },
  });
  await db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
  return delivered;
}
