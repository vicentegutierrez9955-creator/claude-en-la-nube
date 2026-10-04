import { sesion, leerDatos, guardarDatos, datosValidos, datosIniciales, json, MAX_BYTES } from '../_lib/panel.js';

export default {
  async fetch(request) {
    const s = sesion(request);
    if (!s) return json({ error: 'Sesión expirada' }, 401);

    if (request.method === 'GET') {
      const { data, etag } = await leerDatos();
      return json({ data: data || datosIniciales(), etag, usuario: s.nombre });
    }

    if (request.method === 'PUT') {
      const texto = await request.text();
      if (texto.length > MAX_BYTES) return json({ error: 'Demasiados datos' }, 413);
      let body;
      try { body = JSON.parse(texto); } catch { return json({ error: 'Datos inválidos' }, 400); }
      if (!datosValidos(body?.data)) return json({ error: 'Formato de datos inválido' }, 400);
      const data = { ...body.data, actualizado: new Date().toISOString(), actualizadoPor: s.nombre };
      const r = await guardarDatos(data, body.etag || null);
      if (!r.ok) {
        const actual = await leerDatos();
        return json({ error: 'conflicto', data: actual.data || datosIniciales(), etag: actual.etag }, 409);
      }
      return json({ ok: true, etag: r.etag, data });
    }

    return json({ error: 'Método no permitido' }, 405);
  },
};
