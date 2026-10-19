import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import {
  AgendaError,
  APPOINTMENT_STATUS_LABEL,
  availableSlots,
  bookAppointment,
  cancelAppointment,
  dayLabel,
  formatAppointmentTime,
  hhmm,
  localParts,
  localToUtc,
  parseHhmm,
  upcomingAppointments,
} from "../agenda";
import { beginAppointmentNameFlow } from "../agenda-bot";
import { searchCatalog } from "../catalog";
import { beginShippingFlow } from "../menu-bot";
import { db } from "../db";
import { formatCLP, ORDER_STATUS_LABEL } from "../format";
import {
  checkout,
  getOrCreateCart,
  missingShippingFields,
  OrderError,
  orderSummary,
  recentOrders,
  setCartItem,
  type OrderWithItems,
} from "../orders";

export type ToolContext = {
  businessId: string;
  conversationId: string;
  // Mensajes que el sistema envía al cliente después de la respuesta de la IA.
  afterReply: { text: string; private: boolean }[];
};

type Tool = {
  definition: Anthropic.Beta.BetaTool;
  schema: z.ZodType;
  run: (input: never, ctx: ToolContext) => Promise<string>;
};

const noInput = { type: "object" as const, properties: {}, required: [], additionalProperties: false };

function cartView(order: OrderWithItems): string {
  if (order.items.length === 0) return "El carrito está vacío.";
  const missing = missingShippingFields(order);
  return [
    `Pedido #${order.number}:`,
    orderSummary(order),
    missing.length ? `Faltan datos de envío: ${missing.join(", ")}.` : "Datos de envío completos.",
  ].join("\n");
}

const buscarProductos: Tool = {
  definition: {
    name: "buscar_productos",
    description:
      "Busca en el catálogo de la tienda. Devuelve id, nombre, precio en CLP, stock y descripción. " +
      "Usa una consulta vacía para ver todo el catálogo. Siempre consulta aquí antes de dar precios o stock.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { consulta: { type: "string", description: "Palabras a buscar, o vacío para todo" } },
      required: ["consulta"],
      additionalProperties: false,
    },
  },
  schema: z.object({ consulta: z.string() }),
  run: async (input: { consulta: string }, ctx) => {
    const products = await searchCatalog(ctx.businessId, input.consulta, 40);
    if (products.length === 0) return "No se encontraron productos con esa búsqueda.";
    return JSON.stringify(
      products.map((p) => ({
        id: p.id,
        nombre: p.name,
        precio: formatCLP(p.price),
        stock: p.stock,
        descripcion: p.description,
      })),
    );
  },
};

const modificarCarrito: Tool = {
  definition: {
    name: "modificar_carrito",
    description:
      "Fija la cantidad de un producto en el carrito del cliente (0 para quitarlo). Devuelve el carrito actualizado con totales.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        producto_id: { type: "string", description: "id del producto según buscar_productos" },
        cantidad: { type: "integer", description: "Cantidad total deseada de ese producto" },
      },
      required: ["producto_id", "cantidad"],
      additionalProperties: false,
    },
  },
  schema: z.object({ producto_id: z.string(), cantidad: z.number().int().min(0).max(1000) }),
  run: async (input: { producto_id: string; cantidad: number }, ctx) =>
    cartView(await setCartItem(ctx.conversationId, input.producto_id, input.cantidad)),
};

const verCarrito: Tool = {
  definition: {
    name: "ver_carrito",
    description: "Muestra el carrito actual del cliente con totales y qué datos de envío faltan.",
    strict: true,
    input_schema: noInput,
  },
  schema: z.object({}),
  run: async (_input: object, ctx) => cartView(await getOrCreateCart(ctx.conversationId)),
};

