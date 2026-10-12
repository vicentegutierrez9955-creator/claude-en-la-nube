import { hmacSha256Hex, safeEqualHex } from "./crypto";

// Integración con Mercado Pago Checkout Pro (Chile, CLP).
// Docs: https://www.mercadopago.cl/developers/es/docs/checkout-pro/overview

const API = "https://api.mercadopago.com";

export type PreferenceInput = {
  accessToken: string;
  orderId: string;
  orderNumber: number;
  items: { title: string; quantity: number; unitPrice: number }[];
  shippingCost: number;
  payerPhone?: string;
  notificationUrl: string;
  backUrl: string;
};

export async function createPreference(input: PreferenceInput): Promise<{ id: string; initPoint: string }> {
  const items = input.items.map((i) => ({
    title: i.title,
    quantity: i.quantity,
    unit_price: i.unitPrice,
    currency_id: "CLP",
  }));
  if (input.shippingCost > 0) {
    items.push({ title: "Envío", quantity: 1, unit_price: input.shippingCost, currency_id: "CLP" });
  }
  const res = await fetch(`${API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": `pref-${input.orderId}-${Date.now()}`,
    },
    body: JSON.stringify({
      items,
      external_reference: input.orderId,
      statement_descriptor: `PEDIDO ${input.orderNumber}`,
      notification_url: input.notificationUrl,
      back_urls: { success: input.backUrl, pending: input.backUrl, failure: input.backUrl },
      auto_return: "approved",
    }),
  });
  if (!res.ok) throw new Error(`Mercado Pago respondió ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { id: string; init_point: string };
  return { id: data.id, initPoint: data.init_point };
}

export type MpPayment = {
  id: number;
  status: string; // approved, pending, rejected, ...
  external_reference: string | null;
  transaction_amount: number;
};

export async function getPayment(accessToken: string, paymentId: string): Promise<MpPayment> {
  const res = await fetch(`${API}/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Mercado Pago respondió ${res.status}: ${await res.text()}`);
  return (await res.json()) as MpPayment;
}

// Valida el header x-signature ("ts=...,v1=...") de las notificaciones.
// Manifest: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
export function verifyMercadoPagoSignature(opts: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret: string;
}): boolean {
  if (!opts.xSignature) return false;
  const parts = Object.fromEntries(
    opts.xSignature.split(",").map((p) => {
      const [k, ...v] = p.trim().split("=");
      return [k, v.join("=")];
    }),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  let manifest = "";
  if (opts.dataId) manifest += `id:${opts.dataId.toLowerCase()};`;
  if (opts.xRequestId) manifest += `request-id:${opts.xRequestId};`;
  manifest += `ts:${ts};`;
  return safeEqualHex(v1, hmacSha256Hex(opts.secret, manifest));
}
