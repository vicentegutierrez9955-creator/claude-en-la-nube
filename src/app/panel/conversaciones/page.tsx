import Link from "next/link";
import { AutoRefresh } from "@/components/auto-refresh";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

export default async function ConversationsPage() {
  const user = await requireUser();
  const conversations = await db.conversation.findMany({
    where: { businessId: user.businessId, channel: "WHATSAPP" },
    include: { customer: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: [{ needsHuman: "desc" }, { lastMessageAt: "desc" }],
    take: 100,
  });

  return (
    <>
      <AutoRefresh seconds={10} />
      <PageHeader title="Conversaciones" subtitle="El vendedor IA atiende solo. Entra cuando un chat necesite a alguien." />
      <div className="card divide-y divide-gray-100 p-0">
        {conversations.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-gray-500">Aún no te han escrito por WhatsApp.</p>
        )}
        {conversations.map((c) => (
          <Link key={c.id} href={`/panel/conversaciones/${c.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                {c.customer.name ?? "Sin nombre"} <span className="font-normal text-gray-500">+{c.customer.waId}</span>
              </p>
              <p className="truncate text-sm text-gray-600">{c.messages[0]?.text}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-xs text-gray-500">{formatDate(c.lastMessageAt)}</span>
              {c.needsHuman ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Necesita a alguien</span>
              ) : c.mode === "HUMANO" ? (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">Atiende el equipo</span>
              ) : (
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">Bot</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
