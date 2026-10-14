// Herramientas generales: resumen para ponerse al día, búsqueda global y auditoría. Y los dos roles
// (prompts) con los que se trabaja: estratega de ventas y estratega de marca.
import { z } from 'zod';
import { ENFOQUES, ETAPAS, UNIDADES, texto } from './comun.js';
import { contexto, objetivosDe, resumenObjetivo, deUnidad } from './h-estrategia.js';
import { calcularFuente } from './metricas.js';
import { ultimosEventos } from './auditoria.js';
import { hoy, sumarDias, lunesDe, recortar } from './util.js';

function bloqueVentas(ctx, u) {
  const { crm, os } = ctx;
  const h = hoy();
  const leads = crm.prospectos.filter((p) => !u || p.unidad === u);
  const clientesU = crm.clientes.filter((c) => !u || c.unidad === u);
  const etapa = (p) => p.estado || 'por contactar';
  const abiertos = leads.filter((p) => !['cerrado', 'no interesado'].includes(etapa(p)));
  const mesIni = h.slice(0, 8) + '01';
  const cobros = clientesU.filter((c) => c.estado !== 'inactivo' && c.hosting?.activo && c.hosting.proximoCobro && c.hosting.proximoCobro <= sumarDias(h, 14))
    .map((c) => ({ cliente: c.negocio, fecha: c.hosting.proximoCobro, monto: c.hosting.monto, atrasado: c.hosting.proximoCobro < h || undefined }));
  const porOrigen = {};
  for (const p of leads) porOrigen[p.origen || 'sin_dato'] = (porOrigen[p.origen || 'sin_dato'] || 0) + 1;
  return {
    embudo: Object.fromEntries(ETAPAS.map((e) => [e, leads.filter((p) => etapa(p) === e).length])),
    leadsPorOrigen: porOrigen,
    contactarHoy: abiertos.filter((p) => p.contactarEl && p.contactarEl <= h).sort((a, b) => a.contactarEl.localeCompare(b.contactarEl)).slice(0, 10)
      .map((p) => ({ id: p.id, negocio: p.negocio, etapa: etapa(p), contactarEl: p.contactarEl, atrasado: p.contactarEl < h || undefined })),
    interesados: leads.filter((p) => etapa(p) === 'interesado').slice(0, 10).map((p) => ({ id: p.id, negocio: p.negocio, rubro: p.rubro, ultimoContacto: (p.mensajes || []).at(-1)?.fecha })),
    clientes: {
      activos: calcularFuente('clientes_activos', null, ctx, h, h, u),
      ingresoMensualRecurrente: calcularFuente('ingreso_mensual_recurrente', null, ctx, h, h, u),
      cobradoEsteMes: calcularFuente('ingresos_cobrados', null, ctx, mesIni, h, u),
      nuevosEsteMes: calcularFuente('clientes_nuevos', null, ctx, mesIni, h, u),
    },
    cobrosProximos14Dias: cobros,
    productos: os.productos.filter((p) => p.estado !== 'pausado' && deUnidad(p, u)).map((p) => ({ id: p.id, nombre: p.nombre, unidad: p.unidad, estado: p.estado, precio: p.precioTexto || p.precio })),
    ...(u ? {} : { leadsSinUnidad: leads.filter((p) => !p.unidad).length || undefined })
  };
}

