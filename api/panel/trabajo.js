// Registro de trabajos desde fuera del panel (Claude). Solo agrega; no permite leer los datos.
// GET /api/panel/trabajo?t=<PANEL_API_TOKEN>&d=<JSON en base64url>
import { createHash, timingSafeEqual } from 'node:crypto';
import { leerDatos, guardarDatos, datosIniciales, json } from '../_lib/panel.js';

const hash = (s) => createHash('sha256').update(String(s)).digest();
const texto = (v, max) => String(v ?? '').trim().slice(0, max);

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const token = process.env.PANEL_API_TOKEN;
    if (!token || !timingSafeEqual(hash(url.searchParams.get('t') || ''), hash(token))) return json({ error: 'No autorizado' }, 401);
    let t;
    try { t = JSON.parse(Buffer.from(url.searchParams.get('d') || '', 'base64url').toString('utf8')); } catch { return json({ error: 'Datos inválidos' }, 400); }
    const titulo = texto(t?.titulo, 160);
    if (!titulo) return json({ error: 'Falta el título' }, 400);
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(t.fecha) ? t.fecha : new Date().toISOString().slice(0, 10);
    const links = (Array.isArray(t.links) ? t.links : []).slice(0, 10)
      .map((l) => ({ nombre: texto(l?.nombre, 60), url: texto(l?.url, 500) }))
      .filter((l) => /^https:\/\//.test(l.url));

    for (let intento = 0; intento < 3; intento++) {
      const { data, etag } = await leerDatos();
      const d = data || datosIniciales();
      d.trabajos = Array.isArray(d.trabajos) ? d.trabajos : [];
      const id = texto(t.id, 60) || `t-${Date.now().toString(36)}`;
      if (d.trabajos.some((x) => x.id === id)) return json({ ok: true, id, repetido: true });
      const clienteId = d.clientes.some((c) => c.id === t.clienteId) ? t.clienteId : null;
      const prospectoId = (d.prospectos || []).some((x) => x.id === t.prospectoId) ? t.prospectoId : null;
      d.trabajos.push({
        id, clienteId, prospectoId, cliente: clienteId || prospectoId ? '' : texto(t.cliente, 80), fecha, titulo,
        detalle: texto(t.detalle, 2000), estado: ['hecho', 'en curso', 'pendiente'].includes(t.estado) ? t.estado : 'hecho',
        links, por: texto(t.por, 40) || 'Claude',
      });
      d.actualizado = new Date().toISOString();
      d.actualizadoPor = 'Claude';
      const r = await guardarDatos(d, etag);
      if (r.ok) return json({ ok: true, id });
    }
    return json({ error: 'No se pudo guardar, intenta de nuevo' }, 409);
  },
};
