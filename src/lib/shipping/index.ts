import type { Business } from "@prisma/client";
import { decryptSecret } from "../crypto";
import { BlueExpressShipping } from "./bluexpress";
import { SimulatedShipping } from "./simulated";
import type { ShippingProvider } from "./types";

export function shippingProviderFor(business: Business): ShippingProvider {
  if (business.shippingProvider === "bluexpress") {
    const token = decryptSecret(business.bxToken);
    const userCode = decryptSecret(business.bxUserCode);
    const clientAccount = decryptSecret(business.bxClientAccount);
    if (!token || !userCode || !clientAccount) {
      throw new Error("Faltan las credenciales de Blue Express en Configuración");
    }
    return new BlueExpressShipping({ token, userCode, clientAccount });
  }
  return new SimulatedShipping();
}

export type { ShippingProvider, ShipmentRequest, ShipmentResult } from "./types";
