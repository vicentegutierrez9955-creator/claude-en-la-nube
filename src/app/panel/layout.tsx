import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { db } from "@/lib/db";
import { logout } from "../auth-actions";

const NAV = [
  ["/panel", "Resumen"],
  ["/panel/pedidos", "Pedidos"],
  ["/panel/conversaciones", "Conversaciones"],
  ["/panel/productos", "Productos"],
  ["/panel/respuestas", "Respuestas"],
  ["/panel/simulador", "Simulador"],
  ["/panel/configuracion", "Configuración"],
] as const;

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const pendingHuman = await db.conversation.count({ where: { businessId: user.businessId, needsHuman: true } });
  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <Link href="/panel" className="font-bold">
              {BRAND}
            </Link>
            <span className="ml-2 text-sm text-gray-500">· {user.business.name}</span>
          </div>
          <form action={logout}>
            <button className="text-sm text-gray-600 hover:text-gray-900">Salir</button>
          </form>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-gray-600 hover:border-brand-500 hover:text-gray-900"
            >
              {label}
              {href === "/panel/conversaciones" && pendingHuman > 0 && (
                <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white">{pendingHuman}</span>
              )}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
