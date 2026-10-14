// Datos de Optimind OS para las pestañas Ventas y Marca del panel (solo lectura, con la sesión del panel).
// Los objetivos vienen con su avance ya calculado con los datos reales del CRM y del contenido.
import { sesion, json } from '../_lib/panel.js';
import { leer } from '../_lib/os/almacen.js';
import { estadoObjetivo, textoMeta } from '../_lib/os/metricas.js';
import { lunesDe, hoy } from '../_lib/os/util.js';

export default {
  async fetch(request) {
    if (!sesion(request)) return json({ error: 'Sesión expirada' }, 401);
    if (request.method !== 'GET') return json({ error: 'Método no permitido' }, 405);
    const [os, crm, contenido] = await Promise.all([leer('os'), leer('crm'), leer('contenido')]);
    const ctx = { os, crm, contenido };
    const lunes = lunesDe(hoy());
    const semana = contenido.rutina.semanas.find((s) => s.semana === lunes)
      || { semana: lunes, items: contenido.rutina.plantilla.map((tarea) => ({ tarea, hecho: false })) };
    return json({
      vision: os.vision,
      objetivos: os.objetivos.map((o) => {
        const e = estadoObjetivo(o, ctx);
        return { ...o, avance: e.avance, ritmo: e.ritmo, meta: textoMeta(e.principal) };
      }),
      estrategias: os.estrategias,
      iniciativas: os.iniciativas,
      tareas: os.tareas,
      productos: os.productos,
      publicaciones: contenido.publicaciones.map(({ guion, contenido: c, ...p }) => p),
      metricasRedes: [...contenido.metricasRedes].sort((a, b) => b.semana.localeCompare(a.semana)).slice(0, 12),
      rutina: semana,
      briefings: [...contenido.briefings].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 5),
      biblioteca: contenido.biblioteca,
    });
  },
};
