// Agrega o completa prospectos desde fuera del panel (Claude). Nunca borra ni pisa lo que ya escribió el equipo:
// si el prospecto existe, solo rellena campos vacíos y suma links nuevos a "creado".
// GET /api/panel/prospecto?t=<PANEL_API_TOKEN>&d=<JSON en base64url>
import { createHash, timingSafeEqual } from 'node:crypto';
import { leerDatos, guardarDatos, datosIniciales, json } from '../_lib/panel.js';

const hash = (s) => createHash('sha256').update(String(s)).digest();
const texto = (v, max) => String(v ?? '').trim().slice(0, max);
const CAMPOS = { negocio: 80, rubro: 60, comuna: 60, direccion: 120, contacto: 60, whatsapp: 20, telefono: 30, redes: 200, responsable: 40, mensaje: 1000, notas: 1000, desde: 10 };
// Reseñas de Google: nota (1 a 5) y cantidad. 0 reseñas es un dato válido.
const numero = (v, min, max) => (v === '' || v == null || !Number.isFinite(Number(v)) || Number(v) < min || Number(v) > max ? '' : Number(v));
const vacio = (v) => v === undefined || v === null || v === '';
const ESTADOS = ['por contactar', 'contactado', 'interesado', 'cerrado', 'no interesado'];

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const token = process.env.PANEL_API_TOKEN;
    if (!token || !timingSafeEqual(hash(url.searchParams.get('t') || ''), hash(token))) return json({ error: 'No autorizado' }, 401);
    let p;
    try { p = JSON.parse(Buffer.from(url.searchParams.get('d') || '', 'base64url').toString('utf8')); } catch { return json({ error: 'Datos inválidos' }, 400); }
    const id = texto(p?.id, 60);
    if (!id || !texto(p.negocio, 80)) return json({ error: 'Faltan id o negocio' }, 400);
    const limpio = {};
    for (const [k, max] of Object.entries(CAMPOS)) limpio[k] = k === 'whatsapp' ? texto(p[k], max).replace(/\D/g, '') : texto(p[k], max);
    limpio.googleNota = numero(p.googleNota, 1, 5);
    limpio.googleResenas = numero(p.googleResenas, 0, 1e6) === '' ? '' : Math.round(Number(p.googleResenas));
    const creado = (Array.isArray(p.creado) ? p.creado : []).slice(0, 10)
      .map((l) => ({ nombre: texto(l?.nombre, 60), url: texto(l?.url, 500) }))
      .filter((l) => /^https:\/\//.test(l.url));

    for (let intento = 0; intento < 3; intento++) {
      const { data, etag } = await leerDatos();
      const d = data || datosIniciales();
      d.prospectos = Array.isArray(d.prospectos) ? d.prospectos : [];
      let actual = d.prospectos.find((x) => x.id === id);
      let cambios = 0;
      if (!actual) {
        actual = { id, ...limpio, estado: ESTADOS.includes(p.estado) ? p.estado : 'por contactar', creado };
        d.prospectos.push(actual);
        cambios = 1;
      } else {
        for (const [k, v] of Object.entries(limpio)) if (!vacio(v) && vacio(actual[k])) { actual[k] = v; cambios++; }
        actual.creado = Array.isArray(actual.creado) ? actual.creado : [];
        for (const l of creado) if (!actual.creado.some((x) => x.url === l.url)) { actual.creado.push(l); cambios++; }
      }
      if (!cambios) return json({ ok: true, id, sinCambios: true });
      d.actualizado = new Date().toISOString();
      d.actualizadoPor = 'Claude';
      const r = await guardarDatos(d, etag);
      if (r.ok) return json({ ok: true, id, cambios });
    }
    return json({ error: 'No se pudo guardar, intenta de nuevo' }, 409);
  },
};
