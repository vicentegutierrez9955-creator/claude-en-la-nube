import { randomInt } from "node:crypto";
import { renderLabelPdf } from "./label-pdf";
import type { ShipmentRequest, ShipmentResult, ShippingProvider } from "./types";

// Proveedor de prueba: genera un número de seguimiento falso y una etiqueta PDF real
// para poder probar (y hacer demos) de todo el flujo sin contrato con la paquetería.
export class SimulatedShipping implements ShippingProvider {
  readonly name = "Envío simulado";

  async createShipment(req: ShipmentRequest): Promise<ShipmentResult> {
    const trackingNumber = `SIM${String(randomInt(0, 1e9)).padStart(9, "0")}`;
    const labelPdf = await renderLabelPdf(req, "Envío de prueba", trackingNumber);
    return { carrier: this.name, trackingNumber, labelPdf };
  }
}
