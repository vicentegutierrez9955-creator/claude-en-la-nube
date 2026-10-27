// WhatsApp desde el panel (sesión, por POST) o desde Claude (PANEL_API_TOKEN en ?t=, por GET).
// ?accion=estado  → qué variables están configuradas y los últimos mensajes.
// ?accion=enviar&para=569...&texto=...  o  &plantilla=hello_world&idioma=en_US
// ?accion=diagnostico&waba=<id>  → datos del número y apps suscritas a la cuenta de WhatsApp.
// ?accion=suscribir&waba=<id>    → suscribe la app a la cuenta (para que Meta mande los avisos al webhook).
// Registro insertado ("Conectar WhatsApp", página /panel/whatsapp), solo con sesión y por POST:
// accion=conectar { code, waba, telefono, tipo }  → canjea el código, suscribe la app y guarda la cuenta del negocio.
// accion=cuentas                                  → cuentas conectadas (sin tokens).
// accion=probar { waba, para, texto | plantilla } → envía un mensaje desde el número conectado.
// accion=invitar { negocio }                      → link de un solo uso para que el negocio conecte desde /conectar-whatsapp.
// accion=invitaciones                             → últimas invitaciones y su estado.
import { createHash, timingSafeEqual } from 'node:crypto';
import { sesion, json } from '../_lib/panel.js';
import { enviar, leerRegistro, numero, graph, conectarCuenta, leerCuentas, crearInvitacion, leerInvitaciones } from '../_lib/whatsapp.js';

const id = (v) => String(v || '').replace(/\D/g, '').slice(0, 20);

const hash = (s) => createHash('sha256').update(String(s)).digest();

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const token = process.env.PANEL_API_TOKEN;
    const porToken = Boolean(token) && timingSafeEqual(hash(url.searchParams.get('t') || ''), hash(token));
    if (!porToken && !sesion(request)) return json({ error: 'No autorizado' }, 401);
    let p = Object.fromEntries(url.searchParams);
    if (request.method === 'POST') p = { ...p, ...(await request.json().catch(() => ({}))) };

    if (p.accion === 'estado') {
      const reg = await leerRegistro();
      const env = (k) => Boolean(process.env[k]);
      return json({
        configurado: { WHATSAPP_TOKEN: env('WHATSAPP_TOKEN'), WHATSAPP_APP_SECRET: env('WHATSAPP_APP_SECRET'), WHATSAPP_VERIFY_TOKEN: env('WHATSAPP_VERIFY_TOKEN'), WHATSAPP_PHONE_NUMBER_ID: env('WHATSAPP_PHONE_NUMBER_ID') },
        mensajes: reg.mensajes.slice(-30).reverse(),
        bajas: Object.keys(reg.bajas).length,
        eliminarPendientes: reg.eliminar.filter((x) => !x.hecho).length,
      });
    }
    if (p.accion === 'enviar') {
      // Con sesión solo por POST, para que un link de otro sitio no pueda enviar mensajes.
      if (!porToken && request.method !== 'POST') return json({ error: 'Usa POST' }, 405);
      const para = numero(p.para);
      if (para.length < 10) return json({ error: 'Número inválido' }, 400);
      if (!p.plantilla && !String(p.texto || '').trim()) return json({ error: 'Falta el texto o la plantilla' }, 400);
      const r = p.plantilla
        ? await enviar(para, { plantilla: String(p.plantilla), idioma: String(p.idioma || 'es') })
        : await enviar(para, { texto: String(p.texto) });
      return json(r, r.ok ? 200 : 502);
    }
    if (p.accion === 'diagnostico' || p.accion === 'suscribir') {
      if (!porToken && request.method !== 'POST') return json({ error: 'Usa POST' }, 405);
      const waba = String(p.waba || '').replace(/\D/g, '').slice(0, 20); // los IDs de Meta tienen 15 o 16 dígitos
      if (!waba) return json({ error: 'Falta waba' }, 400);
      if (p.accion === 'suscribir') return json(await graph(`${waba}/subscribed_apps`, 'POST'));
      // Los permisos del token dicen a qué cuentas de WhatsApp tiene acceso (sus IDs); el token mismo no se devuelve.
      const permisos = await graph(`debug_token?input_token=${encodeURIComponent(process.env.WHATSAPP_TOKEN || '')}`);
      return json({
        numero: await graph(`${process.env.WHATSAPP_PHONE_NUMBER_ID}?fields=display_phone_number,verified_name,quality_rating`),
        cuenta: await graph(`${waba}?fields=id,name`),
        apps: await graph(`${waba}/subscribed_apps`),
        permisos: permisos.data ? { valido: permisos.data.is_valid, app: permisos.data.app_id, alcances: permisos.data.granular_scopes } : permisos,
      });
    }
    if (p.accion === 'cuentas') {
      const { cuentas } = await leerCuentas();
      return json({ cuentas: Object.values(cuentas).map(({ token, pin, ...c }) => c) });
    }
    if (p.accion === 'conectar' || p.accion === 'probar' || p.accion === 'invitar') {
      // Solo desde el panel con sesión: el código del registro insertado lo entrega el navegador de quien conecta.
      if (porToken || request.method !== 'POST') return json({ error: 'Usa POST desde el panel' }, 405);
    }
    if (p.accion === 'conectar') {
      const { status, ...r } = await conectarCuenta({ code: p.code, waba: p.waba, telefono: p.telefono, tipo: p.tipo, extra: { por: sesion(request)?.nombre || null } });
      return json(r, status);
    }
    if (p.accion === 'invitar') {
      if (porToken || request.method !== 'POST') return json({ error: 'Usa POST desde el panel' }, 405);
      const negocio = String(p.negocio || '').trim();
      if (!negocio) return json({ error: 'Escribe el nombre del negocio' }, 400);
      const inv = await crearInvitacion({ negocio, por: sesion(request)?.nombre });
      if (!inv) return json({ error: 'No se pudo crear la invitación, intenta de nuevo' }, 503);
      return json({ ok: true, link: `https://stpyme.cl/conectar-whatsapp?i=${inv.id}`, negocio: inv.negocio, vence: inv.vence });
    }
    if (p.accion === 'invitaciones') {
      const { invitaciones } = await leerInvitaciones();
      // Solo las pendientes llevan el link; las usadas o vencidas se muestran sin él.
      const ahora = new Date();
      return json({
        invitaciones: Object.entries(invitaciones)
          .map(([i, v]) => ({ ...v, link: !v.usada && new Date(v.vence) > ahora ? `https://stpyme.cl/conectar-whatsapp?i=${i}` : null }))
          .sort((a, b) => b.creada.localeCompare(a.creada))
          .slice(0, 30),
      });
    }
    if (p.accion === 'probar') {
      const { cuentas } = await leerCuentas();
      const cuenta = cuentas[id(p.waba)];
      if (!cuenta?.phoneNumberId) return json({ error: 'Esa cuenta no está conectada' }, 404);
      const para = numero(p.para);
      if (para.length < 10) return json({ error: 'Número inválido' }, 400);
      if (!p.plantilla && !String(p.texto || '').trim()) return json({ error: 'Falta el texto o la plantilla' }, 400);
      const r = p.plantilla
        ? await enviar(para, { plantilla: String(p.plantilla), idioma: String(p.idioma || 'en_US') }, cuenta)
        : await enviar(para, { texto: String(p.texto || '') }, cuenta);
      return json(r, r.ok ? 200 : 502);
    }
    return json({ error: 'Acción desconocida' }, 400);
  },
};
