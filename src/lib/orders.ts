import type { Business, MessageAuthor, Order, OrderItem, Prisma } from "@prisma/client";
import { decryptSecret } from "./crypto";
import { db } from "./db";
import { formatCLP, ORDER_STATUS_LABEL } from "./format";
import { createPreference } from "./mercadopago";
import { sendToCustomer } from "./messaging";
import { shippingProviderFor } from "./shipping";

export const REGIONES_CHILE = [
  "Arica y Parinacota",
  "Tarapacá",
  "Antofagasta",
  "Atacama",
  "Coquimbo",
  "Valparaíso",
  "Metropolitana de Santiago",
  "Libertador General Bernardo O'Higgins",
  "Maule",
  "Ñuble",
  "Biobío",
  "La Araucanía",
  "Los Ríos",
  "Los Lagos",
  "Aysén del General Carlos Ibáñez del Campo",
  "Magallanes y de la Antártica Chilena",
] as const;

export class OrderError extends Error {}

export type OrderWithItems = Order & { items: OrderItem[] };

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

async function nextOrderNumber(tx: Prisma.TransactionClient, businessId: string): Promise<number> {
  const b = await tx.business.update({ where: { id: businessId }, data: { orderSeq: { increment: 1 } } });
  return b.orderSeq;
}

// El carrito es un pedido en estado BORRADOR asociado a la conversación.
export async function getOrCreateCart(conversationId: string): Promise<OrderWithItems> {
  const conversation = await db.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  const existing = await db.order.findFirst({
    where: { conversationId, status: "BORRADOR" },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;
  return db.$transaction(async (tx) =>
    tx.order.create({
      data: {
        businessId: conversation.businessId,
        customerId: conversation.customerId,
        conversationId,
        number: await nextOrderNumber(tx, conversation.businessId),
      },
      include: { items: true },
    }),
  );
}

export function computeShipping(business: Pick<Business, "shippingFlatRate" | "freeShippingFrom">, subtotal: number): number {
  if (subtotal === 0) return 0;
  if (business.freeShippingFrom > 0 && subtotal >= business.freeShippingFrom) return 0;
  return business.shippingFlatRate;
}

export async function recalcTotals(orderId: string): Promise<OrderWithItems> {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true, business: true } });
  const subtotal = order.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const shippingCost = computeShipping(order.business, subtotal);
  return db.order.update({
    where: { id: orderId },
    data: { subtotal, shippingCost, total: subtotal + shippingCost },
    include: { items: true },
  });
}

export async function setCartItem(conversationId: string, productId: string, quantity: number): Promise<OrderWithItems> {
  const cart = await getOrCreateCart(conversationId);
  if (quantity <= 0) {
    await db.orderItem.deleteMany({ where: { orderId: cart.id, productId } });
    return recalcTotals(cart.id);
  }
  const product = await db.product.findFirst({ where: { id: productId, businessId: cart.businessId, active: true } });
  if (!product) throw new OrderError("Ese producto no existe o no está disponible.");
  if (product.stock < quantity) {
    throw new OrderError(`Solo quedan ${product.stock} unidades de "${product.name}".`);
  }
  await db.orderItem.upsert({
    where: { orderId_productId: { orderId: cart.id, productId } },
    create: { orderId: cart.id, productId, name: product.name, unitPrice: product.price, quantity },
    update: { quantity, unitPrice: product.price, name: product.name },
  });
  return recalcTotals(cart.id);
}

export type ShippingData = {
  recipientName: string;
  recipientPhone: string;
  recipientRut: string | null;
  street: string;
  streetNumber: string;
  apartment: string | null;
  comuna: string;
  region: string;
  addressNotes: string | null;
};

export async function setShippingData(conversationId: string, data: Partial<ShippingData>): Promise<OrderWithItems> {
  const cart = await getOrCreateCart(conversationId);
  return db.order.update({ where: { id: cart.id }, data, include: { items: true } });
}

