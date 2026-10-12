import Link from "next/link";
import { BRAND } from "@/lib/brand";

export const metadata = { title: `Política de privacidad · ${BRAND}` };

// Borrador de política de privacidad (Meta la exige para aprobar la app de WhatsApp).
// Debe revisarla un abogado antes de operar con clientes reales.
export default function PrivacyPage() {
  const contact = process.env.CONTACT_EMAIL;
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed text-gray-800">
      <Link href="/" className="text-brand-700 hover:underline">
        ← {BRAND}
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-gray-900">Política de privacidad</h1>
      <p className="mt-1 text-gray-500">Última actualización: octubre de 2026</p>

      <h2 className="mt-8 text-lg font-bold text-gray-900">Qué es {BRAND}</h2>
      <p className="mt-2">
        {BRAND} es una plataforma que ayuda a tiendas (las &quot;tiendas&quot;) a atender por WhatsApp a sus clientes, cobrar sus pedidos y
        preparar sus envíos. Cada tienda es responsable de los datos de sus propios clientes; {BRAND} los trata por encargo de ella.
      </p>

      <h2 className="mt-8 text-lg font-bold text-gray-900">Qué datos tratamos</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>De las tiendas: nombre, correo, datos del negocio y las credenciales que conectan para WhatsApp, Mercado Pago y envíos (guardadas cifradas).</li>
        <li>De los clientes de cada tienda: número de WhatsApp, nombre de perfil, mensajes enviados a la tienda, productos comprados y datos de despacho (nombre, dirección, comuna, región y teléfono).</li>
      </ul>

      <h2 className="mt-8 text-lg font-bold text-gray-900">Para qué los usamos</h2>
      <p className="mt-2">
        Solo para atender las conversaciones, registrar pedidos, generar el cobro, emitir la etiqueta de envío y avisar el estado del
        pedido. No vendemos datos ni los usamos para publicidad.
      </p>

      <h2 className="mt-8 text-lg font-bold text-gray-900">Con quién los compartimos</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Meta (WhatsApp), para enviar y recibir los mensajes.</li>
        <li>Mercado Pago, para procesar los pagos.</li>
        <li>La empresa de envíos que use la tienda (por ejemplo, Blue Express), con los datos de despacho.</li>
        <li>
          Un proveedor de inteligencia artificial que redacta las respuestas de la tienda. A ese proveedor no le enviamos el nombre, el
          teléfono ni los datos de despacho del cliente: el sistema los oculta antes de enviarle cada conversación.
        </li>
        <li>Nuestros proveedores de alojamiento y base de datos.</li>
      </ul>

      <h2 className="mt-8 text-lg font-bold text-gray-900">Cuánto tiempo los guardamos</h2>
      <p className="mt-2">Mientras la tienda tenga su cuenta activa, o lo que exija la ley. La tienda puede pedir que se borren sus datos.</p>

      <h2 className="mt-8 text-lg font-bold text-gray-900">Tus derechos</h2>
      <p className="mt-2">
        Puedes pedir acceso, rectificación, eliminación u oposición al tratamiento de tus datos, escribiendo a la tienda con la que
        conversaste o a nosotros{contact ? ` en ${contact}` : ""}.
      </p>
    </main>
  );
}
