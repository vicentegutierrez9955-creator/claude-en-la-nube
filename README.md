# Pedidos al Toque

Software (SaaS) para pymes chilenas que venden por WhatsApp. Las pymes siguen vendiendo por el mismo chat de siempre, sin tienda online, y el sistema se encarga del resto:

1. **El cliente escribe por WhatsApp.** El vendedor automático responde al instante con los productos, precios y stock reales de la tienda.
2. **Arma el pedido.** Entiende mensajes desordenados ("quiero 2 poleras M a Los Aromos 45, Viña") y toma los datos de despacho.
3. **Cobra con Mercado Pago.** Envía el link de pago y detecta solo cuándo se pagó (webhook).
4. **Genera la etiqueta.** Emite el envío con Blue Express y deja la etiqueta PDF (10x15 cm) lista para imprimir. Se pueden imprimir varias de una vez.
5. **Avisa el seguimiento.** Cuando la pyme marca el pedido como despachado, el cliente recibe su número de seguimiento por WhatsApp.

Si el bot no puede resolver algo (reclamos, cambios, o si el cliente pide hablar con una persona), pasa el chat al equipo y aparece marcado en el panel.

## Vendedor IA y privacidad

- **100% IA:** el vendedor conversa de forma natural con **DeepSeek** (modelo por defecto `deepseek-v4-flash`, el más económico). Desde `/admin` se puede elegir otro modelo por tienda (DeepSeek Pro o Claude).
- **La IA nunca ve datos personales.** No recibe el nombre ni el teléfono del cliente. Cuando el cliente quiere comprar, la IA usa la herramienta `pedir_datos_envio` y el **sistema** pide nombre, dirección, comuna y región, muestra el resumen y envía el link de pago; esos mensajes quedan marcados como privados y la IA solo sabe que "los datos se tomaron". Si el cliente escribe un teléfono, RUT, correo o dirección por su cuenta, se reemplaza por `[teléfono oculto]`, `[dirección oculta]`, etc. antes de llegar a la IA (`src/lib/privacy.ts`).
- **Respaldo:** si la IA falla (caída del proveedor, clave inválida) o la tienda llega a su tope mensual de gasto, el cliente es atendido por el menú automático sin IA (`src/lib/menu-bot.ts`) y el chat queda marcado en el panel.
- **Respuestas** (sección del panel): preguntas frecuentes con respuesta oficial; la IA las recibe como información de la tienda.

## Conectar WhatsApp con un botón

La pyme aprieta **"Conectar mi WhatsApp Business"**, inicia sesión con Facebook en la ventana oficial de Meta, elige su número y listo (Embedded Signup de Meta).

- **Recomendado — mismo número de siempre (coexistencia):** la pyme conecta el número que ya usa en la app WhatsApp Business de su celular. Sigue viendo y respondiendo los chats en el teléfono; si responde ella, el vendedor IA se pausa en ese chat por `OWNER_PAUSE_HOURS` horas (12 por defecto) y después retoma solo. Requisitos de Meta: app WhatsApp Business actualizada y el número usado en ella al menos 7 días.
- **Número nuevo:** también se puede conectar un número que no esté en ninguna app de WhatsApp; el sistema lo registra en la Cloud API.

Código: `src/components/connect-whatsapp.tsx` (botón), `src/lib/meta.ts` y `src/app/api/whatsapp/connect` (intercambio del código, suscripción a webhooks y registro del número).

## Qué incluye

| Parte | Dónde está |
|---|---|
| Panel de la pyme: resumen, pedidos, conversaciones, productos, configuración | `src/app/panel` |
| **Simulador**: se chatea con el bot como si fueras cliente, sin conectar WhatsApp (ideal para demos de venta) | `src/app/panel/simulador` |
| Vendedor IA (DeepSeek o Claude + herramientas: catálogo, carrito, datos de envío privados, pago, derivar a humano) | `src/lib/agent` |
| Menú automático sin IA (respaldo y toma privada de datos de envío) | `src/lib/menu-bot.ts` |
| Administración del SaaS: consumo de IA por tienda, modelo y tope mensual | `src/app/admin` |
| WhatsApp Cloud API (webhook + envío de mensajes) | `src/lib/whatsapp.ts`, `src/app/api/webhooks/whatsapp` |
| Mercado Pago Checkout Pro (link de pago + webhook con verificación de firma) | `src/lib/mercadopago.ts`, `src/app/api/webhooks/mercadopago` |
| Blue Express (emisión de envío y etiqueta) + proveedor "simulado" para pruebas | `src/lib/shipping` |
| Flujo de pedidos: carrito → pago → etiqueta → despacho | `src/lib/orders.ts` |
| Multi-tienda: cada pyme tiene su cuenta y sus credenciales (guardadas cifradas) | `prisma/schema.prisma` |

Tecnología: Next.js 16, TypeScript, Postgres (Prisma), Tailwind; IA con DeepSeek (endpoint compatible con la API de Anthropic, mismo SDK) o Claude.

## Probarlo en tu computador

Necesitas Node 20+ y una base de datos Postgres.

