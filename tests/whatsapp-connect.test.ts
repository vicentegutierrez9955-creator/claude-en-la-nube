import { beforeEach, describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { processConversation, receiveCustomerMessage, recordOwnerEcho } from "@/lib/conversations";
import { db } from "@/lib/db";
import { connectWhatsApp } from "@/lib/meta";
import { parseWhatsAppEchoes } from "@/lib/whatsapp";
import { createBusiness, resetDb } from "./helpers/db";

type Call = { url: string; method: string; body?: string };

function fakeMeta(calls: Call[]) {
  return (async (url: string, init?: RequestInit) => {
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? String(init.body) : undefined });
    if (url.includes("/oauth/access_token")) return Response.json({ access_token: "TOKEN-PYME" });
    if (url.includes("/phone_numbers")) return Response.json({ data: [{ id: "PN-123", display_phone_number: "+56 9 8765 4321" }] });
    if (url.endsWith("/subscribed_apps")) return Response.json({ success: true });
    if (url.endsWith("/register")) return Response.json({ success: true });
    return Response.json({ error: { message: "inesperado" } }, { status: 400 });
  }) as typeof fetch;
}

describe("conectar WhatsApp con un botón", () => {
  beforeEach(() => {
    process.env.META_APP_ID = "APP";
    process.env.META_APP_SECRET = "SECRET";
  });

  it("número de la app WhatsApp Business (coexistencia): no se registra de nuevo", async () => {
    const calls: Call[] = [];
    const result = await connectWhatsApp({ code: "CODE", wabaId: "WABA-1", coexistence: true }, fakeMeta(calls));
    expect(result).toMatchObject({ accessToken: "TOKEN-PYME", phoneNumberId: "PN-123", displayPhone: "+56 9 8765 4321", pin: null });
    expect(calls[0].url).toContain("client_id=APP");
    expect(calls[0].url).toContain("code=CODE");
    expect(calls.some((c) => c.url.endsWith("/WABA-1/subscribed_apps") && c.method === "POST")).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/register"))).toBe(false);
  });

  it("número nuevo: se registra en la Cloud API con un PIN", async () => {
    const calls: Call[] = [];
    const result = await connectWhatsApp({ code: "CODE", wabaId: "WABA-1", phoneNumberId: "PN-123", coexistence: false }, fakeMeta(calls));
    const register = calls.find((c) => c.url.endsWith("/PN-123/register"));
    expect(register?.method).toBe("POST");
    expect(JSON.parse(register!.body!).pin).toBe(result.pin);
    expect(result.pin).toMatch(/^\d{6}$/);
  });

  it("muestra el error de Meta si el código expiró", async () => {
    const fail = (async () => Response.json({ error: { message: "Code has expired" } }, { status: 400 })) as unknown as typeof fetch;
    await expect(connectWhatsApp({ code: "OLD", wabaId: "W", coexistence: true }, fail)).rejects.toThrow("Code has expired");
  });
});

describe("respuestas del dueño desde su celular (coexistencia)", () => {
  beforeEach(resetDb);

  it("lee los ecos del webhook", () => {
    const echoes = parseWhatsAppEchoes({
      entry: [
        {
          changes: [
            {
              field: "smb_message_echoes",
              value: {
                metadata: { phone_number_id: "PN-1" },
                message_echoes: [{ from: "56222222222", to: "56911112222", id: "wamid.E1", type: "text", text: { body: "Hola, te escribo yo" } }],
              },
            },
          ],
        },
      ],
    });
    expect(echoes).toEqual([{ phoneNumberId: "PN-1", to: "56911112222", waMessageId: "wamid.E1", text: "Hola, te escribo yo" }]);
  });

  it("pausa al vendedor IA en ese chat y no duplica ecos", async () => {
    const business = await createBusiness();
    const echo = { businessId: business.id, waId: "56911112222", text: "Te atiendo yo 😊", waMessageId: "wamid.E1" };
    await recordOwnerEcho(echo);
    await recordOwnerEcho(echo);
    const conv = await db.conversation.findFirstOrThrow({ where: { businessId: business.id }, include: { messages: true } });
    expect(conv.messages).toHaveLength(1);
    expect(conv.messages[0].author).toBe("HUMANO");
    expect(conv.mode).toBe("HUMANO");
    expect(conv.humanUntil!.getTime()).toBeGreaterThan(Date.now() + 11 * 3600 * 1000);

    // El cliente responde: el bot no contesta mientras dure la pausa.
    const id = await receiveCustomerMessage({ businessId: business.id, waId: "56911112222", profileName: null, text: "ok gracias", waMessageId: "wamid.C2", channel: "WHATSAPP" });
    let aiCalls = 0;
    await processConversation(id!, async () => {
      aiCalls++;
      return {} as Anthropic.Beta.BetaMessage;
    });
    expect(aiCalls).toBe(0);
  });
});
