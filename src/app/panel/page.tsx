import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCLP } from "@/lib/format";

export default async function PanelHome() {
  const user = await requireUser();
  const businessId = user.businessId;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [byStatus, needsHuman, salesToday, productCount, b] = await Promise.all([
    db.order.groupBy({ by: ["status"], where: { businessId }, _count: true }),
    db.conversation.count({ where: { businessId, needsHuman: true } }),
    db.order.aggregate({ where: { businessId, paidAt: { gte: startOfDay } }, _sum: { total: true }, _count: true }),
    db.product.count({ where: { businessId } }),
    db.business.findUniqueOrThrow({ where: { id: businessId } }),
  ]);
  const count = (s: string) => byStatus.find((x) => x.status === s)?._count ?? 0;

  const setup = [
    { done: productCount > 0, text: "Carga tus productos", href: "/panel/productos" },
    { done: Boolean(b.whatsappPhoneNumberId && b.whatsappAccessToken), text: "Conecta tu WhatsApp", href: "/panel/configuracion" },
    { done: Boolean(b.mpAccessToken), text: "Conecta Mercado Pago", href: "/panel/configuracion" },
    { done: b.shippingProvider === "bluexpress", text: "Conecta Blue Express", href: "/panel/configuracion" },
    { done: Boolean(b.originAddress), text: "Ingresa la dirección de despacho", href: "/panel/configuracion" },
  ];

  const cards = [
    { label: "Ventas pagadas hoy", value: formatCLP(salesToday._sum.total ?? 0), sub: `${salesToday._count} pedidos` },
    { label: "Esperando pago", value: count("PENDIENTE_PAGO"), href: "/panel/pedidos?estado=PENDIENTE_PAGO" },
    { label: "Por preparar (pagados)", value: count("PAGADO") + count("ETIQUETA_LISTA"), href: "/panel/pedidos?estado=por-despachar" },
    { label: "Chats que necesitan a alguien", value: needsHuman, href: "/panel/conversaciones" },
  ];

  return (
    <>
      <PageHeader title={`Hola, ${user.name.split(" ")[0]} 👋`} subtitle="Así va tu tienda hoy." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const body = (
            <div className="card h-full">
              <p className="text-sm text-gray-600">{c.label}</p>
              <p className="mt-2 text-3xl font-bold">{c.value}</p>
              {c.sub && <p className="mt-1 text-xs text-gray-500">{c.sub}</p>}
            </div>
          );
          return c.href ? (
            <Link key={c.label} href={c.href} className="hover:opacity-90">
              {body}
            </Link>
          ) : (
            <div key={c.label}>{body}</div>
          );
        })}
      </div>

      {setup.some((s) => !s.done) && (
        <div className="card mt-8">
          <h2 className="font-bold">Deja tu tienda funcionando</h2>
          <ul className="mt-3 space-y-2">
            {setup.map((s) => (
              <li key={s.text} className="flex items-center gap-2 text-sm">
                <span>{s.done ? "✅" : "⬜️"}</span>
                {s.done ? (
                  <span className="text-gray-500 line-through">{s.text}</span>
                ) : (
                  <Link href={s.href} className="font-medium text-brand-700 hover:underline">
                    {s.text}
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-gray-600">
            Mientras tanto, prueba al vendedor automático en el{" "}
            <Link href="/panel/simulador" className="font-semibold text-brand-700">
              simulador
            </Link>
            .
          </p>
        </div>
      )}
    </>
  );
}
