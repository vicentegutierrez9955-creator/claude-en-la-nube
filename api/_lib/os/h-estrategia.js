// Herramientas de estrategia (panel/os.json): visión → objetivos → estrategias por área → iniciativas → tareas,
// métricas (resultados clave) que miden cada objetivo, y el catálogo de productos que ofrecemos a los clientes.
import { z } from 'zod';
import { leer, modificar } from './almacen.js';
import { AREAS, ENFOQUES, fecha, texto, id, paginacion, fallar } from './comun.js';
import { FUENTES, estadoObjetivo, textoMeta } from './metricas.js';
import { hoy, paginar, nuevoId, diferencias, recortar } from './util.js';

const ESTADOS_OBJ = ['activo', 'logrado', 'pausado', 'abandonado'];
const ESTADOS_EST = ['activa', 'pausada', 'terminada'];
const ESTADOS_INI = ['propuesta', 'en curso', 'pausada', 'terminada'];
const ESTADOS_TAR = ['pendiente', 'en curso', 'hecha', 'bloqueada'];
const ESTADOS_PRD = ['idea', 'en desarrollo', 'activo', 'pausado'];
const AREA_OBJ = ['general', ...AREAS];

const contexto = async () => {
  const [os, crm, contenido] = await Promise.all([leer('os'), leer('crm'), leer('contenido')]);
  return { os, crm, contenido };
};

export function resumenObjetivo(o, ctx) {
  const e = estadoObjetivo(o, ctx);
  return { id: o.id, titulo: o.titulo, area: o.area, fechaLimite: o.fechaLimite, estado: o.estado, meta: textoMeta(e.principal), avance: e.avance, ritmo: e.ritmo };
}

// Objetivos que le tocan a un enfoque: los generales y los de sus áreas (o con estrategias en sus áreas).
export function objetivosDe(ctx, enfoque) {
  const areas = ENFOQUES[enfoque];
  return ctx.os.objetivos.filter((o) => !areas || !o.area || o.area === 'general' || areas.includes(o.area)
    || ctx.os.estrategias.some((s) => s.objetivoId === o.id && areas.includes(s.area)));
}

// Actualiza los campos dados de un elemento de una colección y audita la diferencia.
async function actualizarEn(coleccion, entidad, eid, campos, { usuario, auditar }, extra) {
  const cambios = await modificar('os', (d) => {
    const x = d[coleccion].find((y) => y.id === eid) || fallar(`No existe ${entidad} "${eid}".`);
    const antes = structuredClone(x);
    for (const [k, v] of Object.entries(campos)) if (v !== undefined) x[k] = v;
    extra?.(x, antes, d);
    x.actualizado = hoy();
    return diferencias(antes, x);
  }, usuario);
  delete cambios.actualizado;
  await auditar({ entidad, id: eid, cambios });
  return { ok: true, id: eid, cambios: Object.keys(cambios) };
}

async function crearEn(coleccion, entidad, prefijo, item, { usuario, auditar }, validar) {
  const nid = nuevoId(prefijo);
  await modificar('os', (d) => {
    validar?.(d);
    d[coleccion].push({ id: nid, ...item, creado: hoy(), por: usuario });
  }, usuario);
  await auditar({ entidad, id: nid, accion: 'crear', cambios: item });
  return { ok: true, id: nid };
}

const existe = (d, coleccion, eid, nombre) => d[coleccion].some((x) => x.id === eid) || fallar(`No existe ${nombre} "${eid}".`);
const fuenteDesc = Object.entries(FUENTES).map(([k, v]) => `${k} (${v})`).join('; ');

