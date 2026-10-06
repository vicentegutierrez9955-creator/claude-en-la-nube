// Conexión de WhatsApp "con un botón" (Embedded Signup de Meta).
// Docs: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/
//
// El navegador abre la ventana de Meta, la pyme inicia sesión con Facebook y elige su número.
// Meta devuelve un código de un solo uso (válido 30 segundos) que aquí se cambia por el
// token de la pyme, y luego se deja el número listo para recibir y enviar mensajes.

export const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class MetaError extends Error {}

export function metaConfig() {
  return {
    appId: process.env.META_APP_ID ?? "",
    configId: process.env.META_CONFIG_ID ?? "",
    appSecret: process.env.META_APP_SECRET ?? process.env.WHATSAPP_APP_SECRET ?? "",
  };
}

export function embeddedSignupReady(): boolean {
  const c = metaConfig();
  return Boolean(c.appId && c.configId && c.appSecret);
}

async function graph<T>(fetchImpl: typeof fetch, url: string, init?: RequestInit): Promise<T> {
  const res = await fetchImpl(url, init);
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok || data.error) {
    throw new MetaError(data.error?.message ?? `Meta respondió ${res.status}`);
  }
  return data;
}

export type ConnectInput = {
  code: string;
  wabaId: string;
  phoneNumberId?: string | null;
  // true = número que ya se usa en la app WhatsApp Business del celular (coexistencia)
  coexistence: boolean;
};

export type ConnectResult = {
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhone: string | null;
  pin: string | null;
};

export async function connectWhatsApp(input: ConnectInput, fetchImpl: typeof fetch = fetch): Promise<ConnectResult> {
  const { appId, appSecret } = metaConfig();
  if (!appId || !appSecret) throw new MetaError("Falta configurar META_APP_ID y META_APP_SECRET");

  // 1. Código de un solo uso → token de la pyme
  const params = new URLSearchParams({ client_id: appId, client_secret: appSecret, code: input.code });
  const { access_token: accessToken } = await graph<{ access_token: string }>(fetchImpl, `${GRAPH}/oauth/access_token?${params}`);
  const auth = { Authorization: `Bearer ${accessToken}` };

  // 2. Número conectado (en coexistencia Meta solo entrega la cuenta, no el número)
  const { data: numbers } = await graph<{ data: { id: string; display_phone_number?: string }[] }>(
    fetchImpl,
    `${GRAPH}/${input.wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`,
    { headers: auth },
  );
  const phone = numbers.find((n) => n.id === input.phoneNumberId) ?? numbers[0];
  if (!phone) throw new MetaError("La cuenta de WhatsApp no tiene números conectados");

  // 3. Que los mensajes de ese número lleguen a nuestro webhook
  await graph(fetchImpl, `${GRAPH}/${input.wabaId}/subscribed_apps`, { method: "POST", headers: auth });

  // 4. Número nuevo: hay que registrarlo en la Cloud API con un PIN de 6 dígitos.
  //    Con coexistencia el número ya está activo en la app del celular y no se registra.
  let pin: string | null = null;
  if (!input.coexistence) {
    pin = String(Math.floor(100000 + Math.random() * 900000));
    await graph(fetchImpl, `${GRAPH}/${phone.id}/register`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", pin }),
    });
  }

  return { accessToken, wabaId: input.wabaId, phoneNumberId: phone.id, displayPhone: phone.display_phone_number ?? null, pin };
}
