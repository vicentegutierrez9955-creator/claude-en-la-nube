import { ChatMessages } from "@/components/chat";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { simulatorResetAction, simulatorSendAction } from "../actions";
import { SendButton } from "./send-button";

export const maxDuration = 300;

export default async function SimulatorPage() {
  const user = await requireUser();
  const conversation = await db.conversation.findFirst({
    where: { businessId: user.businessId, channel: "SIMULADOR" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  return (
    <>
      <PageHeader
        title="Simulador"
        subtitle="Escríbele a tu vendedor IA como si fueras un cliente. Usa tus productos reales, pero no envía nada por WhatsApp."
      >
        <form action={simulatorResetAction}>
          <button className="btn-secondary">Reiniciar conversación</button>
        </form>
      </PageHeader>
      <div className="mx-auto max-w-2xl rounded-2xl bg-[#efeae2] p-4 shadow-inner">
        <div className="max-h-[60vh] min-h-64 overflow-y-auto pr-1">
          <ChatMessages messages={conversation?.messages ?? []} />
        </div>
        <form action={simulatorSendAction} className="mt-4 flex gap-2">
          <input name="text" className="input" placeholder="Hola! tienen poleras talla M?" autoComplete="off" required />
          <SendButton />
        </form>
      </div>
      <p className="mx-auto mt-3 max-w-2xl text-center text-xs text-gray-500">
        Si Mercado Pago no está conectado, el link de pago abre una página de pago simulado.
      </p>
    </>
  );
}
