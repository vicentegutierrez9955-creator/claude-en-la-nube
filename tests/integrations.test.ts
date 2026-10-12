import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { verifyMercadoPagoSignature } from "@/lib/mercadopago";
import { BlueExpressShipping } from "@/lib/shipping/bluexpress";
import type { ShipmentRequest } from "@/lib/shipping/types";
import { parseWhatsAppWebhook, verifyWhatsAppSignature } from "@/lib/whatsapp";

describe("cifrado de credenciales", () => {
  it("cifra y descifra", () => {
    const enc = encryptSecret("APP_USR-123");
    expect(enc).not.toContain("APP_USR");
    expect(decryptSecret(enc)).toBe("APP_USR-123");
    expect(decryptSecret(null)).toBeNull();
  });
});

describe("WhatsApp", () => {
  it("valida la firma del webhook", () => {
    const body = JSON.stringify({ hola: "mundo" });
    const sig = "sha256=" + createHmac("sha256", "secreto").update(body).digest("hex");
    expect(verifyWhatsAppSignature(body, sig, "secreto")).toBe(true);
    expect(verifyWhatsAppSignature(body, sig, "otro")).toBe(false);
    expect(verifyWhatsAppSignature(body, null, "secreto")).toBe(false);
  });

  it("extrae los mensajes del webhook e ignora estados", () => {
    const parsed = parseWhatsAppWebhook({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PN1" },
                contacts: [{ wa_id: "56911112222", profile: { name: "Ana" } }],
                messages: [
                  { from: "56911112222", id: "wamid.1", type: "text", text: { body: "hola!" } },
                  { from: "56911112222", id: "wamid.2", type: "audio" },
                ],
              },
            },
            { value: { metadata: { phone_number_id: "PN1" }, statuses: [{ id: "wamid.x", status: "read" }] } },
          ],
        },
      ],
    });
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ phoneNumberId: "PN1", from: "56911112222", profileName: "Ana", waMessageId: "wamid.1", text: "hola!" });
    expect(parsed[1].text).toContain("audio");
  });
});

describe("Mercado Pago", () => {
  it("valida x-signature", () => {
    const ts = "1704908010";
    const manifest = `id:123456;request-id:req-1;ts:${ts};`;
    const v1 = createHmac("sha256", "clave").update(manifest).digest("hex");
    const ok = verifyMercadoPagoSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: "req-1", dataId: "123456", secret: "clave" });
    expect(ok).toBe(true);
    const bad = verifyMercadoPagoSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: "req-2", dataId: "123456", secret: "clave" });
    expect(bad).toBe(false);
  });
});

describe("Blue Express", () => {
  const req: ShipmentRequest = {
    orderId: "ord_1",
    orderNumber: 7,
    businessName: "Tienda",
    origin: { name: "Tienda", phone: "+56222222222", address: "Av. Uno 123", comuna: "Providencia", region: "Metropolitana de Santiago" },
    recipient: {
      name: "Ana Pérez",
      phone: "56911112222",
      street: "Los Aromos",
      number: "45",
      comuna: "Viña del Mar",
      region: "Valparaíso",
    },
    packages: { weightGrams: 1200, pieces: 1 },
    declaredValue: 25980,
    itemsDescription: "2x Polera",
  };

  it("envía los headers de autenticación y lee seguimiento y etiqueta", async () => {
    let seen: RequestInit | undefined;
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      seen = init;
      return new Response(JSON.stringify({ data: { trackingNumber: "BX123", labels: [{ base64: Buffer.from("%PDF-1.4").toString("base64") }] } }));
    }) as typeof fetch;
    const bx = new BlueExpressShipping({ token: "t", userCode: "u", clientAccount: "c" }, fakeFetch);
    const result = await bx.createShipment(req);
    expect(result.trackingNumber).toBe("BX123");
    expect(Buffer.from(result.labelPdf).toString()).toBe("%PDF-1.4");
    const headers = seen?.headers as Record<string, string>;
    expect(headers["BX-TOKEN"]).toBe("t");
    expect(headers["BX-USERCODE"]).toBe("u");
    expect(headers["BX-CLIENT_ACCOUNT"]).toBe("c");
    const body = JSON.parse(String(seen?.body));
    expect(body.consignee.address.districtName).toBe("Viña del Mar");
    expect(body.packages[0].weight).toBe(1.2);
  });

  it("falla con un mensaje claro si la API responde error", async () => {
    const fakeFetch = (async () => new Response("credenciales inválidas", { status: 401 })) as unknown as typeof fetch;
    const bx = new BlueExpressShipping({ token: "t", userCode: "u", clientAccount: "c" }, fakeFetch);
    await expect(bx.createShipment(req)).rejects.toThrow(/401/);
  });
});
