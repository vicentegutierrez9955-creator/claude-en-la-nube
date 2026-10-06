import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
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

export const TOOLS: Tool[] = [
  buscarProductos,
  modificarCarrito,
  verCarrito,
  pedirDatosEnvio,
  confirmarPedido,
  consultarPedidos,
  derivarAHumano,
];

export const TOOL_DEFINITIONS: Anthropic.Beta.BetaTool[] = TOOLS.map((t) => t.definition);

export async function runTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<{ content: string; isError: boolean }> {
  const tool = TOOLS.find((t) => t.definition.name === name);
  if (!tool) return { content: `Herramienta desconocida: ${name}`, isError: true };
  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) {
    return { content: `Datos inválidos: ${parsed.error.issues.map((i) => i.message).join("; ")}`, isError: true };
  }
  try {
    return { content: await tool.run(parsed.data as never, ctx), isError: false };
  } catch (err) {
    if (err instanceof OrderError) return { content: err.message, isError: true };
    console.error(`[agente] error en herramienta ${name}`, err);
    return { content: "Error interno al ejecutar la herramienta. Intenta de nuevo o deriva a una persona.", isError: true };
  }
}