export function registrarEstrategia(definir) {
  definir('ver_estrategia', {
    titulo: 'Ver estrategia',
    descripcion: 'Árbol completo de la estrategia: visión, objetivos con avance y ritmo (en camino / en riesgo), y debajo sus estrategias por área con iniciativas y tareas pendientes. Filtra por enfoque: "ventas" (ventas, proyectos y entrega, finanzas) o "marca" (marca y contenido).',
    entrada: z.object({ enfoque: z.enum(['todo', 'ventas', 'marca']).default('todo') }),
  }, async ({ enfoque }) => {
    const ctx = await contexto();
    const { os } = ctx;
    const areas = ENFOQUES[enfoque];
    return {
      vision: os.vision?.texto,
      objetivos: objetivosDe(ctx, enfoque).map((o) => ({
        ...resumenObjetivo(o, ctx),
        estrategias: os.estrategias.filter((s) => s.objetivoId === o.id && (!areas || areas.includes(s.area))).map((s) => ({
          id: s.id, area: s.area, titulo: s.titulo, estado: s.estado,
          iniciativas: os.iniciativas.filter((i) => i.estrategiaId === s.id).map((i) => {
            const tareas = os.tareas.filter((t) => t.iniciativaId === i.id);
            return { id: i.id, titulo: i.titulo, estado: i.estado, fin: i.fin, tareas: `${tareas.filter((t) => t.estado === 'hecha').length}/${tareas.length} hechas` };
          }),
        })),
      })),
      estrategiasSinObjetivo: os.estrategias.filter((s) => !os.objetivos.some((o) => o.id === s.objetivoId) && (!areas || areas.includes(s.area))).map((s) => ({ id: s.id, area: s.area, titulo: s.titulo })),
    };
  });

  definir('actualizar_vision', {
    titulo: 'Actualizar visión',
    descripcion: 'Escribe o reemplaza la visión general de Optimind Partners (texto corto que guía toda la estrategia).',
    escritura: true,
    entrada: z.object({ texto: texto(2000).min(1) }),
  }, async ({ texto: t }, { usuario, auditar }) => {
    const antes = await modificar('os', (d) => { const a = d.vision?.texto; d.vision = { texto: t, actualizado: hoy(), por: usuario }; return a; }, usuario);
    await auditar({ entidad: 'vision', id: 'vision', cambios: { texto: [recortar(antes, 200) ?? null, recortar(t, 200)] } });
    return { ok: true };
  });

  definir('listar_objetivos', {
    titulo: 'Listar objetivos',
    descripcion: 'Objetivos de la empresa con su meta (número y fecha), avance en % y ritmo. Por defecto solo los activos.',
    entrada: z.object({ estado: z.enum([...ESTADOS_OBJ, 'todos']).default('activo'), enfoque: z.enum(['todo', 'ventas', 'marca']).default('todo') }),
  }, async ({ estado, enfoque }) => {
    const ctx = await contexto();
    return { items: objetivosDe(ctx, enfoque).filter((o) => estado === 'todos' || (o.estado || 'activo') === estado).map((o) => resumenObjetivo(o, ctx)) };
  });

  definir('ver_objetivo', {
    titulo: 'Ver objetivo',
    descripcion: 'Detalle de un objetivo: descripción, todas sus métricas con valor actual, meta, avance y últimos valores registrados, y sus estrategias.',
    entrada: z.object({ id }),
  }, async ({ id: oid }) => {
    const ctx = await contexto();
    const o = ctx.os.objetivos.find((x) => x.id === oid) || fallar(`No existe el objetivo "${oid}".`);
    const e = estadoObjetivo(o, ctx);
    return {
      ...o, avance: e.avance, ritmo: e.ritmo,
      metricas: e.metricas.map((m) => ({
        id: m.id, nombre: m.nombre, principal: m.id === o.metricaPrincipalId, tipo: m.tipo, fuente: m.fuente, parametro: m.parametro,
        valor: m.valor, inicial: m.inicial, meta: m.meta, unidad: m.unidad, avance: m.avance == null ? null : Math.round(m.avance * 100), ultimos: (m.valores || []).slice(-5),
      })),
      estrategias: ctx.os.estrategias.filter((s) => s.objetivoId === oid).map((s) => ({ id: s.id, area: s.area, titulo: s.titulo, estado: s.estado })),
    };
  });

  definir('crear_objetivo', {
    titulo: 'Crear objetivo',
    descripcion: `Crea un objetivo con número y fecha (ej. "Llegar a 15 clientes activos" al 2027-03-31) y su métrica principal. Si eliges una fuente automática, el avance se calcula solo con datos reales: ${fuenteDesc}. Sin fuente, la métrica es manual (se actualiza con registrar_metrica). Devuelve {id, metricaId}.`,
    escritura: true,
    entrada: z.object({
      titulo: texto(160).min(1), descripcion: texto(1000).optional(), area: z.enum(AREA_OBJ).default('general'),
      fecha_limite: fecha, meta: z.number(), unidad: texto(30).min(1).describe('ej. clientes, CLP, seguidores, %'),
      valor_inicial: z.number().default(0), fuente: z.enum(Object.keys(FUENTES)).optional(), parametro: texto(40).optional(),
      responsable: texto(40).optional(),
    }),
  }, async (a, { usuario, auditar }) => {
    const oid = nuevoId('obj');
    const mid = nuevoId('met');
    await modificar('os', (d) => {
      d.objetivos.push({ id: oid, titulo: a.titulo, descripcion: a.descripcion || '', area: a.area, fechaLimite: a.fecha_limite, estado: 'activo', responsable: a.responsable || usuario, metricaPrincipalId: mid, creado: hoy(), por: usuario });
      d.metricas.push({ id: mid, objetivoId: oid, nombre: a.titulo, unidad: a.unidad, inicial: a.valor_inicial, meta: a.meta, tipo: a.fuente ? 'automatica' : 'manual', fuente: a.fuente, parametro: a.parametro, valores: [], creado: hoy(), por: usuario });
    }, usuario);
    await auditar({ entidad: 'objetivo', id: oid, accion: 'crear', cambios: { titulo: a.titulo, meta: `${a.meta} ${a.unidad}`, fechaLimite: a.fecha_limite, fuente: a.fuente || 'manual' } });
    return { ok: true, id: oid, metricaId: mid };
  });

  definir('actualizar_objetivo', {
    titulo: 'Actualizar objetivo',
    descripcion: 'Cambia título, descripción, área, fecha límite, estado (activo/logrado/pausado/abandonado) o responsable de un objetivo. Para cambiar la meta numérica usa actualizar_metrica.',
    escritura: true,
    entrada: z.object({ id, titulo: texto(160).optional(), descripcion: texto(1000).optional(), area: z.enum(AREA_OBJ).optional(), fecha_limite: fecha.optional(), estado: z.enum(ESTADOS_OBJ).optional(), responsable: texto(40).optional() }),
  }, ({ id: oid, fecha_limite, ...c }, ctx) => actualizarEn('objetivos', 'objetivo', oid, { ...c, fechaLimite: fecha_limite }, ctx));

  definir('crear_estrategia', {
    titulo: 'Crear estrategia',
    descripcion: 'Crea una estrategia de un área (marca_contenido, ventas, proyectos_entrega, finanzas) ligada a un objetivo. Devuelve {id}.',
    escritura: true,
    entrada: z.object({ objetivoId: id, area: z.enum(AREAS), titulo: texto(160).min(1), descripcion: texto(2000).optional(), responsable: texto(40).optional() }),
  }, ({ objetivoId, ...a }, ctx) => crearEn('estrategias', 'estrategia', 'est', { objetivoId, ...a, estado: 'activa', responsable: a.responsable || ctx.usuario }, ctx, (d) => existe(d, 'objetivos', objetivoId, 'el objetivo')));

  definir('actualizar_estrategia', {
    titulo: 'Actualizar estrategia',
    descripcion: 'Cambia título, descripción, estado (activa/pausada/terminada), responsable u objetivo de una estrategia.',
    escritura: true,
    entrada: z.object({ id, titulo: texto(160).optional(), descripcion: texto(2000).optional(), estado: z.enum(ESTADOS_EST).optional(), responsable: texto(40).optional(), objetivoId: id.optional() }),
  }, ({ id: eid, ...c }, ctx) => actualizarEn('estrategias', 'estrategia', eid, c, ctx, (x, antes, d) => { if (c.objetivoId) existe(d, 'objetivos', c.objetivoId, 'el objetivo'); }));

  definir('crear_iniciativa', {
    titulo: 'Crear iniciativa',
    descripcion: 'Crea una iniciativa (proyecto concreto con fechas) dentro de una estrategia. Devuelve {id}.',
    escritura: true,
    entrada: z.object({ estrategiaId: id, titulo: texto(160).min(1), descripcion: texto(2000).optional(), inicio: fecha.optional(), fin: fecha.optional(), estado: z.enum(ESTADOS_INI).default('propuesta'), responsable: texto(40).optional() }),
  }, ({ estrategiaId, ...a }, ctx) => crearEn('iniciativas', 'iniciativa', 'ini', { estrategiaId, ...a, responsable: a.responsable || ctx.usuario }, ctx, (d) => existe(d, 'estrategias', estrategiaId, 'la estrategia')));

  definir('actualizar_iniciativa', {
    titulo: 'Actualizar iniciativa',
    descripcion: 'Cambia título, descripción, fechas, estado (propuesta/en curso/pausada/terminada) o responsable de una iniciativa.',
    escritura: true,
    entrada: z.object({ id, titulo: texto(160).optional(), descripcion: texto(2000).optional(), inicio: fecha.optional(), fin: fecha.optional(), estado: z.enum(ESTADOS_INI).optional(), responsable: texto(40).optional() }),
  }, ({ id: iid, ...c }, ctx) => actualizarEn('iniciativas', 'iniciativa', iid, c, ctx));

  definir('listar_tareas', {
    titulo: 'Listar tareas',
    descripcion: 'Tareas ordenadas por fecha de vencimiento. Por defecto las no hechas. Filtra por estado, responsable, área (vía su iniciativa y estrategia), iniciativa o "vence hasta".',
    entrada: z.object({
      estado: z.enum([...ESTADOS_TAR, 'abiertas', 'todas']).default('abiertas'), responsable: texto(40).optional(), area: z.enum(AREAS).optional(),
      iniciativaId: id.optional(), vence_hasta: fecha.optional(), ...paginacion,
    }),
  }, async ({ estado, responsable, area, iniciativaId, vence_hasta, pagina, limite }) => {
    const os = await leer('os');
    const areaDe = (t) => { const i = os.iniciativas.find((x) => x.id === t.iniciativaId); return i && os.estrategias.find((s) => s.id === i.estrategiaId)?.area; };
    const lista = os.tareas.filter((t) => (estado === 'todas' || (estado === 'abiertas' ? t.estado !== 'hecha' : t.estado === estado))
      && (!responsable || String(t.responsable || '').toLowerCase() === responsable.toLowerCase()) && (!area || areaDe(t) === area)
      && (!iniciativaId || t.iniciativaId === iniciativaId) && (!vence_hasta || (t.vence && t.vence <= vence_hasta)))
      .sort((a, b) => String(a.vence || '9999').localeCompare(String(b.vence || '9999')));
    return paginar(lista.map((t) => ({ id: t.id, titulo: t.titulo, estado: t.estado, prioridad: t.prioridad, responsable: t.responsable, vence: t.vence, area: areaDe(t), iniciativaId: t.iniciativaId, clienteId: t.clienteId, leadId: t.leadId })), pagina, limite);
  });

  definir('crear_tarea', {
    titulo: 'Crear tarea',
    descripcion: 'Crea una tarea, idealmente dentro de una iniciativa (así suma al área y al objetivo). Puede ligarse a un cliente o lead. Devuelve {id}.',
    escritura: true,
    entrada: z.object({
      titulo: texto(200).min(1), iniciativaId: id.optional(), detalle: texto(2000).optional(), prioridad: z.enum(['alta', 'media', 'baja']).default('media'),
      responsable: texto(40).optional(), vence: fecha.optional(), clienteId: id.optional(), leadId: id.optional(),
    }),
  }, ({ iniciativaId, ...a }, ctx) => crearEn('tareas', 'tarea', 'tar', { iniciativaId, ...a, estado: 'pendiente', responsable: a.responsable || ctx.usuario }, ctx, (d) => { if (iniciativaId) existe(d, 'iniciativas', iniciativaId, 'la iniciativa'); }));

  definir('actualizar_tarea', {
    titulo: 'Actualizar tarea',
    descripcion: 'Cambia una tarea: estado (pendiente/en curso/hecha/bloqueada; "hecha" guarda la fecha de término), prioridad, responsable, vencimiento, título, detalle o iniciativa.',
    escritura: true,
    entrada: z.object({ id, titulo: texto(200).optional(), detalle: texto(2000).optional(), estado: z.enum(ESTADOS_TAR).optional(), prioridad: z.enum(['alta', 'media', 'baja']).optional(), responsable: texto(40).optional(), vence: fecha.optional(), iniciativaId: id.optional() }),
  }, ({ id: tid, ...c }, ctx) => actualizarEn('tareas', 'tarea', tid, c, ctx, (x, antes, d) => {
    if (c.iniciativaId) existe(d, 'iniciativas', c.iniciativaId, 'la iniciativa');
    if (c.estado === 'hecha' && antes.estado !== 'hecha') x.completadaEl = hoy();
    if (c.estado && c.estado !== 'hecha') delete x.completadaEl;
  }));

  definir('crear_metrica', {
    titulo: 'Crear métrica',
    descripcion: `Agrega una métrica (resultado clave) a un objetivo. Automática si indicas fuente (${Object.keys(FUENTES).join(', ')}); si no, manual. "principal": true la usa para el avance del objetivo. Devuelve {id}.`,
    escritura: true,
    entrada: z.object({
      objetivoId: id, nombre: texto(160).min(1), unidad: texto(30).min(1), meta: z.number(), inicial: z.number().default(0),
      fuente: z.enum(Object.keys(FUENTES)).optional(), parametro: texto(40).optional(), estrategiaId: id.optional(),
      desde: fecha.optional().describe('Inicio del periodo de cálculo (por defecto, la creación del objetivo)'), principal: z.boolean().default(false),
    }),
  }, async ({ principal, objetivoId, fuente, ...a }, ctx) => {
    const r = await crearEn('metricas', 'metrica', 'met', { objetivoId, ...a, tipo: fuente ? 'automatica' : 'manual', fuente, valores: [] }, ctx, (d) => existe(d, 'objetivos', objetivoId, 'el objetivo'));
    if (principal) await modificar('os', (d) => { const o = d.objetivos.find((x) => x.id === objetivoId); if (o) o.metricaPrincipalId = r.id; }, ctx.usuario);
    return r;
  });

  definir('actualizar_metrica', {
    titulo: 'Actualizar métrica',
    descripcion: 'Cambia nombre, unidad, meta, valor inicial, fuente o parámetro de una métrica, o la marca como principal de su objetivo.',
    escritura: true,
    entrada: z.object({ id, nombre: texto(160).optional(), unidad: texto(30).optional(), meta: z.number().optional(), inicial: z.number().optional(), fuente: z.enum([...Object.keys(FUENTES), 'manual']).optional(), parametro: texto(40).optional(), desde: fecha.optional(), principal: z.boolean().optional() }),
  }, ({ id: mid, principal, fuente, ...c }, ctx) => actualizarEn('metricas', 'metrica', mid, c, ctx, (x, antes, d) => {
    if (fuente) { x.tipo = fuente === 'manual' ? 'manual' : 'automatica'; x.fuente = fuente === 'manual' ? undefined : fuente; }
    if (principal) { const o = d.objetivos.find((y) => y.id === x.objetivoId); if (o) o.metricaPrincipalId = x.id; }
  }));

  definir('registrar_metrica', {
    titulo: 'Registrar valor de métrica',
    descripcion: 'Anota el valor actual de una métrica manual (ej. "reuniones agendadas: 4"). Las automáticas se calculan solas y no aceptan valores.',
    escritura: true,
    entrada: z.object({ metricaId: id, valor: z.number(), fecha: fecha.optional(), nota: texto(300).optional() }),
  }, async ({ metricaId, valor, fecha: f, nota }, { usuario, auditar }) => {
    await modificar('os', (d) => {
      const m = d.metricas.find((x) => x.id === metricaId) || fallar(`No existe la métrica "${metricaId}".`);
      if (m.tipo === 'automatica') fallar(`"${m.nombre}" es automática (fuente ${m.fuente}); su valor se calcula solo.`);
      m.valores = [...(m.valores || []), { fecha: f || hoy(), valor, nota: nota || '', por: usuario }].slice(-100);
    }, usuario);
    await auditar({ entidad: 'metrica', id: metricaId, accion: 'valor', cambios: { valor, fecha: f || hoy() } });
    return { ok: true };
  });

  definir('listar_productos', {
    titulo: 'Listar productos',
    descripcion: 'Catálogo de productos y servicios que Optimind ofrece a sus clientes (páginas web, automatizaciones, planes), con estado (idea/en desarrollo/activo/pausado), precio, público y entregables.',
    entrada: z.object({ estado: z.enum(ESTADOS_PRD).optional() }),
  }, async ({ estado }) => {
    const os = await leer('os');
    return { items: os.productos.filter((p) => !estado || p.estado === estado) };
  });

  const camposProducto = {
    descripcion: texto(2000).optional(), tipo: z.enum(['servicio', 'producto', 'plan', 'automatizacion']).optional(),
    precio: z.number().min(0).optional().describe('Precio en CLP'), precioTexto: texto(80).optional().describe('ej. "desde $150.000" o "$15.000/mes"'),
    publico: texto(200).optional().describe('Para qué tipo de cliente es'), entregables: z.array(texto(160)).max(20).optional(), notas: texto(2000).optional(),
  };

  definir('crear_producto', {
    titulo: 'Crear producto',
    descripcion: 'Agrega un producto o servicio al catálogo de Optimind (por defecto en estado "idea"). Devuelve {id}.',
    escritura: true,
    entrada: z.object({ nombre: texto(120).min(1), estado: z.enum(ESTADOS_PRD).default('idea'), ...camposProducto }),
  }, (a, ctx) => crearEn('productos', 'producto', 'prd', a, ctx));

  definir('actualizar_producto', {
    titulo: 'Actualizar producto',
    descripcion: 'Cambia nombre, estado, precio, descripción, público, entregables o notas de un producto del catálogo.',
    escritura: true,
    entrada: z.object({ id, nombre: texto(120).optional(), estado: z.enum(ESTADOS_PRD).optional(), ...camposProducto }),
  }, ({ id: pid, ...c }, ctx) => actualizarEn('productos', 'producto', pid, c, ctx));
}

export { contexto };