```bash
cp .env.example .env        # y completa los valores
npm install
npm run db:push             # crea las tablas
npm run db:seed             # opcional: tienda de demo (demo@pedidosaltoque.cl / demo1234)
npm run dev                 # abre http://localhost:3000
```

Para que el simulador use la IA necesitas `DEEPSEEK_API_KEY` (sin clave, responde el menú de respaldo). Sin Mercado Pago ni Blue Express conectados igual se puede probar todo el flujo: el pago y la etiqueta funcionan en modo simulado.

Pruebas automáticas: `npm test` (usa una base `pedidos_test` en el Postgres local).

## Ponerlo en producción

1. **Base de datos:** crea un Postgres (Neon, Supabase o Vercel Postgres) y copia la URL en `DATABASE_URL`.
2. **Deploy:** conecta este repo en Vercel y carga las variables de `.env.example`. `APP_URL` debe ser la URL pública (por ejemplo `https://pedidosaltoque.cl`).
3. **DeepSeek:** crea una clave en platform.deepseek.com y ponla en `DEEPSEEK_API_KEY`.
4. **Meta (una sola vez, para todo el SaaS)** — ver la sección siguiente.
5. **Cada pyme**, desde el panel:
   - **WhatsApp:** botón "Conectar mi WhatsApp Business".
   - **Mercado Pago:** su Access Token de producción, y en su panel de Mercado Pago la URL de notificaciones que muestra la pantalla (evento *Pagos*) con su clave secreta.
   - **Blue Express:** BX-TOKEN, BX-USERCODE y BX-CLIENT_ACCOUNT, que Blue Express entrega al firmar como cliente empresa.

## Lo que hay que configurar en Meta (una sola vez)

Para que el botón funcione, la empresa dueña del SaaS debe ser **Tech Provider** de WhatsApp:

1. **Portafolio comercial verificado** en Meta Business Suite (verificación de la empresa con sus documentos).
2. **App en Meta for Developers** (tipo *Business*) con el producto **WhatsApp** y **Facebook Login for Business**. De ahí salen `META_APP_ID` y `META_APP_SECRET` (Configuración → Básica).
3. **Webhook** de WhatsApp en la app: URL `https://TU-APP/api/webhooks/whatsapp` y token `WHATSAPP_VERIFY_TOKEN`. Suscribir los campos `messages` y `smb_message_echoes` (este último es para ver lo que la pyme responde desde su celular).
4. **Configuración de Embedded Signup** en Facebook Login for Business → Configuraciones → crear una con el tipo *WhatsApp Embedded Signup* y los permisos `whatsapp_business_management` y `whatsapp_business_messaging`. Su ID va en `META_CONFIG_ID`.
5. **Dominios permitidos:** agregar el dominio de la app en Facebook Login (dominios permitidos para el SDK de JavaScript) y en los dominios de la app.
6. **Revisión de la app (App Review)** para tener *acceso avanzado* a esos dos permisos; Meta pide un video mostrando el flujo. Mientras tanto, el botón funciona con cuentas que tengan un rol en la app (para pruebas).
7. Cuando corresponda, aceptar en Meta los términos de **Tech Provider** y agregar un método de pago para las conversaciones que cobra WhatsApp.

## Pendientes antes de vender a clientes reales

- **Blue Express: validar la API.** No pude acceder a la documentación oficial (developers.bluex.cl) desde este entorno. El adaptador `src/lib/shipping/bluexpress.ts` usa los headers documentados públicamente (`BX-TOKEN`, `BX-USERCODE`, `BX-CLIENT_ACCOUNT`), pero **la URL (`BLUEX_EMISSION_URL`) y los nombres de los campos hay que confirmarlos** con la documentación y el ambiente QA que entrega Blue Express. Todo está en ese único archivo y tiene pruebas.
- **Comunas:** Blue Express probablemente pide códigos de comuna. Hay que agregar la tabla de comunas de Blue Express y normalizar la comuna que escribe el cliente.
- **Costo de envío:** hoy es una tarifa fija por tienda (con envío gratis opcional). Se puede conectar el cotizador de Blue Express.
- **Avisos fuera de 24 h:** WhatsApp solo permite mensajes libres hasta 24 horas después del último mensaje del cliente. El aviso de despacho, si sale más tarde, necesita una *plantilla* aprobada por Meta.
- **Mercado Pago con un botón:** reemplazar el pegado del Access Token por la conexión OAuth de Mercado Pago (igual de fácil que WhatsApp).
- **DeepSeek y datos personales:** aunque la IA no recibe los datos de envío ni el teléfono, confirmar con un abogado el cumplimiento de la Ley 21.719 (datos personales) usando un proveedor de IA extranjero, e informarlo en la política de privacidad.
- **Probar el vendedor con DeepSeek real:** el endpoint compatible de DeepSeek y el flujo de Embedded Signup se programaron según su documentación, pero no se pudieron probar contra los servicios reales desde este entorno.
- **Cobro del SaaS:** planes y suscripción de las pymes (por ejemplo con Mercado Pago Suscripciones).
