import { hmacSha256Hex, safeEqualHex } from "./crypto";

// Cliente mínimo de la WhatsApp Cloud API (Meta).
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? "v23.0";

export type IncomingWhatsAppMessage = {
  phoneNumberId: string;
  from: string; // número del cliente, ej: 56912345678
  profileName: string | null;
  waMessageId: string;
  text: string;
};

// Valida el header X-Hub-Signature-256 que Meta firma con el App Secret.
export function verifyWhatsAppSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  return safeEqualHex(header.slice("sha256=".length), hmacSha256Hex(appSecret, rawBody));
}

// Extrae los mensajes de clientes del webhook. Ignora estados (entregado/leído).
export function parseWhatsAppWebhook(body: unknown): IncomingWhatsAppMessage[] {
  const out: IncomingWhatsAppMessage[] = [];
  const entries = (body as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as { changes?: { value?: WebhookValue }[] }[]) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!value || !phoneNumberId) continue;
      const names = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));
      for (const msg of value.messages ?? []) {
        out.push({
          phoneNumberId,
          from: msg.from,
          profileName: names.get(msg.from) ?? null,
          waMessageId: msg.id,
          text: messageToText(msg),
        });
      }
    }
  }
  return out;
}

type WebhookMessage = {
  from: string;
  id: string;
  type: string;
  text?: { body: string };
  button?: { text: string };
  interactive?: { button_reply?: { title: string }; list_reply?: { title: string } };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  image?: { caption?: string };
};

type WebhookValue = {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  messages?: WebhookMessage[];
  // Coexistencia: mensajes que la pyme envió desde la app WhatsApp Business del celular
  message_echoes?: (WebhookMessage & { to: string })[];
};

export type OwnerEcho = {
  phoneNumberId: string;
  to: string; // número del cliente
  waMessageId: string;
  text: string;
};

// Mensajes que el dueño respondió desde su celular (campo smb_message_echoes).
export function parseWhatsAppEchoes(body: unknown): OwnerEcho[] {
  const out: OwnerEcho[] = [];
  const entries = (body as { entry?: unknown[] })?.entry ?? [];
  for (const entry of entries as { changes?: { value?: WebhookValue }[] }[]) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!value || !phoneNumberId) continue;
      for (const echo of value.message_echoes ?? []) {
        out.push({ phoneNumberId, to: echo.to, waMessageId: echo.id, text: messageToText(echo).replace(/^\[El cliente /, "[La tienda ") });
      }
    }
  }
  return out;
}

function messageToText(msg: WebhookMessage): string {
  switch (msg.type) {
    case "text":
      return msg.text?.body ?? "";
    case "button":
      return msg.button?.text ?? "";
    case "interactive":
      return msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? "";
    case "location": {
      const l = msg.location;
      return `[Ubicación compartida] ${l?.name ?? ""} ${l?.address ?? ""} (${l?.latitude}, ${l?.longitude})`.trim();
    }
    case "image":
      return `[El cliente envió una imagen]${msg.image?.caption ? ` ${msg.image.caption}` : ""}`;
    case "audio":
      return "[El cliente envió un audio de voz, que no se puede escuchar]";
    default:
      return `[El cliente envió un mensaje de tipo ${msg.type}]`;
  }
}

export async function sendWhatsAppText(opts: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  text: string;
}): Promise<string | null> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${opts.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: opts.to,
      type: "text",
      text: { body: opts.text.slice(0, 4096), preview_url: true },
    }),
  });
  if (!res.ok) {
    throw new Error(`WhatsApp respondió ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { messages?: { id: string }[] };
  return data.messages?.[0]?.id ?? null;
}