const pedirDatosEnvio: Tool = {
  definition: {
    name: "pedir_datos_envio",
    description:
      "Cuando el cliente ya eligió sus productos y quiere comprar, el sistema le pide sus datos de despacho " +
      "(nombre, dirección, comuna y región) de forma privada, le muestra el resumen y le envía el link de pago. " +
      "Tú no verás esos datos. No pidas datos personales tú: usa esta herramienta.",
    strict: true,
    input_schema: noInput,
  },
  schema: z.object({}),
  run: async (_input: object, ctx) => {
    const firstQuestion = await beginShippingFlow(ctx.conversationId);
    ctx.afterReply.push({ text: firstQuestion, private: true });
    return (
      "Listo: después de tu mensaje, el sistema le pedirá los datos de envío al cliente, le mostrará el resumen " +
      "y le enviará el link de pago. Responde solo con una frase breve (por ejemplo, que ahora le pediremos los datos " +
      "para el despacho), sin pedir ni mencionar datos personales."
    );
  },
};

const confirmarPedido: Tool = {
  definition: {
    name: "confirmar_pedido",
    description:
      "Vuelve a enviar el resumen y el link de pago de un carrito que ya tiene datos de envío completos " +
      "(por ejemplo, si el cliente agregó productos después de dar su dirección). Úsala solo si el cliente lo confirmó; " +
      "si faltan datos de envío, usa pedir_datos_envio.",
    strict: true,
    input_schema: noInput,
  },
  schema: z.object({}),
  run: async (_input: object, ctx) => {
    const order = await checkout(ctx.conversationId);
    return (
      `Listo: el resumen del pedido #${order.number} y el link de pago ya se le enviaron al cliente en un mensaje aparte. ` +
      "No repitas el link ni el resumen; solo despídete brevemente o resuelve dudas. " +
      "Cuando pague, el sistema le avisará automáticamente."
    );
  },
};

const consultarPedidos: Tool = {
  definition: {
    name: "consultar_pedidos",
    description: "Lista los últimos pedidos de este cliente con su estado, link de pago pendiente y número de seguimiento.",
    strict: true,
    input_schema: noInput,
  },
  schema: z.object({}),
  run: async (_input: object, ctx) => {
    const conversation = await db.conversation.findUniqueOrThrow({ where: { id: ctx.conversationId } });
    const orders = await recentOrders(conversation.customerId);
    if (orders.length === 0) return "El cliente no tiene pedidos anteriores.";
    return JSON.stringify(
      orders.map((o) => ({
        numero: o.number,
        estado: ORDER_STATUS_LABEL[o.status],
        total: formatCLP(o.total),
        productos: o.items.map((i) => `${i.quantity}x ${i.name}`).join(", "),
        link_pago: o.status === "PENDIENTE_PAGO" ? o.paymentUrl : undefined,
        paqueteria: o.carrier ?? undefined,
        seguimiento: o.trackingNumber ?? undefined,
      })),
    );
  },
};

const derivarAHumano: Tool = {
  definition: {
    name: "derivar_a_humano",
    description:
      "Pasa la conversación a una persona del equipo y desactiva tus respuestas automáticas en este chat. " +
      "Úsala si el cliente lo pide, tiene un reclamo, pide algo fuera de tus herramientas o no logras ayudarlo.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string", description: "Resumen breve para el equipo" } },
      required: ["motivo"],
      additionalProperties: false,
    },
  },
  schema: z.object({ motivo: z.string() }),
  run: async (input: { motivo: string }, ctx) => {
    await db.conversation.update({
      where: { id: ctx.conversationId },
      data: { mode: "HUMANO", needsHuman: true, humanUntil: null, handoffReason: input.motivo },
    });
    return "Conversación derivada. Avísale al cliente que una persona del equipo le responderá pronto.";
  },
};

// ---------- Agenda (negocios que atienden con hora) ----------

async function conversationCustomer(conversationId: string) {
  return db.conversation.findUniqueOrThrow({ where: { id: conversationId } });
}

