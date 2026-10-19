import type { Business, Customer, FaqEntry } from "@prisma/client";
import {
  AgendaError,
  availableSlots,
  bookAppointment,
  cancelAppointment,
  confirmationText,
  dayLabel,
  formatAppointmentTime,
  hhmm,
  lastPatientName,
  localParts,
  upcomingAppointments,
} from "./agenda";
import { normalize } from "./catalog";
import { db } from "./db";
import { formatCLP } from "./format";
import { sendToCustomer } from "./messaging";
import {
  APPOINTMENT_FLOW_STEPS,
  containsPhrase,
  GREETINGS,
  HUMAN_WORDS,
  isGreetingOnly,
  matchFaq,
  MENU_WORDS,
  NO,
  parseNumber,
  saveMenuState,
  STATE_TTL_MS,
  YES,
  type AgendaStep,
  type MenuResult,
  type MenuState,
} from "./menu-bot";

// Menú automático de los negocios con agenda: reservar, ver o cancelar horas sin IA
// (costo cero por mensaje). También toma, de forma privada, el nombre de quien reserva
// cuando la IA deja la hora tomada.

type Ctx = {
  business: Business;
  customer: Customer;
  conversationId: string;
  state: MenuState;
  faqs: FaqEntry[];
  allowAi: boolean;
};

type Reply = { text: string; state: MenuState } | { useAi: true };

const DAYS_SHOWN = 7;
const TIMES_SHOWN = 12;

function menuOptions(faqs: FaqEntry[]): [string, string][] {
  const options: [string, string][] = [
    ["reservar", "📅 Reservar una hora"],
    ["mis-horas", "🗓️ Ver o cancelar mis horas"],
  ];
  if (faqs.length > 0) options.push(["faq", "❓ Preguntas frecuentes"]);
  options.push(["persona", "🙋 Hablar con una persona"]);
  return options;
}

function welcome(ctx: Ctx): string {
  return ctx.business.welcomeMessage.trim() || `¡Hola! 👋 Bienvenido/a a *${ctx.business.name}*.`;
}

function menuText(ctx: Ctx, intro?: string): Reply {
  const options = menuOptions(ctx.faqs);
  return {
    text: `${intro ? `${intro}\n\n` : ""}Responde con el número de lo que necesitas:\n${options
      .map(([, label], i) => `*${i + 1}.* ${label}`)
      .join("\n")}\n\n_Escribe *menú* cuando quieras volver aquí._`,
    state: { step: "A_MENU", options: options.map(([k]) => k), engine: "menu" },
  };
}

