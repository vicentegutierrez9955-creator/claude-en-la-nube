import { addDays, dayLabel, hhmm, localParts, localToUtc, todayYmd } from "./agenda";
import { decryptSecret } from "./crypto";
import { db } from "./db";
import { sendWhatsAppTemplate } from "./whatsapp";

export type ReminderSender = typeof sendWhatsAppTemplate;

// Envía el recordatorio de las horas de mañana. Se usa una plantilla aprobada en Meta
// (por defecto "recordatorio_hora") con 4 variables: nombre, negocio, día y hora,
// y botones de respuesta rápida "Confirmo" / "Cancelo".
export async function sendDueReminders(opts: { now?: Date; send?: ReminderSender } = {}) {
  const now = opts.now ?? new Date();
  const send = opts.send ?? sendWhatsAppTemplate;
  const tomorrow = addDays(todayYmd(now), 1);
  const appointments = await db.appointment.findMany({
    where: {
      status: { in: ["RESERVADA", "CONFIRMADA"] },
      reminderSentAt: null,
      reminderError: null,
      startsAt: { gte: localToUtc(tomorrow, 0), lt: localToUtc(addDays(tomorrow, 1), 0) },
      business: { kind: "AGENDA" },
    },
    include: { business: true, customer: true },
    orderBy: { startsAt: "asc" },
  });

  let sent = 0;
  let failed = 0;
  for (const a of appointments) {
    const b = a.business;
    const accessToken = decryptSecret(b.whatsappAccessToken);
    if (!accessToken || !b.whatsappPhoneNumberId) {
      await db.appointment.update({ where: { id: a.id }, data: { reminderError: "WhatsApp no está conectado" } });
      failed++;
      continue;
    }
    const firstName = (a.patientName ?? a.customer.name ?? "").split(" ")[0] || "hola";
    const params = [firstName, b.name, dayLabel(localParts(a.startsAt).ymd), hhmm(localParts(a.startsAt).minutes)];
    try {
      const waMessageId = await send({
        phoneNumberId: b.whatsappPhoneNumberId,
        accessToken,
        to: a.customer.waId,
        template: b.reminderTemplate,
        bodyParams: params,
      });
      await db.appointment.update({ where: { id: a.id }, data: { reminderSentAt: new Date() } });
      // Queda en la conversación para que el equipo (y la IA) sepan que se envió.
      const conversation = await db.conversation.upsert({
        where: { customerId_channel: { customerId: a.customerId, channel: "WHATSAPP" } },
        create: { businessId: b.id, customerId: a.customerId, channel: "WHATSAPP" },
        update: { lastMessageAt: new Date() },
      });
      await db.message.create({
        data: {
          conversationId: conversation.id,
          direction: "SALIENTE",
          author: "SISTEMA",
          text: `Recordatorio: hora de ${a.serviceName} mañana ${params[2]} a las ${params[3]}. [Confirmo] [Cancelo]`,
          waMessageId,
          processed: true,
        },
      });
      sent++;
    } catch (err) {
      console.error(`[recordatorios] cita ${a.id}`, err);
      await db.appointment.update({
        where: { id: a.id },
        data: { reminderError: String(err instanceof Error ? err.message : err).slice(0, 300) },
      });
      failed++;
    }
  }
  return { sent, failed, total: appointments.length };
}
