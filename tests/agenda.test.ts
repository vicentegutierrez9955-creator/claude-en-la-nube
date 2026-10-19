import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it } from "vitest";
import { addDays, availableSlots, bookAppointment, localParts, localToUtc, todayYmd } from "@/lib/agenda";
import type { CreateMessage } from "@/lib/agent/run";
import { processConversation, receiveCustomerMessage } from "@/lib/conversations";
import { db } from "@/lib/db";
import { resetDb } from "./helpers/db";

type Block = Anthropic.Beta.BetaContentBlock;
const message = (content: Block[], stop: string) =>
  ({ id: "m", type: "message", role: "assistant", model: "test", content, stop_reason: stop }) as unknown as Anthropic.Beta.BetaMessage;
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input }) as unknown as Block;
const text = (t: string) => ({ type: "text", text: t }) as unknown as Block;
const lastToolResult = (p: Anthropic.Beta.MessageCreateParamsNonStreaming) =>
  String((p.messages[p.messages.length - 1].content as Anthropic.Beta.BetaToolResultBlockParam[])[0].content);

// Podología que atiende todos los días de 09:00 a 13:00 y de 15:00 a 19:00.
async function createClinic(botMode: "MENU" | "IA" = "MENU", allWeek = true) {
  return db.business.create({
    data: {
      name: "Podología Gustavo Parra",
      kind: "AGENDA",
      botMode,
      slug: "gustavo-parra",
      bookingStepMin: 30,
      bookingNoticeMin: 120,
      serviceAddress: "Av. Central 123, Estación Central",
      services: {
        create: [
          { name: "Podología general", durationMin: 45, price: 20000, position: 1 },
          { name: "Uña encarnada", durationMin: 60, price: 35000, position: 2 },
        ],
      },
      workingHours: {
        create: (allWeek ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5]).flatMap((weekday) => [
          { weekday, startMin: 9 * 60, endMin: 13 * 60 },
          { weekday, startMin: 15 * 60, endMin: 19 * 60 },
        ]),
      },
    },
    include: { services: { orderBy: { position: "asc" } } },
  });
}

