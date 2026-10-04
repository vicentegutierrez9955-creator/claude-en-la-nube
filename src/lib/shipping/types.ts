export type ShipmentRequest = {
  orderId: string;
  orderNumber: number;
  businessName: string;
  origin: { name: string; phone: string; address: string; comuna: string; region: string };
  recipient: {
    name: string;
    phone: string;
    rut?: string | null;
    street: string;
    number: string;
    apartment?: string | null;
    comuna: string;
    region: string;
    notes?: string | null;
  };
  packages: { weightGrams: number; pieces: number };
  declaredValue: number;
  itemsDescription: string;
};

export type ShipmentResult = {
  carrier: string;
  trackingNumber: string;
  labelPdf: Uint8Array;
};

export interface ShippingProvider {
  readonly name: string;
  createShipment(req: ShipmentRequest): Promise<ShipmentResult>;
}