function bloqueMarca(ctx) {
  const { contenido: c, crm } = ctx;
  const h = hoy();
  const lunes = lunesDe(h);
  const semanas = [...c.metricasRedes].sort((a, b) => b.semana.localeCompare(a.semana));
  const [ult, prev] = semanas;
  const rutina = c.rutina.semanas.find((s) => s.semana === lunes);
  const brief = [...c.briefings].sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
  const proximas = c.publicaciones.filter((p) => p.fecha && p.fecha >= lunes && p.fecha <= sumarDias(h, 14) && p.estado !== 'Publicado')
    .sort((a, b) => a.fecha.localeCompare(b.fecha)).map((p) => ({ n: p.n, fecha: p.fecha, estado: p.estado, titulo: p.titulo }));
  const social = crm.prospectos.filter((p) => ['instagram', 'tiktok'].includes(p.origen));
  return {
    publicaciones: {
      porEstado: Object.fromEntries(['Idea', 'Guion', 'Grabado', 'Editado', 'Publicado'].map((e) => [e, c.publicaciones.filter((p) => p.estado === e).length])),
      publicadasEstaSemana: c.publicaciones.filter((p) => p.estado === 'Publicado' && p.fecha >= lunes).length,
      proximas14Dias: proximas.slice(0, 10),
      sinFecha: c.publicaciones.filter((p) => !p.fecha && p.estado !== 'Publicado').length,
    },
    redes: ult ? {
      semana: ult.semana, seguidoresIg: ult.seguidoresIg, seguidoresTiktok: ult.seguidoresTiktok,
      deltaIg: prev && ult.seguidoresIg != null && prev.seguidoresIg != null ? ult.seguidoresIg - prev.seguidoresIg : undefined,
      deltaTiktok: prev && ult.seguidoresTiktok != null && prev.seguidoresTiktok != null ? ult.seguidoresTiktok - prev.seguidoresTiktok : undefined,
      diagnosticos: ult.diagnosticos, mensajes: ult.mensajes, mejorPost: ult.mejorPost,
    } : 'Sin métricas registradas todavía',
    rutinaSemana: rutina ? `${rutina.items.filter((i) => i.hecho).length}/${rutina.items.length} hechas` : (c.rutina.plantilla.length ? `0/${c.rutina.plantilla.length} hechas` : 'Sin plantilla de rutina'),
    ultimoBriefing: brief ? { fecha: brief.fecha, titulo: brief.titulo, texto: recortar(brief.texto, 300) } : undefined,
    leadsDesdeRedes: { total: social.length, cerrados: social.filter((p) => p.estado === 'cerrado').length },
  };
}

function tareasDe(ctx, enfoque, u) {
  const { os } = ctx;
  const areas = ENFOQUES[enfoque];
  const estDe = (t) => { const i = os.iniciativas.find((x) => x.id === t.iniciativaId); return i && os.estrategias.find((s) => s.id === i.estrategiaId); };
  const areaDe = (t) => estDe(t)?.area;
  const h = hoy();
  const abiertas = os.tareas.filter((t) => t.estado !== 'hecha' && (!areas || !areaDe(t) || areas.includes(areaDe(t))) && deUnidad(estDe(t) || {}, u));
  const corta = (t) => ({ id: t.id, titulo: t.titulo, vence: t.vence, responsable: t.responsable, estado: t.estado, prioridad: t.prioridad });
  return {
    vencidas: abiertas.filter((t) => t.vence && t.vence < h).map(corta),
    proximos7Dias: abiertas.filter((t) => t.vence && t.vence >= h && t.vence <= sumarDias(h, 7)).map(corta),
    bloqueadas: abiertas.filter((t) => t.estado === 'bloqueada').map(corta),
    totalAbiertas: abiertas.length,
  };
}

