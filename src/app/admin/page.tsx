import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { AI_MODELS, DEFAULT_MODEL, modelLabel, startOfMonthChile, usdToClp } from "@/lib/ai-usage";
import { requireAdmin } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { db } from "@/lib/db";
import { formatCLP } from "@/lib/format";
import { setBusinessAiAction } from "./actions";

const MODE_LABEL = { MENU: "Solo menú", HIBRIDO: "Híbrido", IA: "IA completa" } as const;

function usd(n: number) {
  return `US$${n.toFixed(2)}`;
}

export default async function AdminPage() {
  await requireAdmin();
  const since = startOfMonthChile();
  const [businesses, usage, sales, aiConversations] = await Promise.all([
    db.business.findMany({ orderBy: { createdAt: "desc" } }),
    db.aiUsage.groupBy({ by: ["businessId"], where: { createdAt: { gte: since } }, _sum: { costUsd: true } }),
    db.order.groupBy({ by: ["businessId"], where: { paidAt: { gte: since } }, _count: true }),
    db.aiUsage.findMany({
      where: { createdAt: { gte: since }, conversationId: { not: null } },
      distinct: ["businessId", "conversationId"],
      select: { businessId: true },
    }),
  ]);
  const costOf = (id: string) => usage.find((u) => u.businessId === id)?._sum.costUsd ?? 0;
  const salesOf = (id: string) => sales.find((s) => s.businessId === id)?._count ?? 0;
  const convsOf = (id: string) => aiConversations.filter((c) => c.businessId === id).length;
  const totalCost = usage.reduce((sum, u) => sum + (u._sum.costUsd ?? 0), 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/panel" className="text-sm text-gray-600 hover:underline">
        ← Volver al panel
      </Link>
      <div className="mt-4">
        <PageHeader
          title={`Administración de ${BRAND}`}
          subtitle={`Consumo de IA de este mes en todas las tiendas: ${usd(totalCost)} (≈ ${formatCLP(usdToClp(totalCost))}). Modelo por defecto: ${modelLabel(DEFAULT_MODEL)}.`}
        />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Tienda</th>
              <th className="px-3 py-2">Modo</th>
              <th className="px-3 py-2">Ventas del mes</th>
              <th className="px-3 py-2">Chats con IA</th>
              <th className="px-3 py-2">Costo IA del mes</th>
              <th className="px-3 py-2">Costo IA por venta</th>
              <th className="px-3 py-2">Modelo y tope mensual</th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((b) => {
              const cost = costOf(b.id);
              const count = salesOf(b.id);
              const over = b.aiMonthlyLimitUsd > 0 && cost >= b.aiMonthlyLimitUsd;
              return (
                <tr key={b.id} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-3 font-medium">{b.name}</td>
                  <td className="px-3 py-3">{MODE_LABEL[b.botMode]}</td>
                  <td className="px-3 py-3">{count}</td>
                  <td className="px-3 py-3">{convsOf(b.id)}</td>
                  <td className="px-3 py-3">
                    {usd(cost)}
                    <span className="block text-xs text-gray-500">≈ {formatCLP(usdToClp(cost))}</span>
                    {over && <span className="mt-1 block text-xs font-semibold text-red-600">Tope alcanzado: atiende solo con menú</span>}
                  </td>
                  <td className="px-3 py-3">{count > 0 ? formatCLP(usdToClp(cost / count)) : "—"}</td>
                  <td className="px-3 py-3">
                    <form action={setBusinessAiAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="businessId" value={b.id} />
                      <select name="aiModel" defaultValue={b.aiModel ?? ""} className="input w-auto py-1.5">
                        <option value="">Por defecto ({modelLabel(DEFAULT_MODEL)})</option>
                        {AI_MODELS.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label} — {m.note}
                          </option>
                        ))}
                      </select>
                      <label className="text-xs text-gray-600">
                        Tope US$/mes (0 = sin tope)
                        <input
                          name="aiMonthlyLimitUsd"
                          type="number"
                          step="0.5"
                          min="0"
                          defaultValue={b.aiMonthlyLimitUsd}
                          className="input mt-1 w-28 py-1.5"
                        />
                      </label>
                      <button className="btn-secondary py-1.5">Guardar</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Costos calculados con los precios oficiales por token de cada modelo y un tipo de cambio de {usdToClp(1)} CLP/USD (variable
        USD_CLP). Cuando una tienda llega a su tope, el vendedor sigue atendiendo con el menú automático hasta el próximo mes.
      </p>
    </main>
  );
}
