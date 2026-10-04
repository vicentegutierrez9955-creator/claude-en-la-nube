import type { OrderStatus, Prisma } from "@prisma/client";
import Link from "next/link";
import { PageHeader, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCLP, formatDate } from "@/lib/format";
import { dispatchOrdersAction } from "../actions";

const FILTERS: [string, string, OrderStatus[] | null][] = [
  ["por-despachar", "Por despachar", ["PAGADO", "ETIQUETA_LISTA"]],
  ["PENDIENTE_PAGO", "Esperando pago", ["PENDIENTE_PAGO"]],
  ["DESPACHADO", "Despachados", ["DESPACHADO"]],
  ["todos", "Todos", null],
];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const user = await requireUser();
  const { estado = "por-despachar" } = await searchParams;
  const filter = FILTERS.find(([key]) => key === estado) ?? FILTERS[0];

  const where: Prisma.OrderWhereInput = {
    businessId: user.businessId,
    status: filter[2] ? { in: filter[2] } : { not: "BORRADOR" },
  };
  const orders = await db.order.findMany({
    where,
    include: { customer: true, items: true },
    omit: { labelPdf: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <>
      <PageHeader title="Pedidos" subtitle="Selecciona pedidos para imprimir todas sus etiquetas de una vez." />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map(([key, label]) => (
          <Link
            key={key}
            href={`/panel/pedidos?estado=${key}`}
            className={`rounded-full px-3 py-1 text-sm font-medium ${key === filter[0] ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <form className="card overflow-x-auto p-0">
        <div className="flex flex-wrap gap-2 border-b border-gray-200 p-3">
          <button formAction="/api/etiquetas" formMethod="get" formTarget="_blank" className="btn-primary">
            🖨️ Imprimir etiquetas seleccionadas
          </button>
          <button formAction={dispatchOrdersAction} className="btn-secondary">
            🚚 Marcar como despachados
          </button>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="w-10 px-3 py-2"></th>
              <th className="px-3 py-2">N°</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Productos</th>
              <th className="px-3 py-2">Comuna</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-gray-500">
                  No hay pedidos aquí todavía.
                </td>
              </tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2">
                  <input type="checkbox" name="ids" value={o.id} disabled={!o.labelCreatedAt} />
                </td>
                <td className="px-3 py-2 font-semibold">
                  <Link href={`/panel/pedidos/${o.id}`} className="text-brand-700 hover:underline">
                    #{o.number}
                  </Link>
                </td>
                <td className="px-3 py-2">{o.recipientName ?? o.customer.name ?? `+${o.customer.waId}`}</td>
                <td className="max-w-xs truncate px-3 py-2 text-gray-600">
                  {o.items.map((i) => `${i.quantity}x ${i.name}`).join(", ")}
                </td>
                <td className="px-3 py-2">{o.comuna}</td>
                <td className="px-3 py-2">{formatCLP(o.total)}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={o.status} />
                  {o.shipmentError && <span className="ml-1 text-xs text-red-600">⚠️ error de envío</span>}
                  {o.labelPrintedAt && o.status === "ETIQUETA_LISTA" && <span className="ml-1 text-xs text-gray-500">impresa</span>}
                </td>
                <td className="px-3 py-2 text-gray-500">{formatDate(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </form>
    </>
  );
}
