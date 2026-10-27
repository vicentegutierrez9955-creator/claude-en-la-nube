// WhatsApp desde el panel (sesión, por POST) o desde Claude (PANEL_API_TOKEN en ?t=, por GET).
// ?accion=estado  → qué variables están configuradas y los últimos mensajes.
// ?accion=enviar&para=569...&texto=...  o  &plantilla=hello_world&idioma=en_US
// ?accion=diagnostico&waba=<id>  → datos del número y apps suscritas a la cuenta de WhatsApp.
// ?accion=suscribir&waba=<id>    → suscribe la app a la cuenta (para que Meta mande los avisos al webhook).
// Registro insertado ("Conectar WhatsApp", página /panel/whatsapp), solo con sesión y por POST:
// accion=conectar { code, waba, telefono, tipo }  → canjea el código, suscribe la app y guarda la cuenta del negocio.
// accion=cuentas                                  → cuentas conectadas (sin tokens).
// accion=probar { waba, para, texto | plantilla } → envía un mensaje desde el número conectado.
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { sesion, json } from '../_lib/panel.js';
import { enviar, leerRegistro, numero, graph, graphCon, canjearCodigo, leerCuentas, guardarCuenta, APP_ID } from '../_lib/whatsapp.js';

const id = (v) => String(v || '').replace(/\D/g, '').slice(0, 20);
const motivo = (r) => r?.error?.message || null;

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
    if (p.accion === 'conectar' || p.accion === 'probar') {
      // Solo desde el panel con sesión: el código del registro insertado lo entrega el navegador de quien conecta.
      if (porToken || request.method !== 'POST') return json({ error: 'Usa POST desde el panel' }, 405);
    }
    if (p.accion === 'conectar') {
      const code = String(p.code || '').slice(0, 2000);
      if (!code) return json({ error: 'Falta el código de Meta' }, 400);
      const tok = await canjearCodigo(code);
      if (!tok.access_token) return json({ error: `No se pudo canjear el código: ${motivo(tok) || 'sin token'}` }, 502);
      const token = tok.access_token;
      let waba = id(p.waba), telefono = id(p.telefono);
      // Si el navegador no alcanzó a recibir los IDs, se sacan de los permisos que el negocio le dio a la app.
      if (!waba && process.env.WHATSAPP_APP_SECRET) {
        const d = await graphCon(`${APP_ID}|${process.env.WHATSAPP_APP_SECRET}`, `debug_token?input_token=${encodeURIComponent(token)}`);
        waba = id((d.data?.granular_scopes || []).find((s) => s.scope === 'whatsapp_business_management')?.target_ids?.[0]);
      }
      if (!waba) return json({ error: 'Meta no informó la cuenta de WhatsApp conectada' }, 502);
      if (!telefono) telefono = id((await graphCon(token, `${waba}/phone_numbers?fields=id`)).data?.[0]?.id);
      const suscripcion = await graphCon(token, `${waba}/subscribed_apps`, 'POST');
      // Un número nuevo hay que registrarlo en la Cloud API; con coexistencia (WhatsApp Business) ya está registrado.
      const tipo = p.tipo === 'coexistencia' ? 'coexistencia' : 'nuevo';
      let pin = null, registro = null;
      if (tipo === 'nuevo' && telefono) {
        pin = String(randomInt(0, 1e6)).padStart(6, '0');
        registro = await graphCon(token, `${telefono}/register`, 'POST', { messaging_product: 'whatsapp', pin });
        if (!registro.success) pin = null;
      }
      const info = telefono ? await graphCon(token, `${telefono}?fields=display_phone_number,verified_name`) : {};
      const cuenta = {
        waba, phoneNumberId: telefono || null, numero: info.display_phone_number || null, nombre: info.verified_name || null,
        tipo, conectada: new Date().toISOString(), por: sesion(request)?.nombre || null, token, ...(pin ? { pin } : {}),
      };
      if (!(await guardarCuenta(cuenta))) return json({ error: 'No se pudo guardar la cuenta, intenta de nuevo' }, 503);
      return json({
        ok: true, waba, telefono: cuenta.phoneNumberId, numero: cuenta.numero, nombre: cuenta.nombre, tipo,
        suscrita: Boolean(suscripcion.success), errorSuscripcion: motivo(suscripcion),
        registrado: registro ? Boolean(registro.success) : null, errorRegistro: motivo(registro),
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