describe("horas libres", () => {
  beforeEach(resetDb);

  it("ofrece horas cada 30 minutos que caben en el horario, en hora de Chile", async () => {
    const clinic = await createClinic("MENU", false);
    const now = new Date("2026-10-19T12:00:00Z"); // lunes 19 de octubre, 09:00 en Chile
    const [tuesday] = await availableSlots({ businessId: clinic.id, serviceId: clinic.services[0].id, fromYmd: "2026-10-20", days: 1, now });
    const times = tuesday.times.map((t) => localParts(t).minutes / 60);
    // 45 minutos: la última de la mañana es 12:00 (termina 12:45) y la de la tarde 18:00.
    expect(times).toEqual([9, 9.5, 10, 10.5, 11, 11.5, 12, 15, 15.5, 16, 16.5, 17, 17.5, 18]);
    expect(tuesday.times[0].toISOString()).toBe("2026-10-20T12:00:00.000Z");

    // Hoy: solo desde las 11:00 (2 horas de anticipación); el sábado no se atiende.
    const days = await availableSlots({ businessId: clinic.id, serviceId: clinic.services[0].id, fromYmd: "2026-10-19", days: 6, now });
    expect(localParts(days[0].times[0]).minutes).toBe(11 * 60);
    expect(days.find((d) => d.ymd === "2026-10-24")?.times).toEqual([]);
  });

  it("descuenta citas y bloqueos, y no deja reservar dos veces la misma hora", async () => {
    const clinic = await createClinic("MENU", false);
    const now = new Date("2026-10-19T12:00:00Z");
    const customer = await db.customer.create({ data: { businessId: clinic.id, waId: "56911112222" } });
    const at10 = localToUtc("2026-10-20", 10 * 60);
    await bookAppointment({ businessId: clinic.id, customerId: customer.id, serviceId: clinic.services[0].id, startsAt: at10, source: "WEB", now });
    await db.timeOff.create({ data: { businessId: clinic.id, startsAt: localToUtc("2026-10-20", 15 * 60), endsAt: localToUtc("2026-10-20", 19 * 60) } });

    const [day] = await availableSlots({ businessId: clinic.id, serviceId: clinic.services[0].id, fromYmd: "2026-10-20", days: 1, now });
    const times = day.times.map((t) => localParts(t).minutes / 60);
    expect(times).toEqual([9, 11, 11.5, 12]); // 9:30 y 10:30 chocan con la cita de 10:00-10:45; la tarde está bloqueada

    await expect(
      bookAppointment({ businessId: clinic.id, customerId: customer.id, serviceId: clinic.services[0].id, startsAt: at10, source: "WEB", now }),
    ).rejects.toThrow("ya no está disponible");

    // Dos reservas al mismo tiempo por la misma hora: solo una gana.
    const at11 = localToUtc("2026-10-20", 11 * 60);
    const results = await Promise.allSettled(
      [1, 2].map(() => bookAppointment({ businessId: clinic.id, customerId: customer.id, serviceId: clinic.services[0].id, startsAt: at11, source: "WEB", now })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const numbers = (await db.appointment.findMany({ where: { businessId: clinic.id }, orderBy: { number: "asc" } })).map((a) => a.number);
    expect(numbers).toEqual([1, 2]);
  });
});

async function chat(businessId: string, createMessage?: CreateMessage) {
  return async (t: string) => {
    const id = await receiveCustomerMessage({ businessId, waId: "56933334444", profileName: "Carmen", text: t, waMessageId: null, channel: "SIMULADOR" });
    await processConversation(id!, createMessage);
    const last = await db.message.findFirstOrThrow({ where: { conversationId: id! }, orderBy: { createdAt: "desc" } });
    return { conversationId: id!, reply: last.text, last };
  };
}

describe("menú de reservas (sin IA)", () => {
  beforeEach(resetDb);

  it("reserva eligiendo servicio, día y hora, y pide el nombre en privado", async () => {
    const clinic = await createClinic("MENU");
    const say = await chat(clinic.id);
    expect((await say("hola")).reply).toContain("Reservar una hora");
    expect((await say("1")).reply).toContain("Uña encarnada");
    expect((await say("2")).reply).toContain("¿qué día te acomoda?");
    expect((await say("1")).reply).toContain("Horas libres el");
    const askName = await say("1");
    expect(askName.reply).toContain("¿A nombre de quién");
    expect(askName.last.private).toBe(true);
    const done = await say("Carmen Rojas");
    expect(done.reply).toContain("¡Hora reservada!");
    expect(done.reply).toContain("Av. Central 123");
    expect(done.last.private).toBe(true);

    const appointment = await db.appointment.findFirstOrThrow({ where: { businessId: clinic.id } });
    expect(appointment).toMatchObject({ serviceName: "Uña encarnada", patientName: "Carmen Rojas", status: "RESERVADA", price: 35000, source: "WHATSAPP" });
    expect(appointment.endsAt.getTime() - appointment.startsAt.getTime()).toBe(60 * 60000);

    // La segunda vez ofrece el mismo nombre y permite cancelar desde "mis horas".
    await say("menu");
    expect((await say("2")).reply).toContain("Tus próximas horas");
    expect((await say("1")).reply).toContain("¿Seguro que quieres cancelar");
    expect((await say("1")).reply).toContain("cancelamos tu hora");
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe("CANCELADA");
  });

  it("'Confirmo' en respuesta al recordatorio confirma la hora", async () => {
    const clinic = await createClinic("MENU");
    const customer = await db.customer.create({ data: { businessId: clinic.id, waId: "56933334444" } });
    const tomorrow = addDays(todayYmd(), 1);
    const appointment = await bookAppointment({
      businessId: clinic.id,
      customerId: customer.id,
      serviceId: clinic.services[0].id,
      startsAt: localToUtc(tomorrow, 10 * 60),
      source: "WEB",
      patientName: "Carmen",
    });
    await db.appointment.update({ where: { id: appointment.id }, data: { reminderSentAt: new Date() } });
    const say = await chat(clinic.id);
    expect((await say("Confirmo")).reply).toContain("quedó *confirmada*");
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe("CONFIRMADA");
  });
});

describe("asistente IA de reservas", () => {
  beforeEach(resetDb);

  it("consulta horas reales, reserva y deja el nombre al sistema sin que la IA lo vea", async () => {
    const clinic = await createClinic("IA");
    const calls: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
    const tomorrow = addDays(todayYmd(), 1);
    let bookingResult = "";
    const ai: CreateMessage = async (params) => {
      calls.push(params);
      switch (calls.length) {
        case 1:
          return message([toolUse("t1", "ver_horas_libres", { servicio_id: clinic.services[0].id, desde: tomorrow, dias: 1 })], "tool_use");
        case 2: {
          const first = lastToolResult(params).split(": ")[1].split(", ")[0];
          return message([toolUse("t2", "reservar_hora", { servicio_id: clinic.services[0].id, fecha: tomorrow, hora: first })], "tool_use");
        }
        case 3:
          // El historial es el mismo arreglo que sigue creciendo: se lee el resultado ahora.
          bookingResult = lastToolResult(params);
          return message([text("¡Listo! Te dejé la hora tomada 🙌")], "end_turn");
        default:
          return message([text("¡De nada!")], "end_turn");
      }
    };
    const say = await chat(clinic.id, ai);
    const first = await say("hola, quiero hora para mañana temprano");
    expect(calls).toHaveLength(3);
    expect(calls[0].system).toContain("asistente de reservas");
    expect(calls[0].tools?.map((t) => (t as { name: string }).name)).toContain("reservar_hora");
    expect(calls[0].tools?.map((t) => (t as { name: string }).name)).not.toContain("buscar_productos");
    expect(bookingResult).toContain("reservada");
    expect(first.reply).toMatch(/¿Dejo la hora a nombre|¿A nombre de quién/);
    expect(first.last.private).toBe(true);

    // El nombre lo toma el sistema: la IA no se llama.
    const done = await say("Pedro Soto");
    expect(calls).toHaveLength(3);
    expect(done.reply).toContain("¡Hora reservada!");
    const appointment = await db.appointment.findFirstOrThrow({ where: { businessId: clinic.id } });
    expect(appointment.patientName).toBe("Pedro Soto");
    expect(localParts(appointment.startsAt).ymd).toBe(tomorrow);

    // Vuelve la IA, que solo sabe que se tomó el nombre (oculto).
    await say("gracias!");
    expect(calls).toHaveLength(4);
    expect(JSON.stringify(calls[3].messages)).not.toContain("Pedro Soto");
    expect(JSON.stringify(calls[3].messages)).toContain("oculto por privacidad");
  });
});

describe("recordatorio del día anterior", () => {
  beforeEach(resetDb);

  it("envía la plantilla con nombre, negocio, día y hora solo a las horas de mañana", async () => {
    const clinic = await createClinic("MENU");
    await db.business.update({
      where: { id: clinic.id },
      data: { whatsappPhoneNumberId: "123", whatsappAccessToken: (await import("@/lib/crypto")).encryptSecret("token") },
    });
    const customer = await db.customer.create({ data: { businessId: clinic.id, waId: "56955556666", name: "Perfil" } });
    const tomorrow = addDays(todayYmd(), 1);
    const book = (ymd: string, h: number, patientName: string) =>
      bookAppointment({
        businessId: clinic.id,
        customerId: customer.id,
        serviceId: clinic.services[0].id,
        startsAt: localToUtc(ymd, h * 60),
        source: "WEB",
        patientName,
      });
    const a = await book(tomorrow, 10, "Carmen Rojas");
    await book(addDays(tomorrow, 1), 10, "Otra");

    const { sendDueReminders } = await import("@/lib/agenda-reminders");
    const sent: { template: string; to: string; bodyParams: string[] }[] = [];
    const result = await sendDueReminders({ send: async (o) => (sent.push(o), "wamid.R1") });
    expect(result).toEqual({ sent: 1, failed: 0, total: 1 });
    expect(sent[0]).toMatchObject({ template: "recordatorio_hora", to: "56955556666" });
    expect(sent[0].bodyParams[0]).toBe("Carmen");
    expect(sent[0].bodyParams[1]).toBe("Podología Gustavo Parra");
    expect(sent[0].bodyParams[3]).toBe("10:00");
    expect((await db.appointment.findUniqueOrThrow({ where: { id: a.id } })).reminderSentAt).not.toBeNull();

    // No se repite.
    expect((await sendDueReminders({ send: async () => "x" })).total).toBe(0);
  });
});

describe("página pública de reservas", () => {
  beforeEach(resetDb);

  it("muestra horas libres y reserva con nombre y celular", async () => {
    const clinic = await createClinic("MENU");
    const { GET, POST } = await import("@/app/api/reservas/[slug]/route");
    const { NextRequest } = await import("next/server");
    const params = Promise.resolve({ slug: "gustavo-parra" });
    const res = await GET(new NextRequest(`https://pedidos.test/api/reservas/gustavo-parra?servicio=${clinic.services[0].id}`), { params });
    const { days } = (await res.json()) as { days: { ymd: string; label: string; times: { iso: string; label: string }[] }[] };
    expect(days.length).toBeGreaterThan(0);
    const slot = days[0].times[0];

    const post = (body: object, origin = "https://pedidos.test") =>
      POST(
        new NextRequest("https://pedidos.test/api/reservas/gustavo-parra", {
          method: "POST",
          headers: { "content-type": "application/json", origin },
          body: JSON.stringify(body),
        }),
        { params },
      );
    expect((await post({}, "https://otro.com")).status).toBe(403);
    expect((await post({ servicio: clinic.services[0].id, hora: slot.iso, nombre: "Ana Pérez", telefono: "1234" })).status).toBe(400);
    const ok = await post({ servicio: clinic.services[0].id, hora: slot.iso, nombre: "Ana Pérez", telefono: "9 8765 4321" });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, number: 1, service: "Podología general" });
    // La misma hora ya no se puede tomar.
    expect((await post({ servicio: clinic.services[0].id, hora: slot.iso, nombre: "Luis Soto", telefono: "9 1111 2222" })).status).toBe(409);
    const appointment = await db.appointment.findFirstOrThrow({ include: { customer: true } });
    expect(appointment).toMatchObject({ patientName: "Ana Pérez", source: "WEB" });
    expect(appointment.customer.waId).toBe("56987654321");
  });
});
