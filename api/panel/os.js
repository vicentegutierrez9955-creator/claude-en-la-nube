// Datos de Optimind OS para el panel (con la sesión del panel). GET: estrategia y contenido, con el avance
// de los objetivos ya calculado con los datos reales del CRM. POST: las pocas acciones que se hacen
// desde el panel (terminar tareas e iniciativas, y la migración de unidad de negocio). Cada escritura
// queda en la misma auditoría que las del conector, con el nombre de quien entró al panel.
import { sesion, json } from '../_lib/panel.js';
import { leer, modificar } from '../_lib/os/almacen.js';
import { auditar } from '../_lib/os/auditoria.js';
import { estadoObjetivo, textoMeta } from '../_lib/os/metricas.js';
import { ESTADOS_INI, ESTADOS_TAR, marcarTermino, planUnidad, aplicarPlan } from '../_lib/os/acciones.js';
import { lunesDe, hoy } from '../_lib/os/util.js';

const TIPOS = {
  tarea: { coleccion: 'tareas', estados: ESTADOS_TAR, final: 'hecha', campo: 'completadaEl' },
  iniciativa: { coleccion: 'iniciativas', estados: ESTADOS_INI, final: 'terminada', campo: 'terminadaEl' },
};

async function datos() {
  const [os, crm, contenido] = await Promise.all([leer('os'), leer('crm'), leer('contenido')]);
  const ctx = { os, crm, contenido };
  const lunes = lunesDe(hoy());
  const semana = contenido.rutina.semanas.find((s) => s.semana === lunes)
    || { semana: lunes, items: contenido.rutina.plantilla.map((tarea) => ({ tarea, hecho: false })) };
  return {
    vision: os.vision,
    objetivos: os.objetivos.map((o) => {
      const e = estadoObjetivo(o, ctx);
      const p = e.principal;
      return { ...o, avance: e.avance, ritmo: e.ritmo, meta: textoMeta(p), valor: p?.valor ?? null, metaNum: p?.meta ?? null, medida: p?.unidad || '' };
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
  };
}

// Cambia el estado de una tarea o iniciativa (el botón "Terminar" de las listas).
async function cambiarEstado({ tipo, id, estado }, nombre) {
  const t = TIPOS[tipo];
  if (!t || typeof id !== 'string' || !t.estados.includes(estado)) return json({ error: 'Datos inválidos' }, 400);
  const autor = `${nombre} (panel)`;
  const antes = await modificar('os', (d) => {
    const x = d[t.coleccion].find((y) => y.id === id);
    if (!x) return null;
    const previo = x.estado;
    x.estado = estado;
    marcarTermino(x, t.final, t.campo);
    x.actualizado = hoy();
    return previo ?? '';
  }, nombre, autor);
  if (antes === null) return json({ error: 'Ya no existe' }, 404);
  await auditar({ usuario: nombre, herramienta: 'panel', entidad: tipo, id, cambios: { estado: [antes, estado] } });
  return json({ ok: true });
}

// Migración de unidad de negocio: sin "aplicar" devuelve el plan para revisarlo; con "aplicar": true
// lo ejecuta (solo sobre lo que sigue sin unidad).
async function migrarUnidad({ aplicar }, nombre) {
  const [crm, os] = await Promise.all([leer('crm'), leer('os')]);
  const plan = planUnidad({ crm, os });
  if (aplicar !== true || !plan.length) return json({ plan });
  const autor = `${nombre} (panel)`;
  const enCrm = await modificar('crm', (d) => aplicarPlan('crm', d, plan), nombre, autor);
  const enOs = await modificar('os', (d) => aplicarPlan('os', d, plan), nombre, autor);
  const hechos = { ...enCrm, ...enOs };
  await auditar({ usuario: nombre, herramienta: 'panel', entidad: 'migracion', id: 'unidad_negocio', accion: 'asignar unidad a registros antiguos', cambios: hechos });
  return json({ ok: true, aplicados: Object.values(hechos).reduce((t, l) => t + l.length, 0), hechos });
}

export default {
  async fetch(request) {
    const s = sesion(request);
    if (!s) return json({ error: 'Sesión expirada' }, 401);
    if (request.method === 'GET') return json(await datos());
    if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
    const texto = await request.text();
    if (texto.length > 10000) return json({ error: 'Demasiados datos' }, 413);
    let body;
    try { body = JSON.parse(texto); } catch { return json({ error: 'Datos inválidos' }, 400); }
    if (body?.accion === 'estado') return cambiarEstado(body, s.nombre);
    if (body?.accion === 'migrar_unidad') return migrarUnidad(body, s.nombre);
    return json({ error: 'Acción desconocida' }, 400);
  },
};
