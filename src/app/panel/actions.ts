"use server";

import type { OrderStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { processConversation, receiveCustomerMessage } from "@/lib/conversations";
import { encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { sendToCustomer } from "@/lib/messaging";
import { createShipmentForOrder, markDispatched, markOrderPaid, REGIONES_CHILE } from "@/lib/orders";

function str(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}
function int(form: FormData, key: string, fallback = 0) {
  const n = Number(str(form, key).replace(/[.$\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

async function ownOrder(orderId: string) {
  const user = await requireUser();
  const order = await db.order.findFirst({ where: { id: orderId, businessId: user.businessId } });
  if (!order) redirect("/panel/pedidos");
  return order;
}

async function ownConversation(conversationId: string) {
  const user = await requireUser();
  const conversation = await db.conversation.findFirst({ where: { id: conversationId, businessId: user.businessId } });
  if (!conversation) redirect("/panel/conversaciones");
  return conversation;
}

// ---------- Productos ----------

export async function saveProduct(form: FormData) {
  const user = await requireUser();
  const id = str(form, "id");
  const data = {
    name: str(form, "name"),
    sku: str(form, "sku") || null,
    description: str(form, "description"),
    price: int(form, "price"),
    stock: int(form, "stock"),
    weightGrams: int(form, "weightGrams", 500),
    active: form.get("active") === "on",
  };
  if (!data.name || data.price <= 0) redirect("/panel/productos?error=" + encodeURIComponent("Nombre y precio son obligatorios"));
  if (id) {
    await db.product.updateMany({ where: { id, businessId: user.businessId }, data });
  } else {
    await db.product.create({ data: { ...data, businessId: user.businessId } });
  }
  revalidatePath("/panel/productos");
  redirect("/panel/productos");
}

// ---------- Pedidos ----------

export async function createShipmentAction(form: FormData) {
  const order = await ownOrder(str(form, "orderId"));
  await createShipmentForOrder(order.id);
  revalidatePath(`/panel/pedidos/${order.id}`);
}

export async function simulatePaymentAction(form: FormData) {
  const order = await ownOrder(str(form, "orderId"));
  await markOrderPaid(order.id, null);
  revalidatePath(`/panel/pedidos/${order.id}`);
  const back = str(form, "back");
  if (back) redirect(back);
}

export async function dispatchOrdersAction(form: FormData) {
  const user = await requireUser();
  const ids = form.getAll("ids").map(String);
  await markDispatched(user.businessId, ids);
  revalidatePath("/panel/pedidos");
}

export async function setOrderStatusAction(form: FormData) {
  const order = await ownOrder(str(form, "orderId"));
  const status = str(form, "status") as OrderStatus;
  if (!["ENTREGADO", "CANCELADO"].includes(status)) return;
  await db.order.update({ where: { id: order.id }, data: { status } });
  revalidatePath(`/panel/pedidos/${order.id}`);
}

// ---------- Conversaciones ----------

export async function sendManualMessageAction(form: FormData) {
  const conversation = await ownConversation(str(form, "conversationId"));
  const text = str(form, "text");
  if (text) {
    // Si alguien del equipo escribe, el bot se hace a un lado en ese chat.
    await db.conversation.update({ where: { id: conversation.id }, data: { mode: "HUMANO", needsHuman: false } });
    await sendToCustomer(conversation.id, text, "HUMANO");
  }
  revalidatePath(`/panel/conversaciones/${conversation.id}`);
}

export async function setConversationModeAction(form: FormData) {
  const conversation = await ownConversation(str(form, "conversationId"));
  const mode = str(form, "mode") === "BOT" ? "BOT" : "HUMANO";
  await db.conversation.update({
    where: { id: conversation.id },
    data: { mode, needsHuman: false, ...(mode === "BOT" ? { handoffReason: null } : {}) },
  });
  revalidatePath(`/panel/conversaciones/${conversation.id}`);
}

// ---------- Simulador ----------

const SIM_WA_ID = "56900000000";

export async function simulatorSendAction(form: FormData) {
  const user = await requireUser();
  const text = str(form, "text");
  if (!text) return;
  const conversationId = await receiveCustomerMessage({
    businessId: user.businessId,
    waId: SIM_WA_ID,
    profileName: "Cliente de prueba",
    text,
    waMessageId: null,
    channel: "SIMULADOR",
  });
  if (conversationId) await processConversation(conversationId);
  revalidatePath("/panel/simulador");
}

export async function simulatorResetAction() {
  const user = await requireUser();
  const customer = await db.customer.findUnique({
    where: { businessId_waId: { businessId: user.businessId, waId: SIM_WA_ID } },
  });
  if (customer) {
    await db.conversation.deleteMany({ where: { customerId: customer.id, channel: "SIMULADOR" } });
    await db.order.deleteMany({ where: { customerId: customer.id, status: { in: ["BORRADOR", "PENDIENTE_PAGO"] } } });
  }
  revalidatePath("/panel/simulador");
}

// ---------- Configuración ----------

function secretUpdate(form: FormData, key: string) {
  const value = str(form, key);
  // Campo vacío = no cambiar el valor guardado.
  return value ? { [key]: encryptSecret(value) } : {};
}

export async function saveSettingsAction(form: FormData) {
  const user = await requireUser();
  const section = str(form, "section");
  let data: Record<string, unknown> = {};
  switch (section) {
    case "tienda":
      data = {
        name: str(form, "name") || user.business.name,
        shippingFlatRate: int(form, "shippingFlatRate"),
        freeShippingFrom: int(form, "freeShippingFrom"),
        originName: str(form, "originName") || null,
        originPhone: str(form, "originPhone") || null,
        originAddress: str(form, "originAddress") || null,
        originComuna: str(form, "originComuna") || null,
        originRegion: REGIONES_CHILE.includes(str(form, "originRegion") as never) ? str(form, "originRegion") : null,
      };
      break;
    case "bot":
      data = {
        botEnabled: form.get("botEnabled") === "on",
        autoCreateShipment: form.get("autoCreateShipment") === "on",
        botInstructions: str(form, "botInstructions").slice(0, 4000),
      };
      break;
    case "whatsapp":
      data = {
        whatsappPhoneNumberId: str(form, "whatsappPhoneNumberId") || null,
        ...secretUpdate(form, "whatsappAccessToken"),
      };
      break;
    case "mercadopago":
      data = { ...secretUpdate(form, "mpAccessToken"), ...secretUpdate(form, "mpWebhookSecret") };
      break;
    case "envios":
      data = {
        shippingProvider: str(form, "shippingProvider") === "bluexpress" ? "bluexpress" : "simulado",
        ...secretUpdate(form, "bxToken"),
        ...secretUpdate(form, "bxUserCode"),
        ...secretUpdate(form, "bxClientAccount"),
      };
      break;
  }
  try {
    await db.business.update({ where: { id: user.businessId }, data });
  } catch {
    redirect("/panel/configuracion?error=" + encodeURIComponent("No se pudo guardar. ¿Ese número de WhatsApp ya está conectado a otra cuenta?"));
  }
  revalidatePath("/panel/configuracion");
  redirect("/panel/configuracion?ok=" + section);
}