export function registrarGeneral(definir, server) {
  definir('resumen_empresa', {
    titulo: 'Resumen de la empresa',
    descripcion: 'Úsala al empezar una conversación para ponerte al día en una sola llamada. enfoque "ventas": visión, objetivos con avance, embudo de leads, a quién contactar hoy, interesados, clientes, ingresos, cobros próximos, catálogo de productos y tareas. enfoque "marca": visión, objetivos de marca, calendario de publicaciones, métricas de redes, rutina de comunidad, último briefing y leads que vienen de redes. "todo": ambos. unidad_negocio (web_agenda o erp_talleres) acota objetivos, leads, clientes, ingresos, productos y tareas a esa unidad (más lo general).',
    entrada: z.object({ enfoque: z.enum(['todo', 'ventas', 'marca']).default('todo'), unidad_negocio: z.enum(UNIDADES).optional() }),
  }, async ({ enfoque, unidad_negocio: u }) => {
    const ctx = await contexto();
    return {
      hoy: hoy(),
      vision: ctx.os.vision?.texto || 'Sin visión definida (usa actualizar_vision)',
      unidad: u,
      objetivos: objetivosDe(ctx, enfoque, u).filter((o) => (o.estado || 'activo') === 'activo').map((o) => resumenObjetivo(o, ctx)),
      ...(enfoque !== 'marca' ? { ventas: bloqueVentas(ctx, u) } : {}),
      ...(enfoque !== 'ventas' ? { marca: bloqueMarca(ctx) } : {}),
      tareas: tareasDe(ctx, enfoque, u),
    };
  });

  definir('buscar', {
    titulo: 'Buscar',
    descripcion: 'Busca un texto en clientes, leads, tareas, iniciativas, productos y publicaciones. Devuelve hasta 25 coincidencias con tipo e id para pedir el detalle con la herramienta correspondiente.',
    entrada: z.object({ texto: texto(80).min(2) }),
  }, async ({ texto: q }) => {
    const ctx = await contexto();
    const s = q.toLowerCase();
    const has = (...v) => v.some((x) => String(x || '').toLowerCase().includes(s));
    const r = [
      ...ctx.crm.clientes.filter((c) => has(c.negocio, c.contacto, c.ciudad, c.notas)).map((c) => ({ tipo: 'cliente', id: c.id, nombre: c.negocio })),
      ...ctx.crm.prospectos.filter((p) => has(p.negocio, p.contacto, p.rubro, p.comuna, p.notas)).map((p) => ({ tipo: 'lead', id: p.id, nombre: p.negocio, etapa: p.estado || 'por contactar' })),
      ...ctx.os.tareas.filter((t) => has(t.titulo, t.detalle)).map((t) => ({ tipo: 'tarea', id: t.id, nombre: t.titulo, estado: t.estado })),
      ...ctx.os.iniciativas.filter((i) => has(i.titulo, i.descripcion)).map((i) => ({ tipo: 'iniciativa', id: i.id, nombre: i.titulo })),
      ...ctx.os.productos.filter((p) => has(p.nombre, p.descripcion)).map((p) => ({ tipo: 'producto', id: p.id, nombre: p.nombre })),
      ...ctx.contenido.publicaciones.filter((p) => has(p.titulo, p.gancho, p.contenido)).map((p) => ({ tipo: 'publicacion', id: p.id, nombre: `#${p.n} ${p.titulo}` })),
    ];
    return { total: r.length, items: r.slice(0, 25) };
  });

  definir('ver_auditoria', {
    titulo: 'Ver auditoría',
    descripcion: 'Últimos cambios hechos a través de este conector (quién, qué herramienta, qué entidad y qué campos cambiaron, y cuándo). Sirve para revisar qué hizo Claude.',
    entrada: z.object({ dias: z.number().int().min(1).max(30).default(7), limite: z.number().int().min(1).max(100).default(30), herramienta: texto(60).optional() }),
  }, async (a) => ({ items: await ultimosEventos(a) }));

  // Roles: cada conversación trabaja con un foco distinto.
  server.registerPrompt('estratega_ventas', {
    title: 'Estratega de ventas y productos',
    description: 'Rol para captar leads y clientes y diseñar productos para los clientes de Optimind.',
  }, () => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Actúa como estratega principal de ventas y productos de Optimind Partners (soluciones tecnológicas y automatización para pymes chilenas). Tu foco: conseguir leads, convertirlos en clientes y crear productos que esos clientes compren.
Hay dos unidades de negocio: web_agenda (webs con agendamiento de citas para pymes unipersonales, la vende el fundador) y erp_talleres (ERP Tuerkit para talleres mecánicos, a cargo de Pablo).
1. Empieza con resumen_empresa (enfoque "ventas", y unidad_negocio si la conversación es de una sola unidad) y revisa objetivos, embudo y a quién contactar hoy.
2. Propón acciones concretas con número y fecha, ligadas a un objetivo (idealmente uno por unidad); regístralas con crear_estrategia / crear_iniciativa / crear_tarea.
3. Cada lead nuevo va con su origen y su unidad de negocio (crear_lead). Cada contacto, con registrar_contacto_lead. Cada cambio de etapa, con actualizar_etapa_lead.
4. Cuida el catálogo (listar_productos / crear_producto): qué vender, a quién y a qué precio.
5. No inventes datos: si falta información, pregúntala. No borres nada (el conector no puede borrar).`,
      },
    }],
  }));

  server.registerPrompt('estratega_marca', {
    title: 'Estratega de marca y contenido',
    description: 'Rol para crear la marca, el contenido y la imagen de Optimind en redes.',
  }, () => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Actúa como estratega principal de marca y contenido de Optimind Partners (soluciones tecnológicas y automatización para pymes chilenas). Tu foco: la imagen de marca, el contenido en Instagram y TikTok y que ese contenido traiga clientes.
1. Empieza con resumen_empresa (enfoque "marca") y revisa objetivos, calendario, métricas y el último briefing.
2. Planifica publicaciones (crear_publicacion / actualizar_publicacion) con pilar, formato, gancho y guion.
3. Registra cada semana las métricas (registrar_metricas_redes), escribe el briefing (crear_briefing) y lleva la rutina de comunidad.
4. Usa reporte_contenido_a_ventas para ver qué contenido termina en ventas y repetir lo que funciona.
5. No inventes datos: si falta información, pregúntala. No borres nada (el conector no puede borrar).`,
      },
    }],
  }));
}