async function servicesText(ctx: Ctx, intro = "¿Qué servicio necesitas?"): Promise<Reply> {
  const services = await db.service.findMany({
    where: { businessId: ctx.business.id, active: true },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  if (services.length === 0) return menuText(ctx, "Por ahora no hay horas disponibles para reservar por aquí 😕");
  if (services.length === 1) return daysText(ctx, services[0].id);
  const lines = services.map(
    (s, i) => `*${i + 1}.* ${s.name} · ${s.durationMin} min${s.price > 0 ? ` · ${formatCLP(s.price)}` : ""}`,
  );
  return {
    text: `${intro}\n${lines.join("\n")}\n\nResponde con el número.`,
    state: { step: "A_SERVICIO", options: services.map((s) => s.id) },
  };
}

async function daysText(ctx: Ctx, serviceId: string, intro?: string): Promise<Reply> {
  const days = (await availableSlots({ businessId: ctx.business.id, serviceId, days: 21 })).filter((d) => d.times.length > 0);
  const shown = days.slice(0, DAYS_SHOWN);
  if (shown.length === 0) {
    return menuText(ctx, "No quedan horas libres en las próximas semanas 😕 Escribe *persona* y te ayudamos.");
  }
  const service = await db.service.findUniqueOrThrow({ where: { id: serviceId } });
  const lines = shown.map((d, i) => `*${i + 1}.* ${capitalize(dayLabel(d.ymd))} (${d.times.length} ${d.times.length === 1 ? "hora" : "horas"})`);
  return {
    text: `${intro ? `${intro}\n\n` : ""}📅 *${service.name}*: ¿qué día te acomoda?\n${lines.join("\n")}\n\nResponde con el número del día.`,
    state: { step: "A_DIA", serviceId, options: shown.map((d) => d.ymd) },
  };
}

async function timesText(ctx: Ctx, serviceId: string, ymd: string, intro?: string): Promise<Reply> {
  const [day] = await availableSlots({ businessId: ctx.business.id, serviceId, fromYmd: ymd, days: 1 });
  const times = (day?.ymd === ymd ? day.times : []).slice(0, TIMES_SHOWN);
  if (times.length === 0) return daysText(ctx, serviceId, "Ese día ya no tiene horas libres.");
  const lines = times.map((t, i) => `*${i + 1}.* ${hhmm(localParts(t).minutes)}`);
  return {
    text: `${intro ? `${intro}\n\n` : ""}🕒 Horas libres el *${dayLabel(ymd)}*:\n${lines.join("\n")}\n\nResponde con el número de la hora (o *0* para elegir otro día).`,
    state: { step: "A_HORA", serviceId, ymd, options: times.map((t) => t.toISOString()) },
  };
}

// Primera pregunta del nombre: ofrece el último nombre usado, si hay.
async function askName(ctx: { customer: Customer }, appointmentId: string, flow?: "cita"): Promise<{ text: string; state: MenuState }> {
  const previous = await lastPatientName(ctx.customer.id);
  if (previous) {
    return {
      text: `¿Dejo la hora a nombre de *${previous}*?\n*1.* Sí\n*2.* No, a otro nombre`,
      state: { step: "A_REUSAR_NOMBRE", appointmentId, flow },
    };
  }
  return { text: "¿A nombre de quién dejo la hora? (nombre y apellido)", state: { step: "A_NOMBRE", appointmentId, flow } };
}

async function finishName(ctx: Ctx, appointmentId: string, name: string): Promise<Reply> {
  const appointment = await db.appointment.update({
    where: { id: appointmentId },
    data: { patientName: name.trim().slice(0, 80) },
  });
  const text = confirmationText(appointment, ctx.business);
  if (ctx.state.flow === "cita") return { text, state: { engine: "ia" } };
  return { text: `${text}\n\n_Escribe *menú* si necesitas algo más._`, state: { step: "A_MENU", options: menuOptions(ctx.faqs).map(([k]) => k) } };
}

async function myAppointmentsText(ctx: Ctx, intro?: string): Promise<Reply> {
  const list = await upcomingAppointments(ctx.customer.id);
  if (list.length === 0) return menuText(ctx, `${intro ? `${intro}\n\n` : ""}No tienes horas reservadas.`);
  const lines = list.map((a, i) => `*${i + 1}.* ${a.serviceName} · ${formatAppointmentTime(a.startsAt)}`);
  return {
    text: `${intro ? `${intro}\n\n` : ""}🗓️ *Tus próximas horas:*\n${lines.join("\n")}\n\nSi quieres cancelar una, responde con su número. Escribe *menú* para volver.`,
    state: { step: "A_MIS_HORAS", options: list.map((a) => a.id) },
  };
}

async function handOff(ctx: Ctx, reason: string): Promise<Reply> {
  await db.conversation.update({
    where: { id: ctx.conversationId },
    data: { mode: "HUMANO", needsHuman: true, humanUntil: null, handoffReason: reason },
  });
  return { text: "¡Listo! Una persona del equipo te va a responder por aquí en breve 🙌", state: { step: "A_MENU" } };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

async function notUnderstood(ctx: Ctx, again: () => Promise<Reply> | Reply): Promise<Reply> {
  if (ctx.allowAi && ctx.state.flow !== "cita") return { useAi: true };
  const misses = (ctx.state.misses ?? 0) + 1;
  const base = await again();
  if ("useAi" in base) return base;
  const hint = misses >= 2 ? "\n\nSi prefieres, escribe *persona* y te atiende alguien del equipo." : "";
  return { text: `No te entendí 🙈 ${base.text}${hint}`, state: { ...base.state, misses } };
}

async function step(ctx: Ctx, text: string): Promise<Reply> {
  const n = normalize(text);
  const num = parseNumber(text);
  const current = ctx.state.step as AgendaStep | undefined;
  const inNameFlow = !!current && APPOINTMENT_FLOW_STEPS.includes(current);

  if (!inNameFlow) {
    if (MENU_WORDS.includes(n)) return menuText(ctx);
    if (HUMAN_WORDS.some((w) => containsPhrase(n, w))) return handOff(ctx, "El cliente pidió hablar con una persona");
  }

  if (!current) {
    if (num === null) {
      const faq = matchFaq(text, ctx.faqs);
      if (faq) return menuText(ctx, `${welcome(ctx)}\n\n${faq.answer}`);
      if (/\b(hora|reserv|agend|cita|turno)/.test(n)) return servicesText(ctx, `${welcome(ctx)}\n\n¿Qué servicio necesitas?`);
      if (!isGreetingOnly(n) && ctx.allowAi) return { useAi: true };
    }
    return menuText(ctx, welcome(ctx));
  }

  if (num === null && !inNameFlow) {
    const faq = matchFaq(text, ctx.faqs);
    if (faq) return { text: `${faq.answer}\n\n_Escribe *menú* para ver las opciones._`, state: ctx.state };
  }

  switch (current) {
    case "A_MENU": {
      const options = menuOptions(ctx.faqs).map(([k]) => k);
      if (num !== null && num >= 1 && num <= options.length) {
        const key = options[num - 1];
        if (key === "reservar") return servicesText(ctx);
        if (key === "mis-horas") return myAppointmentsText(ctx);
        if (key === "persona") return handOff(ctx, "El cliente pidió hablar con una persona");
        if (key === "faq") {
          return {
            text: `❓ *Preguntas frecuentes*\n${ctx.faqs.map((f, i) => `*${i + 1}.* ${f.question}`).join("\n")}\n\nResponde con el número de tu pregunta.`,
            state: { step: "A_FAQ", options: ctx.faqs.map((f) => f.id) },
          };
        }
      }
      if (GREETINGS.test(n) && isGreetingOnly(n)) return menuText(ctx, welcome(ctx));
      if (/\b(hora|reserv|agend|cita|turno)/.test(n) && !ctx.allowAi) return servicesText(ctx);
      return notUnderstood(ctx, () => menuText(ctx));
    }

    case "A_SERVICIO": {
      const ids = ctx.state.options ?? [];
      if (num !== null && num >= 1 && num <= ids.length) return daysText(ctx, ids[num - 1]);
      return notUnderstood(ctx, () => servicesText(ctx));
    }

    case "A_DIA": {
      const days = ctx.state.options ?? [];
      if (num !== null && num >= 1 && num <= days.length && ctx.state.serviceId) {
        return timesText(ctx, ctx.state.serviceId, days[num - 1]);
      }
      if (num === 0) return servicesText(ctx);
      return notUnderstood(ctx, () => (ctx.state.serviceId ? daysText(ctx, ctx.state.serviceId) : servicesText(ctx)));
    }

    case "A_HORA": {
      const serviceId = ctx.state.serviceId;
      if (!serviceId || !ctx.state.ymd) return servicesText(ctx);
      if (num === 0) return daysText(ctx, serviceId);
      const times = ctx.state.options ?? [];
      if (num !== null && num >= 1 && num <= times.length) {
        try {
          const appointment = await bookAppointment({
            businessId: ctx.business.id,
            customerId: ctx.customer.id,
            conversationId: ctx.conversationId,
            serviceId,
            startsAt: new Date(times[num - 1]),
            source: "WHATSAPP",
          });
          return askName(ctx, appointment.id);
        } catch (err) {
          if (err instanceof AgendaError) return timesText(ctx, serviceId, ctx.state.ymd, `😕 ${err.message}`);
          throw err;
        }
      }
      return notUnderstood(ctx, () => timesText(ctx, serviceId, ctx.state.ymd!));
    }

    case "A_REUSAR_NOMBRE": {
      const appointmentId = ctx.state.appointmentId;
      if (!appointmentId) return menuText(ctx);
      if (YES.test(n)) {
        const previous = await lastPatientName(ctx.customer.id);
        if (previous) return finishName(ctx, appointmentId, previous);
      }
      if (NO.test(n) || YES.test(n)) {
        return { text: "¿A nombre de quién dejo la hora? (nombre y apellido)", state: { ...ctx.state, step: "A_NOMBRE" } };
      }
      // Si escribió directamente un nombre, se usa ese.
      if (text.trim().length >= 3 && num === null) return finishName(ctx, appointmentId, text);
      return { text: "Responde *1* si es a ese nombre o *2* para escribir otro.", state: ctx.state };
    }

    case "A_NOMBRE": {
      const appointmentId = ctx.state.appointmentId;
      if (!appointmentId) return menuText(ctx);
      if (text.trim().length < 3) return { text: "¿Me escribes el nombre y apellido de quien se atiende?", state: ctx.state };
      return finishName(ctx, appointmentId, text);
    }

    case "A_MIS_HORAS": {
      const ids = ctx.state.options ?? [];
      if (num !== null && num >= 1 && num <= ids.length) {
        const appointment = await db.appointment.findFirst({ where: { id: ids[num - 1], customerId: ctx.customer.id } });
        if (!appointment) return myAppointmentsText(ctx);
        return {
          text: `¿Seguro que quieres cancelar tu hora de *${appointment.serviceName}* del ${formatAppointmentTime(appointment.startsAt)}?\n*1.* Sí, cancelar\n*2.* No`,
          state: { step: "A_CANCELAR", appointmentId: appointment.id },
        };
      }
      return notUnderstood(ctx, () => myAppointmentsText(ctx));
    }

    case "A_CANCELAR": {
      const appointment = ctx.state.appointmentId
        ? await db.appointment.findFirst({ where: { id: ctx.state.appointmentId, customerId: ctx.customer.id } })
        : null;
      if (!appointment) return myAppointmentsText(ctx);
      if (YES.test(n)) {
        await cancelAppointment(appointment.id);
        return menuText(ctx, `Listo, cancelamos tu hora del ${formatAppointmentTime(appointment.startsAt)}. ¡Gracias por avisar! 🙌`);
      }
      if (NO.test(n)) return menuText(ctx, "Perfecto, tu hora sigue reservada 👍");
      return { text: "Responde *1* para cancelar la hora o *2* para mantenerla.", state: ctx.state };
    }

    case "A_FAQ": {
      const ids = ctx.state.options ?? [];
      if (num !== null && num >= 1 && num <= ids.length) {
        const faq = ctx.faqs.find((f) => f.id === ids[num - 1]);
        if (faq) return { text: `${faq.answer}\n\n_Elige otra pregunta con su número o escribe *menú*._`, state: ctx.state };
      }
      return notUnderstood(ctx, () => menuText(ctx));
    }

    default:
      return menuText(ctx);
  }
}

export async function runAgendaMenu(opts: {
  business: Business;
  customer: Customer;
  conversationId: string;
  state: MenuState;
  text: string;
  allowAi: boolean;
}): Promise<MenuResult> {
  const faqs = await db.faqEntry.findMany({
    where: { businessId: opts.business.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  const expired = !opts.state.updatedAt || Date.now() - new Date(opts.state.updatedAt).getTime() > STATE_TTL_MS;
  const state: MenuState = expired ? {} : opts.state;
  const wasPrivate = !!state.step && APPOINTMENT_FLOW_STEPS.includes(state.step as AgendaStep);

  const reply = await step({ ...opts, state, faqs }, opts.text);
  if ("useAi" in reply) {
    await saveMenuState(opts.conversationId, { ...state, engine: "ia" });
    return { result: "use_ai", private: false };
  }
  const nowPrivate = !!reply.state.step && APPOINTMENT_FLOW_STEPS.includes(reply.state.step as AgendaStep);
  await saveMenuState(opts.conversationId, { ...reply.state, engine: reply.state.engine ?? "menu" });
  // La respuesta a la pregunta del nombre y la confirmación (que lo incluye) son privadas.
  await sendToCustomer(opts.conversationId, reply.text, "MENU", { private: wasPrivate || nowPrivate });
  return { result: "handled", private: wasPrivate };
}

// La IA reservó una hora: el sistema pregunta el nombre de forma privada.
// Devuelve la primera pregunta, que se envía después de la respuesta de la IA.
export async function beginAppointmentNameFlow(conversationId: string, appointmentId: string): Promise<string> {
  const conversation = await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { customer: true } });
  const ask = await askName(conversation, appointmentId, "cita");
  await saveMenuState(conversationId, { ...ask.state, engine: "menu" });
  return ask.text;
}

const CONFIRM_WORDS = ["confirmo", "confirmar", "si confirmo", "confirmado", "si, confirmo", "voy", "si voy"];
const CANCEL_WORDS = ["cancelo", "cancelar", "no puedo", "no podre ir", "cancelar hora", "no voy"];

// Respuesta a un recordatorio (botones "Confirmo" / "Cancelo"). Devuelve true si la atendió.
export async function handleReminderReply(conversationId: string, text: string): Promise<boolean> {
  const n = normalize(text).replace(/[!.¡]/g, "").trim();
  const confirm = CONFIRM_WORDS.includes(n);
  const cancel = CANCEL_WORDS.includes(n);
  if (!confirm && !cancel) return false;
  const conversation = await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { business: true } });
  if (conversation.business.kind !== "AGENDA") return false;
  const appointment = await db.appointment.findFirst({
    where: {
      customerId: conversation.customerId,
      reminderSentAt: { not: null },
      startsAt: { gt: new Date() },
      status: { in: ["RESERVADA", "CONFIRMADA"] },
    },
    orderBy: { startsAt: "asc" },
  });
  if (!appointment) return false;
  if (confirm) {
    await db.appointment.update({ where: { id: appointment.id }, data: { status: "CONFIRMADA" } });
    await sendToCustomer(conversationId, `¡Gracias! Tu hora del ${formatAppointmentTime(appointment.startsAt)} quedó *confirmada* ✅ Te esperamos.`, "MENU");
  } else {
    await cancelAppointment(appointment.id);
    await sendToCustomer(
      conversationId,
      `Listo, cancelamos tu hora del ${formatAppointmentTime(appointment.startsAt)}. ¡Gracias por avisar! Si quieres otra, escríbenos por aquí.`,
      "MENU",
    );
  }
  return true;
}