// Dirección del último pedido del cliente, para ofrecer reutilizarla.
export async function lastShippingData(customerId: string): Promise<ShippingData | null> {
  const prev = await db.order.findFirst({
    where: { customerId, status: { not: "BORRADOR" }, street: { not: null } },
    orderBy: { createdAt: "desc" },
    omit: { labelPdf: true },
  });
  if (!prev?.street || !prev.streetNumber || !prev.comuna || !prev.region || !prev.recipientName) return null;
  return {
    recipientName: prev.recipientName,
    recipientPhone: prev.recipientPhone ?? "",
    recipientRut: prev.recipientRut,
    street: prev.street,
    streetNumber: prev.streetNumber,
    apartment: prev.apartment,
    comuna: prev.comuna,
    region: prev.region,
    addressNotes: prev.addressNotes,
  };
}

export function formatAddress(o: Pick<Order, "street" | "streetNumber" | "apartment" | "comuna" | "region">): string {
  return `${o.street} ${o.streetNumber}${o.apartment ? `, ${o.apartment}` : ""}, ${o.comuna}, ${o.region}`;
}

export async function recentOrders(customerId: string) {
  return db.order.findMany({
    where: { customerId, status: { not: "BORRADOR" } },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { items: true },
    omit: { labelPdf: true },
  });
}

// Texto con el estado de los últimos pedidos, para el menú automático.
export async function recentOrdersText(customerId: string): Promise<string> {
  const orders = await recentOrders(customerId);
  if (orders.length === 0) return "Todavía no tienes pedidos con nosotros.";
  return orders
    .slice(0, 3)
    .map((o) => {
      const lines = [`*Pedido #${o.number}* · ${formatCLP(o.total)} · ${ORDER_STATUS_LABEL[o.status]}`];
      if (o.status === "PENDIENTE_PAGO" && o.paymentUrl) lines.push(`Link de pago: ${o.paymentUrl}`);
      if (o.trackingNumber) lines.push(`Seguimiento ${o.carrier}: ${o.trackingNumber}`);
      return lines.join("\n");
    })
    .join("\n\n");
}

export function missingShippingFields(order: Order): string[] {
  const required: [keyof Order, string][] = [
    ["recipientName", "nombre de quien recibe"],
    ["recipientPhone", "teléfono"],
    ["street", "calle"],
    ["streetNumber", "número de la dirección"],
    ["comuna", "comuna"],
    ["region", "región"],
  ];
  return required.filter(([k]) => !order[k]).map(([, label]) => label);
}

export function orderSummary(order: OrderWithItems): string {
  const lines = order.items.map((i) => `• ${i.quantity} x ${i.name} — ${formatCLP(i.unitPrice * i.quantity)}`);
  lines.push(`Envío: ${order.shippingCost === 0 ? "gratis" : formatCLP(order.shippingCost)}`);
  lines.push(`*Total: ${formatCLP(order.total)}*`);
  return lines.join("\n");
}