const verServicios: Tool = {
  definition: {
    name: "ver_servicios",
    description: "Lista los servicios que se pueden reservar: id, nombre, duración en minutos, precio y descripción.",
    strict: true,
    input_schema: noInput,
  },
  schema: z.object({}),
  run: async (_input: object, ctx) => {
    const services = await db.service.findMany({
      where: { businessId: ctx.businessId, active: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });
    if (services.length === 0) return "No hay servicios disponibles para reservar.";
    return JSON.stringify(
      services.map((s) => ({
        id: s.id,
        nombre: s.name,
        duracion_min: s.durationMin,
        precio: s.price > 0 ? formatCLP(s.price) : "consultar",
        descripcion: s.description,
      })),
    );
  },
};

const verHorasLibres: Tool = {
  definition: {
    name: "ver_horas_libres",
    description:
      "Horas libres para un servicio, día por día. Usa la fecha de hoy (va al inicio del mensaje del cliente) para " +
      "calcular fechas como 'mañana' o 'el jueves'. Nunca ofrezcas una hora que no aparezca aquí.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        servicio_id: { type: "string", description: "id del servicio según ver_servicios" },
        desde: { type: "string", description: "Primer día a revisar, formato AAAA-MM-DD" },
        dias: { type: "integer", description: "Cuántos días revisar (1 a 14)" },
      },
      required: ["servicio_id", "desde", "dias"],
      additionalProperties: false,
    },
  },
  schema: z.object({
    servicio_id: z.string(),
    desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato AAAA-MM-DD"),
    dias: z.number().int().min(1).max(14),
  }),
  run: async (input: { servicio_id: string; desde: string; dias: number }, ctx) => {
    const days = await availableSlots({ businessId: ctx.businessId, serviceId: input.servicio_id, fromYmd: input.desde, days: input.dias });
    const withTimes = days.filter((d) => d.times.length > 0);
    if (withTimes.length === 0) return "No hay horas libres en esos días. Prueba con otras fechas.";
    return withTimes
      .map((d) => `${d.ymd} (${dayLabel(d.ymd)}): ${d.times.map((t) => hhmm(localParts(t).minutes)).join(", ")}`)
      .join("\n");
  },
};

const reservarHora: Tool = {
  definition: {
    name: "reservar_hora",
    description:
      "Reserva una hora libre cuando el cliente ya eligió servicio, día y hora y lo confirmó. Después el sistema le " +
      "pregunta el nombre de quien se atiende de forma privada y le envía la confirmación. No pidas el nombre tú.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        servicio_id: { type: "string" },
        fecha: { type: "string", description: "AAAA-MM-DD" },
        hora: { type: "string", description: "HH:MM en hora de Chile, una de las que devolvió ver_horas_libres" },
      },
      required: ["servicio_id", "fecha", "hora"],
      additionalProperties: false,
    },
  },
  schema: z.object({
    servicio_id: z.string(),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha debe tener formato AAAA-MM-DD"),
    hora: z.string(),
  }),
  run: async (input: { servicio_id: string; fecha: string; hora: string }, ctx) => {
    const minutes = parseHhmm(input.hora);
    if (minutes === null) throw new AgendaError("La hora debe tener formato HH:MM.");
    const conversation = await conversationCustomer(ctx.conversationId);
    const appointment = await bookAppointment({
      businessId: ctx.businessId,
      customerId: conversation.customerId,
      conversationId: ctx.conversationId,
      serviceId: input.servicio_id,
      startsAt: localToUtc(input.fecha, minutes),
      source: "WHATSAPP",
    });
    const question = await beginAppointmentNameFlow(ctx.conversationId, appointment.id);
    ctx.afterReply.push({ text: question, private: true });
    return (
      `Hora #${appointment.number} reservada: ${appointment.serviceName}, ${formatAppointmentTime(appointment.startsAt)}. ` +
      "Después de tu mensaje, el sistema le preguntará al cliente a nombre de quién queda y le enviará la confirmación. " +
      "Responde solo con una frase breve (que la hora quedó tomada), sin pedir datos personales."
    );
  },
};

