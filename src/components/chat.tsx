import type { Message } from "@prisma/client";
import { formatDate } from "@/lib/format";

const AUTHOR_LABEL: Record<string, string> = {
  CLIENTE: "Cliente",
  BOT: "Vendedor IA",
  HUMANO: "Equipo",
  SISTEMA: "Aviso automático",
};

function linkify(text: string) {
  return text.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" className="break-all font-medium text-brand-700 underline">
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function ChatMessages({ messages }: { messages: Message[] }) {
  if (messages.length === 0) {
    return <p className="py-10 text-center text-sm text-gray-500">Todavía no hay mensajes.</p>;
  }
  return (
    <div className="space-y-3">
      {messages.map((m) => {
        const incoming = m.direction === "ENTRANTE";
        return (
          <div key={m.id} className={`flex ${incoming ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm shadow-xs ${
                incoming ? "bg-white ring-1 ring-gray-200" : m.author === "HUMANO" ? "bg-blue-50" : "bg-brand-50"
              }`}
            >
              <p className="whitespace-pre-wrap">{linkify(m.text)}</p>
              <p className="mt-1 text-right text-[11px] text-gray-500">
                {AUTHOR_LABEL[m.author]} · {formatDate(m.createdAt)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
