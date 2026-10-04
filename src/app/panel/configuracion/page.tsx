import { ErrorNote, Field, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { appUrl, REGIONES_CHILE } from "@/lib/orders";
import { saveSettingsAction } from "../actions";

const BOT_MODES = [
  {
    value: "MENU",
    title: "Solo menú",
    cost: "Sin costo de IA",
    text: "Menú con números, búsqueda de productos y respuestas rápidas. Si no entiende, ofrece hablar con una persona.",
  },
  {
    value: "HIBRIDO",
    title: "Híbrido",
    cost: "Costo bajo",
    text: "El menú atiende todo lo que puede y la IA entra solo cuando el cliente escribe algo que el menú no entiende.",
  },
  {
    value: "IA",
    title: "IA completa",
    cost: "Costo por conversación",
    text: "La IA conversa de forma natural de principio a fin. La experiencia más fluida.",
  },
] as const;

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

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireUser();
  const b = user.business;
  const { ok, error } = await searchParams;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Configuración" />
      <ErrorNote message={error} />

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

      <Section id="bot" title="Vendedor automático" description="Cómo atiende y qué hace solo." saved={ok === "bot"}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="botEnabled" defaultChecked={b.botEnabled} /> Responder automáticamente a los clientes
        </label>
        <fieldset className="space-y-2">
          <legend className="label">Modo de atención</legend>
          {BOT_MODES.map((m) => (
            <label key={m.value} className="flex cursor-pointer gap-3 rounded-lg border border-gray-200 p-3 text-sm has-checked:border-brand-500 has-checked:bg-brand-50">
              <input type="radio" name="botMode" value={m.value} defaultChecked={b.botMode === m.value} className="mt-1" />
              <span>
                <span className="font-semibold">{m.title}</span>
                <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{m.cost}</span>
                <span className="mt-0.5 block text-gray-600">{m.text}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div>
          <label className="label" htmlFor="welcomeMessage">
            Mensaje de bienvenida
          </label>
          <textarea
            id="welcomeMessage"
            name="welcomeMessage"
            className="input min-h-20"
            defaultValue={b.welcomeMessage}
            placeholder={`¡Hola! 👋 Bienvenido/a a *${b.name}*.`}
          />
          <p className="mt-1 text-xs text-gray-500">
            Va antes del menú. Las respuestas a preguntas frecuentes se configuran en{" "}
            <a href="/panel/respuestas" className="text-brand-700 underline">
              Respuestas
            </a>
            .
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="autoCreateShipment" defaultChecked={b.autoCreateShipment} /> Emitir la etiqueta de envío
          apenas se confirma el pago
        </label>
        <div>
          <label className="label" htmlFor="botInstructions">
            Instrucciones extra para la IA (solo modos Híbrido e IA)
          </label>
          <textarea
            id="botInstructions"
            name="botInstructions"
            className="input min-h-32"
            defaultValue={b.botInstructions}
            placeholder={"Ej: Despachamos de lunes a viernes. Los cambios de talla se aceptan dentro de 10 días. Trata a los clientes de 'tú' y sé cercano."}
          />
        </div>
      </Section>

      <Section
        id="whatsapp"
        title="WhatsApp"
        description={
          <>
            Conecta tu número de WhatsApp Business Platform (Cloud API) desde{" "}
            <a className="text-brand-700 underline" href="https://developers.facebook.com/apps" target="_blank">
              Meta for Developers
            </a>
            .
          </>
        }
        saved={ok === "whatsapp"}
      >
        <CopyBox label="URL del webhook (para Meta)" value={`${appUrl()}/api/webhooks/whatsapp`} />
        <Field label="Phone number ID" name="whatsappPhoneNumberId" defaultValue={b.whatsappPhoneNumberId} />
        <SecretField label="Token de acceso" name="whatsappAccessToken" isSet={Boolean(b.whatsappAccessToken)} hint="Usa un token permanente de usuario del sistema." />
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
