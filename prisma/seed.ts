// Datos de demostración: npm run db:seed
// Crea la tienda "Tienda Demo" con usuario demo@pedidosaltoque.cl / demo1234.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { markOrderPaid } from "../src/lib/orders";

const db = new PrismaClient();

async function main() {
  await db.user.deleteMany({ where: { email: "demo@pedidosaltoque.cl" } });
  const old = await db.business.findMany({ where: { name: "Tienda Demo" } });
  await db.order.deleteMany({ where: { businessId: { in: old.map((b) => b.id) } } });
  await db.business.deleteMany({ where: { id: { in: old.map((b) => b.id) } } });

  const business = await db.business.create({
    data: {
      name: "Tienda Demo",
      shippingFlatRate: 3990,
      freeShippingFrom: 40000,
      originName: "Tienda Demo",
      originPhone: "+56 9 1234 5678",
      originAddress: "Av. Providencia 1234, of. 56",
      originComuna: "Providencia",
      originRegion: "Metropolitana de Santiago",
      botMode: "MENU",
      botInstructions: "Despachamos de lunes a viernes. Se aceptan cambios de talla dentro de 10 días.",
      faqs: {
        create: [
          { position: 1, question: "¿Hacen envíos a regiones?", keywords: "envio, regiones, despacho, llega, demora", answer: "¡Sí! Enviamos a todo Chile con Blue Express 🚚 Despachamos de lunes a viernes y llega en 2 a 5 días hábiles. El envío cuesta $3.990 y es gratis sobre $40.000." },
          { position: 2, question: "¿Puedo cambiar la talla?", keywords: "cambio, talla, devolucion, devolver", answer: "Claro, aceptamos cambios de talla dentro de 10 días desde que recibes tu pedido. Escribe *persona* y te ayudamos con el cambio." },
          { position: 3, question: "¿Cómo puedo pagar?", keywords: "pagar, pago, transferencia, tarjeta, credito, debito, cuotas", answer: "Pagas con el link de Mercado Pago que te enviamos al cerrar el pedido: débito, crédito (en cuotas) o saldo de Mercado Pago 💳" },
          { position: 4, question: "¿Tienen tienda física?", keywords: "tienda fisica, local, retiro, retirar, direccion", answer: "Por ahora vendemos solo online y despachamos a domicilio 📦" },
        ],
      },
      users: {
        create: { email: "demo@pedidosaltoque.cl", name: "Camila Demo", passwordHash: await bcrypt.hash("demo1234", 10) },
      },
      products: {
        create: [
          { name: "Polera algodón negra", sku: "POL-NEG", price: 12990, stock: 25, weightGrams: 250, description: "100% algodón. Tallas S, M, L y XL. Corte regular." },
          { name: "Polera algodón blanca", sku: "POL-BLA", price: 12990, stock: 18, weightGrams: 250, description: "100% algodón. Tallas S, M, L y XL." },
          { name: "Polerón canguro gris", sku: "POLR-GRI", price: 29990, stock: 7, weightGrams: 650, description: "Algodón perchado, con capucha. Tallas M y L." },
          { name: "Jockey bordado", sku: "JOC-01", price: 9990, stock: 30, weightGrams: 150, description: "Ajustable, talla única. Colores negro y beige." },
          { name: "Tote bag lona", sku: "TOT-01", price: 7990, stock: 0, weightGrams: 200, description: "Lona cruda 40x35 cm." },
        ],
      },
    },
    include: { products: true },
  });

  const people = [
    { waId: "56987654321", name: "Ignacio Rojas", street: "Los Carrera", number: "1420", comuna: "Concepción", region: "Biobío" },
    { waId: "56911223344", name: "Valentina Soto", street: "Av. Libertad", number: "870", comuna: "Viña del Mar", region: "Valparaíso" },
    { waId: "56955667788", name: "Matías Fuentes", street: "Irarrázaval", number: "3050", comuna: "Ñuñoa", region: "Metropolitana de Santiago" },
  ];

  for (const [i, p] of people.entries()) {
    const customer = await db.customer.create({ data: { businessId: business.id, waId: p.waId, name: p.name } });
    const conversation = await db.conversation.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        lastAgentRunAt: new Date(),
        needsHuman: i === 2,
        handoffReason: i === 2 ? "Quiere cambiar una talla de un pedido anterior" : null,
        mode: i === 2 ? "HUMANO" : "BOT",
        messages: {
          create: [
            { direction: "ENTRANTE", author: "CLIENTE", text: "Hola! tienen la polera negra en M?", processed: true },
            { direction: "SALIENTE", author: "BOT", text: "¡Hola! Sí, nos quedan poleras negras en talla M a $12.990 😊 ¿Cuántas quieres?", processed: true },
          ],
        },
      },
    });
    const product = business.products[i % 3];
    const b = await db.business.update({ where: { id: business.id }, data: { orderSeq: { increment: 1 } } });
    const qty = i + 1;
    const subtotal = product.price * qty;
    const order = await db.order.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        conversationId: conversation.id,
        number: b.orderSeq,
        status: "PENDIENTE_PAGO",
        recipientName: p.name,
        recipientPhone: p.waId,
        street: p.street,
        streetNumber: p.number,
        comuna: p.comuna,
        region: p.region,
        subtotal,
        shippingCost: 3990,
        total: subtotal + 3990,
        paymentUrl: "https://www.mercadopago.cl/checkout/demo",
        items: { create: { productId: product.id, name: product.name, unitPrice: product.price, quantity: qty } },
      },
    });
    if (i < 2) await markOrderPaid(order.id, null);
  }

  console.log("Listo. Entra con demo@pedidosaltoque.cl / demo1234");
}

main().finally(() => db.$disconnect());
