import { db } from "@/lib/db";

export async function resetDb() {
  // Los ítems de pedido apuntan a productos: se borran los pedidos primero.
  await db.order.deleteMany();
  await db.business.deleteMany();
}

export async function createBusiness(botMode: "MENU" | "HIBRIDO" | "IA" = "IA") {
  return db.business.create({
    data: {
      name: "Poleras Valpo",
      botMode,
      shippingFlatRate: 3990,
      originAddress: "Av. Brasil 100",
      originComuna: "Valparaíso",
      originRegion: "Valparaíso",
      products: {
        create: [
          { name: "Polera negra M", price: 12990, stock: 5, weightGrams: 300 },
          { name: "Gorro de lana", price: 8990, stock: 2 },
        ],
      },
    },
  });
}

