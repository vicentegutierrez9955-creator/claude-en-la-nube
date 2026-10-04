import Link from "next/link";
import { BRAND } from "@/lib/brand";

const STEPS = [
  ["💬", "Te escribe un cliente", "El vendedor con IA responde al instante, 24/7: muestra productos, precios y stock reales."],
  ["🛒", "Arma el pedido", "Entiende mensajes desordenados como “quiero 2 poleras M y una L” y toma la dirección de despacho."],
  ["💳", "Cobra con Mercado Pago", "Envía el link de pago y detecta solo cuándo el cliente pagó. Nada de revisar transferencias."],
  ["🏷️", "Etiqueta lista", "Emite el envío con Blue Express y deja la etiqueta lista para imprimir con un clic."],
  ["🚚", "Avisa el seguimiento", "Le manda al cliente su número de seguimiento por WhatsApp cuando despachas."],
];

export default function Home() {
  return (
    <main>
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="text-lg font-bold">{BRAND}</span>
        <nav className="flex gap-2">
          <Link href="/login" className="btn-secondary">
            Entrar
          </Link>
          <Link href="/registro" className="btn-primary">
            Probar gratis
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-4xl px-4 pb-16 pt-12 text-center">
        <p className="mb-4 inline-block rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700">
          Para pymes que venden por WhatsApp en Chile
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Sigue vendiendo por WhatsApp.
          <br />
          <span className="text-brand-600">Deja que el resto se haga solo.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
          Sin tienda online ni cambiar cómo te compran tus clientes. Desde el primer “hola” hasta la etiqueta impresa,
          {` ${BRAND}`} atiende, cobra y prepara el despacho por ti.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/registro" className="btn-primary px-6 py-3 text-base">
            Crear mi cuenta
          </Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-20 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map(([icon, title, text], i) => (
          <div key={title} className="card">
            <div className="text-3xl">{icon}</div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Paso {i + 1}</p>
            <h2 className="mt-1 font-bold">{title}</h2>
            <p className="mt-2 text-sm text-gray-600">{text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
