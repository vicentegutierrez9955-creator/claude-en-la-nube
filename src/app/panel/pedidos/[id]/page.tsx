import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCLP, formatDate } from "@/lib/format";
import { createShipmentAction, dispatchOrdersAction, setOrderStatusAction, simulatePaymentAction } from "../../actions";

export const maxDuration = 60;

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const order = await db.order.findFirst({
    where: { id, businessId: user.businessId },
    include: { items: true, customer: true },
    omit: { labelPdf: true },
  });
  if (!order) notFound();

  return (
    <>
      <PageHeader title={`Pedido #${order.number}`} subtitle={`Creado ${formatDate(order.createdAt)}`}>
        {order.labelCreatedAt && (
          <a href={`/api/etiquetas?ids=${order.id}`} target="_blank" className="btn-primary">
            🖨️ Imprimir etiqueta
          </a>
        )}
        {order.status === "PAGADO" && (
          <form action={createShipmentAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <button className="btn-primary">🏷️ Emitir etiqueta</button>
          </form>
        )}
        {order.status === "ETIQUETA_LISTA" && (
          <form action={dispatchOrdersAction}>
            <input type="hidden" name="ids" value={order.id} />
            <button className="btn-secondary">🚚 Marcar despachado</button>
          </form>
        )}
        {order.status === "DESPACHADO" && (
          <form action={setOrderStatusAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="status" value="ENTREGADO" />
            <button className="btn-secondary">Marcar entregado</button>
          </form>
        )}
        {order.status === "PENDIENTE_PAGO" && (
          <form action={setOrderStatusAction}>
            <input type="hidden" name="orderId" value={order.id} />
            <input type="hidden" name="status" value="CANCELADO" />
            <button className="btn-danger">Cancelar pedido</button>
          </form>
        )}
      </PageHeader>

      {order.shipmentError && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se pudo emitir el envío: {order.shipmentError}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-bold">Productos</h2>
            <StatusBadge status={order.status} />
          </div>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id} className="border-t border-gray-100">
                  <td className="py-2">
                    {i.quantity} x {i.name}
                  </td>
                  <td className="py-2 text-right">{formatCLP(i.unitPrice * i.quantity)}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-100 text-gray-600">
                <td className="py-2">Envío</td>
                <td className="py-2 text-right">{formatCLP(order.shippingCost)}</td>
              </tr>
              <tr className="border-t border-gray-200 font-bold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right">{formatCLP(order.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="card text-sm">
            <h2 className="mb-2 font-bold">Despacho</h2>
            <p className="font-medium">{order.recipientName}</p>
            <p>
              {order.street} {order.streetNumber}
              {order.apartment ? `, ${order.apartment}` : ""}
            </p>
            <p>
              {order.comuna}, {order.region}
            </p>
            <p>Tel: {order.recipientPhone}</p>
            {order.recipientRut && <p>RUT: {order.recipientRut}</p>}
            {order.addressNotes && <p className="text-gray-600">Ref: {order.addressNotes}</p>}
            {order.trackingNumber && (
              <p className="mt-3 rounded-lg bg-gray-50 p-2">
                {order.carrier}: <span className="font-mono font-semibold">{order.trackingNumber}</span>
              </p>
            )}
          </div>

          <div className="card text-sm">
            <h2 className="mb-2 font-bold">Pago</h2>
            {order.paidAt ? (
              <p>
                Pagado el {formatDate(order.paidAt)}
                {order.mpPaymentId ? ` · Mercado Pago #${order.mpPaymentId}` : " · pago simulado"}
              </p>
            ) : order.paymentUrl ? (
              <>
                <p className="break-all text-gray-600">Link enviado: {order.paymentUrl}</p>
                <form action={simulatePaymentAction} className="mt-3">
                  <input type="hidden" name="orderId" value={order.id} />
                  <button className="btn-secondary w-full">Marcar como pagado manualmente</button>
                </form>
              </>
            ) : (
              <p className="text-gray-600">Aún no se genera el link de pago.</p>
            )}
          </div>

          {order.conversationId && (
            <Link href={`/panel/conversaciones/${order.conversationId}`} className="btn-secondary w-full">
              💬 Ver conversación
            </Link>
          )}
        </div>
      </div>
    </>
  );
}