// Cierra el carrito: valida stock y dirección, genera el link de pago y se lo envía al cliente.
export async function checkout(conversationId: string, author: MessageAuthor = "BOT"): Promise<OrderWithItems> {
  const cart = await recalcTotals((await getOrCreateCart(conversationId)).id);
  if (cart.items.length === 0) throw new OrderError("El carrito está vacío.");
  const missing = missingShippingFields(cart);
  if (missing.length) throw new OrderError(`Faltan datos de envío: ${missing.join(", ")}.`);

  const products = await db.product.findMany({ where: { id: { in: cart.items.map((i) => i.productId) } } });
  for (const item of cart.items) {
    const p = products.find((x) => x.id === item.productId);
    if (!p || !p.active || p.stock < item.quantity) {
      throw new OrderError(`No hay stock suficiente de "${item.name}".`);
    }
  }

  const business = await db.business.findUniqueOrThrow({ where: { id: cart.businessId } });
  const mpToken = decryptSecret(business.mpAccessToken);
  let paymentUrl: string;
  let mpPreferenceId: string | null = null;
  if (mpToken) {
    const pref = await createPreference({
      accessToken: mpToken,
      orderId: cart.id,
      orderNumber: cart.number,
      items: cart.items.map((i) => ({ title: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
      shippingCost: cart.shippingCost,
      notificationUrl: `${appUrl()}/api/webhooks/mercadopago/${business.id}`,
      backUrl: `${appUrl()}/gracias/${cart.id}`,
    });
    paymentUrl = pref.initPoint;
    mpPreferenceId = pref.id;
  } else {
    // Sin Mercado Pago configurado: link de pago de prueba (solo lo puede usar el dueño logueado).
    paymentUrl = `${appUrl()}/pago-simulado/${cart.id}`;
  }

  const order = await db.order.update({
    where: { id: cart.id },
    data: { status: "PENDIENTE_PAGO", paymentUrl, mpPreferenceId },
    include: { items: true },
  });

  await sendToCustomer(
    conversationId,
    `🧾 *Pedido #${order.number}*\n${orderSummary(order)}\n\n📦 Envío a: ${order.street} ${order.streetNumber}${order.apartment ? `, ${order.apartment}` : ""}, ${order.comuna}\n\n💳 Paga aquí con Mercado Pago:\n${paymentUrl}`,
    author,
  );
  return order;
}

// Llamado desde el webhook de Mercado Pago (o el pago simulado). Es idempotente.
export async function markOrderPaid(orderId: string, mpPaymentId: string | null): Promise<boolean> {
  const updated = await db.$transaction(async (tx) => {
    const res = await tx.order.updateMany({
      where: { id: orderId, status: "PENDIENTE_PAGO" },
      data: { status: "PAGADO", paidAt: new Date(), mpPaymentId },
    });
    if (res.count === 0) return false;
    const items = await tx.orderItem.findMany({ where: { orderId } });
    for (const item of items) {
      await tx.product.update({ where: { id: item.productId }, data: { stock: { decrement: item.quantity } } });
    }
    return true;
  });
  if (!updated) return false;

  const order = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { business: true } });
  if (order.conversationId) {
    await sendToCustomer(
      order.conversationId,
      `✅ ¡Recibimos tu pago del pedido #${order.number}! Ya lo estamos preparando. Te avisaremos por aquí cuando salga, con tu número de seguimiento.`,
      "SISTEMA",
    );
  }
  if (order.business.autoCreateShipment) {
    await createShipmentForOrder(orderId);
  }
  return true;
}

// Emite el envío con la paquetería y guarda la etiqueta PDF lista para imprimir.
export async function createShipmentForOrder(orderId: string): Promise<Order> {
  const order = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: { include: { product: true } }, business: true },
  });
  if (order.status !== "PAGADO") {
    throw new OrderError("Solo se pueden emitir envíos de pedidos pagados sin etiqueta.");
  }
  const b = order.business;
  try {
    const provider = shippingProviderFor(b);
    const result = await provider.createShipment({
      orderId: order.id,
      orderNumber: order.number,
      businessName: b.name,
      origin: {
        name: b.originName ?? b.name,
        phone: b.originPhone ?? "",
        address: b.originAddress ?? "",
        comuna: b.originComuna ?? "",
        region: b.originRegion ?? "",
      },
      recipient: {
        name: order.recipientName!,
        phone: order.recipientPhone!,
        rut: order.recipientRut,
        street: order.street!,
        number: order.streetNumber!,
        apartment: order.apartment,
        comuna: order.comuna!,
        region: order.region!,
        notes: order.addressNotes,
      },
      packages: {
        pieces: 1,
        weightGrams: order.items.reduce((sum, i) => sum + i.product.weightGrams * i.quantity, 0),
      },
      declaredValue: order.subtotal,
      itemsDescription: order.items.map((i) => `${i.quantity}x ${i.name}`).join(", "),
    });
    return db.order.update({
      where: { id: orderId },
      data: {
        status: "ETIQUETA_LISTA",
        carrier: result.carrier,
        trackingNumber: result.trackingNumber,
        labelPdf: Buffer.from(result.labelPdf),
        labelCreatedAt: new Date(),
        shipmentError: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[envio] pedido ${orderId}:`, message);
    return db.order.update({ where: { id: orderId }, data: { shipmentError: message } });
  }
}

export async function markDispatched(businessId: string, orderIds: string[]): Promise<number> {
  const orders = await db.order.findMany({
    where: { id: { in: orderIds }, businessId, status: "ETIQUETA_LISTA" },
  });
  for (const order of orders) {
    await db.order.update({ where: { id: order.id }, data: { status: "DESPACHADO", dispatchedAt: new Date() } });
    if (order.conversationId) {
      await sendToCustomer(
        order.conversationId,
        `🚚 ¡Tu pedido #${order.number} va en camino con ${order.carrier}!\nN° de seguimiento: *${order.trackingNumber}*`,
        "SISTEMA",
      );
    }
  }
  return orders.length;
}
