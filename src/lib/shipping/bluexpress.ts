import type { ShipmentRequest, ShipmentResult, ShippingProvider } from "./types";

// Integración con la API de Blue Express (BX-Emission).
//
// IMPORTANTE: Blue Express entrega la documentación de la API y las credenciales
// (BX-TOKEN, BX-USERCODE, BX-CLIENT_ACCOUNT) al firmar como cliente empresa
// (developers.bluex.cl). La URL y el formato exacto del cuerpo deben validarse
// contra esa documentación en ambiente QA antes de salir a producción. Todo lo
// específico de Blue Express está en este archivo para que el ajuste sea en un solo lugar.

const EMISSION_URL = process.env.BLUEX_EMISSION_URL ?? "https://apigw.bluex.cl/api/integrations/emission/v1/emissions";

export type BlueExpressCredentials = { token: string; userCode: string; clientAccount: string };

export class BlueExpressShipping implements ShippingProvider {
  readonly name = "Blue Express";

  constructor(
    private readonly creds: BlueExpressCredentials,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  buildEmissionBody(req: ShipmentRequest) {
    return {
      printFormatCode: 4, // PDF 10x15
      orderNumber: String(req.orderNumber),
      references: [req.orderId],
      serviceType: "EX", // Express
      productType: "P", // Paquete
      productCategory: "PAQU",
      currency: "CLP",
      declaredValue: req.declaredValue,
      packages: [
        {
          weight: Math.max(0.1, req.packages.weightGrams / 1000),
          weightUnit: "KG",
          pieces: req.packages.pieces,
          extendedClaim: false,
          content: req.itemsDescription.slice(0, 120),
        },
      ],
      shipper: {
        name: req.origin.name || req.businessName,
        phone: req.origin.phone,
        address: {
          fullAddress: req.origin.address,
          districtName: req.origin.comuna,
          regionName: req.origin.region,
        },
      },
      consignee: {
        name: req.recipient.name,
        phone: req.recipient.phone,
        documentNumber: req.recipient.rut ?? undefined,
        address: {
          streetName: req.recipient.street,
          streetNumber: req.recipient.number,
          complement: req.recipient.apartment ?? undefined,
          districtName: req.recipient.comuna,
          regionName: req.recipient.region,
          reference: req.recipient.notes ?? undefined,
        },
      },
    };
  }

  async createShipment(req: ShipmentRequest): Promise<ShipmentResult> {
    const res = await this.fetchImpl(EMISSION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "BX-TOKEN": this.creds.token,
        "BX-USERCODE": this.creds.userCode,
        "BX-CLIENT_ACCOUNT": this.creds.clientAccount,
      },
      body: JSON.stringify(this.buildEmissionBody(req)),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Blue Express respondió ${res.status}: ${text.slice(0, 500)}`);
    const data = JSON.parse(text) as unknown;

    const trackingNumber = findString(data, ["trackingNumber", "tracking", "numeroSeguimiento", "nroOS", "os"]);
    const labelBase64 = findString(data, ["label", "labels", "labelBase64", "etiqueta", "pdf"]);
    if (!trackingNumber || !labelBase64) {
      throw new Error(`Respuesta de Blue Express sin seguimiento o etiqueta: ${text.slice(0, 500)}`);
    }
    return {
      carrier: this.name,
      trackingNumber,
      labelPdf: new Uint8Array(Buffer.from(labelBase64, "base64")),
    };
  }
}

// Busca recursivamente el primer string no vacío bajo alguna de las llaves dadas.
function findString(node: unknown, keys: string[]): string | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findString(item, keys);
      if (found) return found;
    }
    return null;
  }
  const record = node as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
    if (typeof value === "number") return String(value);
    if (value && typeof value === "object") {
      const found = findString(value, ["base64", "content", "data", ...keys]);
      if (found) return found;
    }
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") {
      const found = findString(value, keys);
      if (found) return found;
    }
  }
  return null;
}
