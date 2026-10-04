import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/components/auto-refresh";
import { ChatMessages } from "@/components/chat";
import { PageHeader, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCLP } from "@/lib/format";
import { sendManualMessageAction, setConversationModeAction } from "../../actions";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const conversation = await db.conversation.findFirst({
    where: { id, businessId: user.businessId },
    include: {
      customer: true,
      messages: { orderBy: { createdAt: "asc" }, take: 300 },
      orders: { orderBy: { createdAt: "desc" }, take: 5, omit: { labelPdf: true } },
    },
  });
  if (!conversation) notFound();
  const botActive = conversation.mode === "BOT";

  return (
    <>
      <AutoRefresh seconds={5} />
      <PageHeader title={conversation.customer.name ?? "Cliente"} subtitle={`+${conversation.customer.waId}`}>
        <form action={setConversationModeAction}>
          <input type="hidden" name="conversationId" value={conversation.id} />
          <input type="hidden" name="mode" value={botActive ? "HUMANO" : "BOT"} />
          <button className={botActive ? "btn-secondary" : "btn-primary"}>
            {botActive ? "✋ Tomar el control" : "🤖 Devolver al vendedor IA"}
          </button>
        </form>
      </PageHeader>

      {conversation.needsHuman && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Este chat necesita a alguien del equipo{conversation.handoffReason ? `: ${conversation.handoffReason}` : "."}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            <ChatMessages messages={conversation.messages} />
          </div>
          <form action={sendManualMessageAction} className="mt-4 flex gap-2 border-t border-gray-100 pt-4">
            <input type="hidden" name="conversationId" value={conversation.id} />
            <input name="text" className="input" placeholder="Escribe como la tienda (pausa al bot en este chat)" autoComplete="off" />
            <button className="btn-primary">Enviar</button>
          </form>
        </div>
        <div className="card">
          <h2 className="mb-3 font-bold">Pedidos</h2>
          {conversation.orders.length === 0 && <p className="text-sm text-gray-500">Sin pedidos aún.</p>}
          <ul className="space-y-2 text-sm">
            {conversation.orders.map((o) => (
              <li key={o.id}>
                <Link href={`/panel/pedidos/${o.id}`} className="flex items-center justify-between gap-2 hover:underline">
                  <span>
                    #{o.number} · {formatCLP(o.total)}
                  </span>
                  <StatusBadge status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
