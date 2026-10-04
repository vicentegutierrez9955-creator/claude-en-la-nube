# Pedidos al Toque

Software (SaaS) para pymes chilenas que venden por WhatsApp. Las pymes siguen vendiendo por el mismo chat de siempre, sin tienda online, y el sistema se encarga del resto:

1. **El cliente escribe por WhatsApp.** El vendedor automático responde al instante con los productos, precios y stock reales de la tienda.
2. **Arma el pedido.** Entiende mensajes desordenados ("quiero 2 poleras M a Los Aromos 45, Viña") y toma los datos de despacho.
3. **Cobra con Mercado Pago.** Envía el link de pago y detecta solo cuándo se pagó (webhook).
4. **Genera la etiqueta.** Emite el envío con Blue Express y deja la etiqueta PDF (10x15 cm) lista para imprimir. Se pueden imprimir varias de una vez.
5. **Avisa el seguimiento.** Cuando la pyme marca el pedido como despachado, el cliente recibe su número de seguimiento por WhatsApp.

Si el bot no puede resolver algo (reclamos, cambios, o si el cliente pide hablar con una persona), pasa el chat al equipo y aparece marcado en el panel.

## Modos de atención (cada pyme elige en Configuración)

| Modo | Cómo atiende | Costo de IA |
|---|---|---|
| **Solo menú** (por defecto) | Menú con números, búsqueda de productos por palabras (sin importar tildes ni plurales), respuestas rápidas por palabra clave y toma de datos de despacho paso a paso. Si no entiende, ofrece hablar con una persona. | $0 |
| **Híbrido** | El menú atiende todo lo que puede; la IA entra solo cuando el cliente escribe algo que el menú no entiende, y sigue hasta que el cliente escribe *menú*. | Bajo |
| **IA completa** | Claude conversa de principio a fin. | Por conversación |

Las **respuestas rápidas** (sección *Respuestas* del panel) son preguntas frecuentes con palabras clave y una respuesta fija. Se usan en los tres modos; en los modos con IA, la IA también las recibe como respuestas oficiales de la tienda.

## Qué incluye

| Parte | Dónde está |
|---|---|
| Panel de la pyme: resumen, pedidos, conversaciones, productos, configuración | `src/app/panel` |
| **Simulador**: se chatea con el bot como si fueras cliente, sin conectar WhatsApp (ideal para demos de venta) | `src/app/panel/simulador` |
| Menú automático sin IA (respuestas predeterminadas) | `src/lib/menu-bot.ts` |
| Vendedor IA (Claude + herramientas: catálogo, carrito, despacho, pago, derivar a humano) | `src/lib/agent` |
| WhatsApp Cloud API (webhook + envío de mensajes) | `src/lib/whatsapp.ts`, `src/app/api/webhooks/whatsapp` |
| Mercado Pago Checkout Pro (link de pago + webhook con verificación de firma) | `src/lib/mercadopago.ts`, `src/app/api/webhooks/mercadopago` |
| Blue Express (emisión de envío y etiqueta) + proveedor "simulado" para pruebas | `src/lib/shipping` |
| Flujo de pedidos: carrito → pago → etiqueta → despacho | `src/lib/orders.ts` |
| Multi-tienda: cada pyme tiene su cuenta y sus credenciales (guardadas cifradas) | `prisma/schema.prisma` |

Tecnología: Next.js 16, TypeScript, Postgres (Prisma), Tailwind y la API de Claude.

## Probarlo en tu computador

Necesitas Node 20+ y una base de datos Postgres.

```bash
cp .env.example .env        # y completa los valores
npm install
npm run db:push             # crea las tablas
npm run db:seed             # opcional: tienda de demo (demo@pedidosaltoque.cl / demo1234)
npm run dev                 # abre http://localhost:3000
```

En modo *Solo menú* el simulador funciona sin ninguna clave. Para los modos *Híbrido* e *IA* necesitas `ANTHROPIC_API_KEY` (se saca en console.anthropic.com). Sin Mercado Pago ni Blue Express conectados igual se puede probar todo el flujo: el pago y la etiqueta funcionan en modo simulado.

Pruebas automáticas: `npm test` (usa una base `pedidos_test` en el Postgres local).

## Ponerlo en producción

1. **Base de datos:** crea un Postgres (Neon, Supabase o Vercel Postgres) y copia la URL en `DATABASE_URL`.
2. **Deploy:** conecta este repo en Vercel y carga las variables de `.env.example`. `APP_URL` debe ser la URL pública (por ejemplo `https://pedidosaltoque.cl`).
3. **WhatsApp (una sola vez, para todo el SaaS):** crea una app en Meta for Developers con el producto WhatsApp. Configura el webhook con `https://TU-APP/api/webhooks/whatsapp` y el token `WHATSAPP_VERIFY_TOKEN`, suscríbelo al campo `messages` y copia el App Secret en `WHATSAPP_APP_SECRET`.
4. **Cada pyme**, en *Configuración*:
   - **WhatsApp:** el Phone Number ID de su número y un token permanente.
   - **Mercado Pago:** su Access Token de producción, y en su panel de Mercado Pago la URL de notificaciones que muestra la pantalla (evento *Pagos*) con su clave secreta.
   - **Blue Express:** BX-TOKEN, BX-USERCODE y BX-CLIENT_ACCOUNT, que Blue Express entrega al firmar como cliente empresa.

## Pendientes antes de vender a clientes reales

- **Blue Express: validar la API.** No pude acceder a la documentación oficial (developers.bluex.cl) desde este entorno. El adaptador `src/lib/shipping/bluexpress.ts` usa los headers documentados públicamente (`BX-TOKEN`, `BX-USERCODE`, `BX-CLIENT_ACCOUNT`), pero **la URL (`BLUEX_EMISSION_URL`) y los nombres de los campos hay que confirmarlos** con la documentación y el ambiente QA que entrega Blue Express. Todo está en ese único archivo y tiene pruebas.
- **Comunas:** Blue Express probablemente pide códigos de comuna. Hay que agregar la tabla de comunas de Blue Express y normalizar la comuna que escribe el cliente.
- **Costo de envío:** hoy es una tarifa fija por tienda (con envío gratis opcional). Se puede conectar el cotizador de Blue Express.
- **Avisos fuera de 24 h:** WhatsApp solo permite mensajes libres hasta 24 horas después del último mensaje del cliente. El aviso de despacho, si sale más tarde, necesita una *plantilla* aprobada por Meta.
- **Onboarding sin fricción:** reemplazar el pegado de tokens por *Embedded Signup* de Meta (WhatsApp) y OAuth de Mercado Pago.
- **Cobro del SaaS:** planes y suscripción de las pymes (por ejemplo con Mercado Pago Suscripciones).
