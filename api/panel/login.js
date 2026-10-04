import { claveCorrecta, cookieSesion, cookieBorrada, json } from '../_lib/panel.js';

export default {
  async fetch(request) {
    if (request.method === 'DELETE') return json({ ok: true }, 200, { 'set-cookie': cookieBorrada });
    if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
    if (!process.env.PANEL_PASSWORD || !process.env.PANEL_SECRET) {
      return json({ error: 'El panel no está configurado (faltan PANEL_PASSWORD y PANEL_SECRET).' }, 500);
    }
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Datos inválidos' }, 400); }
    const nombre = String(body?.nombre || '').trim().slice(0, 40);
    if (!nombre) return json({ error: 'Escribe tu nombre' }, 400);
    if (!claveCorrecta(body?.clave)) {
      await new Promise((r) => setTimeout(r, 800));
      return json({ error: 'Clave incorrecta' }, 401);
    }
    return json({ ok: true, nombre }, 200, { 'set-cookie': cookieSesion(nombre) });
  },
};
