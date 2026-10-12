import { db } from "@/lib/db";

// Página a la que vuelve el cliente después de pagar en Mercado Pago.
export default async function ThanksPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { number: true, business: { select: { name: true } } },
  });
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 text-center">
      <div className="text-5xl">🎉</div>
      <h1 className="mt-4 text-2xl font-bold">¡Gracias por tu compra!</h1>
      <p className="mt-2 text-gray-600">
        {order ? `${order.business.name} recibió tu pedido #${order.number}.` : "Recibimos tu pedido."} Te confirmaremos el pago y el
        número de seguimiento por WhatsApp.
      </p>
      <p className="mt-6 text-sm text-gray-500">Ya puedes cerrar esta página y volver a WhatsApp.</p>
    </main>
  );
}
