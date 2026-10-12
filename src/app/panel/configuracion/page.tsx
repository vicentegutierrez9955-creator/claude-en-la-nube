import type { Business } from "@prisma/client";
import { ConnectWhatsApp } from "@/components/connect-whatsapp";
import { ErrorNote, Field, PageHeader } from "@/components/ui";
import { isAdminEmail, requireUser } from "@/lib/auth";
import { embeddedSignupReady, GRAPH_VERSION, metaConfig } from "@/lib/meta";
import { appUrl, REGIONES_CHILE } from "@/lib/orders";
import { disconnectWhatsAppAction, saveSettingsAction } from "../actions";

function Section({
  id,
  title,
  description,
  saved,
  children,
}: {
  id: string;
  title: string;
  description: React.ReactNode;
  saved: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={saveSettingsAction} className="card space-y-4" id={id}>
      <input type="hidden" name="section" value={id} />
      <div>
        <h2 className="font-bold">{title}</h2>
        <div className="mt-1 text-sm text-gray-600">{description}</div>
      </div>
      {children}
      <div className="flex items-center gap-3">
        <button className="btn-primary">Guardar</button>
        {saved && <span className="text-sm text-brand-700">✓ Guardado</span>}
      </div>
    </form>
  );
}

function SecretField({ label, name, isSet, hint }: { label: string; name: string; isSet: boolean; hint?: string }) {
  return (
    <Field
      label={`${label} ${isSet ? "✅" : ""}`}
      name={name}
      type="password"
      placeholder={isSet ? "Guardado. Escribe uno nuevo solo para cambiarlo" : ""}
      hint={hint}
    />
  );
}

function CopyBox({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <code className="block break-all rounded-lg bg-gray-100 px-3 py-2 text-xs">{value}</code>
    </div>
  );
}

