import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCLP } from "@/lib/format";
import { simulatePaymentAction } from "../../panel/actions";

// Página de pago de prueba para cuando Mercado Pago aún no está conectado.
// Solo el dueño de la tienda (con sesión iniciada) puede aprobar el pago.
export default async function SimulatedPaymentPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await currentUser();
  if (!user) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-xl font-bold">Pago de prueba</h1>
        <p className="mt-2 text-gray-600">
          Esta tienda todavía no conecta Mercado Pago. Solo el dueño de la tienda puede aprobar pagos de prueba.
        </p>
        <Link href="/login" className="btn-primary mt-6">
          Entrar como tienda
        </Link>
      </main>
    );
  }
  const order = await db.order.findFirst({
    where: { id: orderId, businessId: user.businessId },
    include: { items: true },
    omit: { labelPdf: true },
  });
  if (!order) notFound();

  return (
    <main className="mx-auto max-w-md px-4 py-20">
      <div className="card space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Pago simulado · no se cobra dinero</p>
        <h1 className="text-xl font-bold">Pedido #{order.number}</h1>
        <ul className="text-sm">
          {order.items.map((i) => (
            <li key={i.id}>
              {i.quantity} x {i.name}
            </li>
          ))}
        </ul>
        <p className="text-2xl font-bold">{formatCLP(order.total)}</p>
        {order.status === "PENDIENTE_PAGO" ? (
          <form action={simulatePaymentAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="back" value={`/gracias/${order.id}`} />
            <button className="btn-primary w-full">Aprobar pago de prueba</button>
          </form>
        ) : (
          <p className="text-sm text-gray-600">Este pedido ya no está esperando pago.</p>
        )}
      </div>
    </main>
  );
}