const misHoras: Tool = {
  definition: {
    name: "mis_horas",
    description: "Lista las próximas horas reservadas de este cliente, con su número, servicio, fecha y estado.",
    strict: true,
    input_schema: noInput,
  },
  schema: z.object({}),
  run: async (_input: object, ctx) => {
    const conversation = await conversationCustomer(ctx.conversationId);
    const list = await upcomingAppointments(conversation.customerId);
    if (list.length === 0) return "El cliente no tiene horas reservadas.";
    return JSON.stringify(
      list.map((a) => ({
        numero: a.number,
        servicio: a.serviceName,
        cuando: formatAppointmentTime(a.startsAt),
        estado: APPOINTMENT_STATUS_LABEL[a.status],
      })),
    );
  },
};

const cancelarHora: Tool = {
  definition: {
    name: "cancelar_hora",
    description: "Cancela una hora futura de este cliente, por su número (según mis_horas). Úsala solo si el cliente lo confirmó.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { numero: { type: "integer", description: "Número de la hora" } },
      required: ["numero"],
      additionalProperties: false,
    },
  },
  schema: z.object({ numero: z.number().int() }),
  run: async (input: { numero: number }, ctx) => {
    const conversation = await conversationCustomer(ctx.conversationId);
    const appointment = await db.appointment.findFirst({
      where: { businessId: ctx.businessId, customerId: conversation.customerId, number: input.numero },
    });
    if (!appointment) throw new AgendaError("No encontré una hora con ese número para este cliente.");
    if (appointment.status === "CANCELADA") return "Esa hora ya estaba cancelada.";
    if (appointment.startsAt <= new Date()) throw new AgendaError("Esa hora ya pasó: no se puede cancelar.");
    await cancelAppointment(appointment.id);
    return `Hora #${appointment.number} cancelada (${formatAppointmentTime(appointment.startsAt)}). La hora quedó libre para otra persona.`;
  },
};

export const TOOLS: Tool[] = [
  buscarProductos,
  modificarCarrito,
  verCarrito,
  pedirDatosEnvio,
  confirmarPedido,
  consultarPedidos,
  derivarAHumano,
];

export const AGENDA_TOOLS: Tool[] = [verServicios, verHorasLibres, reservarHora, misHoras, cancelarHora, derivarAHumano];

export const TOOL_DEFINITIONS: Anthropic.Beta.BetaTool[] = TOOLS.map((t) => t.definition);
export const AGENDA_TOOL_DEFINITIONS: Anthropic.Beta.BetaTool[] = AGENDA_TOOLS.map((t) => t.definition);

export function toolDefinitionsFor(kind: "TIENDA" | "AGENDA"): Anthropic.Beta.BetaTool[] {
  return kind === "AGENDA" ? AGENDA_TOOL_DEFINITIONS : TOOL_DEFINITIONS;
}

export async function runTool(
  name: string,
  rawInput: unknown,
  ctx: ToolContext,
  kind: "TIENDA" | "AGENDA" = "TIENDA",
): Promise<{ content: string; isError: boolean }> {
  const tool = (kind === "AGENDA" ? AGENDA_TOOLS : TOOLS).find((t) => t.definition.name === name);
  if (!tool) return { content: `Herramienta desconocida: ${name}`, isError: true };
  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) {
    return { content: `Datos inválidos: ${parsed.error.issues.map((i) => i.message).join("; ")}`, isError: true };
  }
  try {
    return { content: await tool.run(parsed.data as never, ctx), isError: false };
  } catch (err) {
    if (err instanceof OrderError || err instanceof AgendaError) return { content: err.message, isError: true };
    console.error(`[agente] error en herramienta ${name}`, err);
    return { content: "Error interno al ejecutar la herramienta. Intenta de nuevo o deriva a una persona.", isError: true };
  }
}
