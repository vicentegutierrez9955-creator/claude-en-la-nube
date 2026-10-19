// WhatsApp desde el panel (sesión, por POST) o desde Claude (PANEL_API_TOKEN en ?t=, por GET).
// ?accion=estado  → qué variables están configuradas y los últimos mensajes.
// ?accion=enviar&para=569...&texto=...  o  &plantilla=hello_world&idioma=en_US
import { createHash, timingSafeEqual } from 'node:crypto';
import { sesion, json } from '../_lib/panel.js';
import { enviar, leerRegistro, numero } from '../_lib/whatsapp.js';

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
    return json({ error: 'Acción desconocida' }, 400);
  },
};
