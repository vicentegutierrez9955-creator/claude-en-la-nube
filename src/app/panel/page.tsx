import Link from "next/link";
import { ConnectWhatsApp } from "@/components/connect-whatsapp";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { monthlyAiSummary, usdToClp } from "@/lib/ai-usage";
import { formatCLP } from "@/lib/format";
import { embeddedSignupReady, GRAPH_VERSION, metaConfig } from "@/lib/meta";
import { addDays, localToUtc, todayYmd } from "@/lib/agenda";
import { appUrl } from "@/lib/orders";

type Card = { label: string; value: string | number; sub?: string; href?: string };

function Cards({ cards }: { cards: Card[] }) {
  return (
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
  );
}

function Setup({ items, title }: { items: { done: boolean; text: string; href: string }[]; title: string }) {
  if (!items.some((s) => !s.done)) return null;
  return (
    <div className="card mt-8">
      <h2 className="font-bold">{title}</h2>
      <ul className="mt-3 space-y-2">
        {items.map((s) => (
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
        Mientras tanto, prueba al asistente en el{" "}
        <Link href="/panel/simulador" className="font-semibold text-brand-700">
          simulador
        </Link>
        .
      </p>
    </div>
  );
}

// Resumen de un negocio que atiende con hora.
async function AgendaHome({ businessId, firstName }: { businessId: string; firstName: string }) {
  const today = todayYmd();
  const range = (from: string, days: number) => ({ gte: localToUtc(from, 0), lt: localToUtc(addDays(from, days), 0) });
  const active = { in: ["RESERVADA", "CONFIRMADA"] as ("RESERVADA" | "CONFIRMADA")[] };
  const [todayCount, tomorrowCount, unconfirmed, needsHuman, services, hours, b] = await Promise.all([
    db.appointment.count({ where: { businessId, status: active, startsAt: range(today, 1) } }),
    db.appointment.count({ where: { businessId, status: active, startsAt: range(addDays(today, 1), 1) } }),
    db.appointment.count({ where: { businessId, status: "RESERVADA", startsAt: range(today, 7) } }),
    db.conversation.count({ where: { businessId, needsHuman: true } }),
    db.service.count({ where: { businessId, active: true } }),
    db.workingHour.count({ where: { businessId } }),
    db.business.findUniqueOrThrow({ where: { id: businessId } }),
  ]);
  const whatsappConnected = Boolean(b.whatsappPhoneNumberId && b.whatsappAccessToken);
  const meta = metaConfig();
  return (
    <>
      <PageHeader title={`Hola, ${firstName} 👋`} subtitle="Así va tu agenda." />
      {!whatsappConnected && embeddedSignupReady() && (
        <div className="card mb-6 border-brand-500 bg-brand-50">
          <h2 className="text-lg font-bold">Conecta tu WhatsApp y deja que tus pacientes reserven solos</h2>
          <p className="mb-4 mt-1 text-sm text-gray-700">Un clic, inicias sesión con Facebook, eliges tu número y listo.</p>
          <ConnectWhatsApp appId={meta.appId} configId={meta.configId} graphVersion={GRAPH_VERSION} />
        </div>
      )}
      <Cards
        cards={[
          { label: "Horas hoy", value: todayCount, href: "/panel/agenda" },
          { label: "Horas mañana", value: tomorrowCount, href: `/panel/agenda?dia=${addDays(today, 1)}` },
          { label: "Sin confirmar (7 días)", value: unconfirmed, href: "/panel/agenda" },
          { label: "Chats que necesitan a alguien", value: needsHuman, href: "/panel/conversaciones" },
        ]}
      />
      {b.slug && (
        <div className="card mt-4 text-sm">
          <span className="font-semibold">Tu página de reservas:</span>{" "}
          <a href={`/reservar/${b.slug}`} target="_blank" className="text-brand-700 underline" rel="noreferrer">
            {appUrl()}/reservar/{b.slug}
          </a>
          <span className="text-gray-500"> · ponla en tu web, Instagram o Google Maps.</span>
        </div>
      )}
      <Setup
        title="Deja tu agenda funcionando"
        items={[
          { done: services > 0, text: "Agrega tus servicios", href: "/panel/servicios" },
          { done: hours > 0, text: "Configura tu horario", href: "/panel/horario" },
          { done: Boolean(b.slug), text: "Elige la dirección de tu página de reservas", href: "/panel/horario" },
          { done: Boolean(b.serviceAddress), text: "Escribe la dirección donde atiendes", href: "/panel/horario" },
          { done: whatsappConnected, text: "Conecta tu WhatsApp", href: "/panel/configuracion#whatsapp" },
        ]}
      />
    </>
  );
}

export default async function PanelHome() {
  const user = await requireUser();
  if (user.business.kind === "AGENDA") return <AgendaHome businessId={user.businessId} firstName={user.name.split(" ")[0]} />;
  const businessId = user.businessId;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [byStatus, needsHuman, salesToday, productCount, b, ai] = await Promise.all([
    db.order.groupBy({ by: ["status"], where: { businessId }, _count: true }),
    db.conversation.count({ where: { businessId, needsHuman: true } }),
    db.order.aggregate({ where: { businessId, paidAt: { gte: startOfDay } }, _sum: { total: true }, _count: true }),
    db.product.count({ where: { businessId } }),
    db.business.findUniqueOrThrow({ where: { id: businessId } }),
    monthlyAiSummary(businessId),
  ]);
  const count = (s: string) => byStatus.find((x) => x.status === s)?._count ?? 0;

  const setup = [
    { done: productCount > 0, text: "Carga tus productos", href: "/panel/productos" },
    { done: Boolean(b.whatsappPhoneNumberId && b.whatsappAccessToken), text: "Conecta tu WhatsApp", href: "/panel/configuracion#whatsapp" },
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
  const overLimit = b.aiMonthlyLimitUsd > 0 && ai.costUsd >= b.aiMonthlyLimitUsd;
  const whatsappConnected = Boolean(b.whatsappPhoneNumberId && b.whatsappAccessToken);
  const meta = metaConfig();

  return (
    <>
      <PageHeader title={`Hola, ${user.name.split(" ")[0]} 👋`} subtitle="Así va tu tienda hoy." />
      {!whatsappConnected && embeddedSignupReady() && (
        <div className="card mb-6 border-brand-500 bg-brand-50">
          <h2 className="text-lg font-bold">Conecta tu WhatsApp y empieza a vender en automático</h2>
          <p className="mb-4 mt-1 text-sm text-gray-700">Un clic, inicias sesión con Facebook, eliges tu número y listo.</p>
          <ConnectWhatsApp appId={meta.appId} configId={meta.configId} graphVersion={GRAPH_VERSION} />
        </div>
      )}

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

      <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div>
          <span className="font-semibold">Uso de IA este mes:</span> {formatCLP(usdToClp(ai.costUsd))} en {ai.conversations}{" "}
          {ai.conversations === 1 ? "conversación" : "conversaciones"}
          {b.aiMonthlyLimitUsd > 0 && <span className="text-gray-500"> · tope del plan {formatCLP(usdToClp(b.aiMonthlyLimitUsd))}</span>}
        </div>
        {overLimit && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            Llegaste al tope: el bot atiende solo con menú hasta fin de mes
          </span>
        )}
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