function WhatsAppCard({ business: b, isAdmin, saved }: { business: Business; isAdmin: boolean; saved: boolean }) {
  const connected = Boolean(b.whatsappPhoneNumberId && b.whatsappAccessToken);
  const { appId, configId } = metaConfig();
  return (
    <div className="card space-y-4" id="whatsapp">
      <div>
        <h2 className="font-bold">WhatsApp</h2>
        <p className="mt-1 text-sm text-gray-600">El número donde tus clientes te escriben y donde atiende tu vendedor IA.</p>
      </div>
      {connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-brand-50 p-4">
          <div>
            <p className="font-semibold text-brand-700">✅ Conectado{b.whatsappDisplayPhone ? `: ${b.whatsappDisplayPhone}` : ""}</p>
            <p className="text-sm text-gray-600">
              {b.whatsappCoexistence
                ? "Sigues usando la app WhatsApp Business en tu celular. Si respondes tú un chat, el vendedor IA se pausa en ese chat por unas horas."
                : "Número conectado a la plataforma de WhatsApp para empresas."}
            </p>
          </div>
          <form action={disconnectWhatsAppAction}>
            <button className="btn-secondary">Desconectar</button>
          </form>
        </div>
      ) : embeddedSignupReady() ? (
        <ConnectWhatsApp appId={appId} configId={configId} graphVersion={GRAPH_VERSION} />
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          La conexión con un botón todavía no está activada en esta plataforma (faltan las credenciales de la app de Meta).
        </p>
      )}
      {isAdmin && (
        <details className="rounded-lg border border-gray-200 p-3 text-sm">
          <summary className="cursor-pointer font-medium">Conexión manual (solo administradores)</summary>
          <form action={saveSettingsAction} className="mt-3 space-y-3">
            <input type="hidden" name="section" value="whatsapp" />
            <CopyBox label="URL del webhook (para Meta)" value={`${appUrl()}/api/webhooks/whatsapp`} />
            <Field label="Phone number ID" name="whatsappPhoneNumberId" defaultValue={b.whatsappPhoneNumberId} />
            <SecretField label="Token de acceso" name="whatsappAccessToken" isSet={Boolean(b.whatsappAccessToken)} />
            <div className="flex items-center gap-3">
              <button className="btn-secondary">Guardar</button>
              {saved && <span className="text-sm text-brand-700">✓ Guardado</span>}
            </div>
          </form>
        </details>
      )}
    </div>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const b = user.business;
  const { ok, error } = await searchParams;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Configuración" />
      <ErrorNote message={error} />

      <WhatsAppCard business={b} isAdmin={isAdminEmail(user.email)} saved={ok === "whatsapp"} />

      <Section id="tienda" title="Tienda y despacho" description="Datos que usa el vendedor IA y que salen como remitente en la etiqueta." saved={ok === "tienda"}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre de la tienda" name="name" defaultValue={b.name} required />
          <Field label="Costo de envío (CLP)" name="shippingFlatRate" type="number" defaultValue={b.shippingFlatRate} />
          <Field label="Envío gratis desde (CLP, 0 = nunca)" name="freeShippingFrom" type="number" defaultValue={b.freeShippingFrom} />
          <Field label="Nombre del remitente" name="originName" defaultValue={b.originName} />
          <Field label="Teléfono del remitente" name="originPhone" defaultValue={b.originPhone} />
          <Field label="Dirección de retiro" name="originAddress" defaultValue={b.originAddress} placeholder="Av. Siempre Viva 742" />
          <Field label="Comuna" name="originComuna" defaultValue={b.originComuna} />
          <div>
            <label className="label" htmlFor="originRegion">
              Región
            </label>
            <select id="originRegion" name="originRegion" className="input" defaultValue={b.originRegion ?? ""}>
              <option value="">Selecciona…</option>
              {REGIONES_CHILE.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      <Section id="bot" title="Vendedor IA" description="Cómo atiende y qué hace solo." saved={ok === "bot"}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="botEnabled" defaultChecked={b.botEnabled} /> Responder automáticamente a los clientes
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="autoCreateShipment" defaultChecked={b.autoCreateShipment} /> Emitir la etiqueta de envío
          apenas se confirma el pago
        </label>
        <div>
          <label className="label" htmlFor="botInstructions">
            Instrucciones para tu vendedor (políticas, tono, datos de la tienda)
          </label>
          <textarea
            id="botInstructions"
            name="botInstructions"
            className="input min-h-32"
            defaultValue={b.botInstructions}
            placeholder={"Ej: Despachamos de lunes a viernes. Los cambios de talla se aceptan dentro de 10 días. Trata a los clientes de 'tú' y sé cercano."}
          />
          <p className="mt-1 text-xs text-gray-500">
            Las respuestas a preguntas frecuentes se cargan en{" "}
            <a href="/panel/respuestas" className="text-brand-700 underline">
              Respuestas
            </a>
            . Tu vendedor nunca ve los nombres, teléfonos ni direcciones de tus clientes: los datos de envío los toma el sistema.
          </p>
        </div>
      </Section>

      <Section
        id="mercadopago"
        title="Mercado Pago"
        description="Credenciales de producción de tu cuenta de Mercado Pago (Tus integraciones → Credenciales)."
        saved={ok === "mercadopago"}
      >
        <CopyBox label="URL de notificaciones (Webhooks → evento Pagos)" value={`${appUrl()}/api/webhooks/mercadopago/${b.id}`} />
        <SecretField label="Access token" name="mpAccessToken" isSet={Boolean(b.mpAccessToken)} />
        <SecretField label="Clave secreta del webhook" name="mpWebhookSecret" isSet={Boolean(b.mpWebhookSecret)} hint="Se usa para verificar que los avisos de pago vienen de Mercado Pago." />
      </Section>

      <Section
        id="envios"
        title="Envíos"
        description="Las credenciales de la API te las entrega Blue Express al firmar como cliente empresa."
        saved={ok === "envios"}
      >
        <div>
          <label className="label" htmlFor="shippingProvider">
            Paquetería
          </label>
          <select id="shippingProvider" name="shippingProvider" className="input" defaultValue={b.shippingProvider}>
            <option value="simulado">Simulado (para pruebas, genera etiquetas de ejemplo)</option>
            <option value="bluexpress">Blue Express</option>
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <SecretField label="BX-TOKEN" name="bxToken" isSet={Boolean(b.bxToken)} />
          <SecretField label="BX-USERCODE" name="bxUserCode" isSet={Boolean(b.bxUserCode)} />
          <SecretField label="BX-CLIENT_ACCOUNT" name="bxClientAccount" isSet={Boolean(b.bxClientAccount)} />
        </div>
      </Section>
    </div>
  );
}
