// Pestañas Ventas (estrategia para conseguir leads y clientes, y productos) y Marca (contenido e imagen de marca).
// Solo muestran: la estrategia, el contenido y las métricas se llenan desde Claude con el conector Optimind OS.
const AREA_NOMBRE = { ventas: 'Ventas', proyectos_entrega: 'Proyectos y entrega', finanzas: 'Finanzas', marca_contenido: 'Marca y contenido', general: 'General' };
const AREAS_VENTAS = ['ventas', 'proyectos_entrega', 'finanzas'];
const ESTADOS_PUB = ['Idea', 'Guion', 'Grabado', 'Editado', 'Publicado'];
const ETAPAS = ['por contactar', 'contactado', 'interesado', 'cerrado', 'no interesado'];
const ORIGEN_NOMBRE = { instagram: 'Instagram', tiktok: 'TikTok', whatsapp_frio: 'WhatsApp frío', correo_frio: 'Correo frío', referido: 'Referido', google: 'Google', web: 'Web', otro: 'Otro', sin_dato: 'Sin dato' };
const RITMO = { 'en camino': 'ok', logrado: 'ok', 'en riesgo': 'pronto', vencido: 'atrasado' };

export function iniciarEstrategia({ h, $, badge, abrir, kv, estado, fechaLarga }) {
  let datos = null;
  let cargadoEn = 0;
  let cargando = false;

  async function cargar() {
    if (cargando) return;
    cargando = true;
    try {
      const r = await fetch('/api/panel/os', { headers: { accept: 'application/json' } });
      if (r.ok) datos = await r.json();
    } catch { /* sin conexión: se muestra el aviso y se reintenta en un minuto */ }
    cargando = false;
    cargadoEn = Date.now();
    render();
  }

  const vacio = (texto) => h('p', { class: 'muted empty' }, texto);
  const titulo = (t, extra) => h('div', { class: 'section-head' }, h('h2', {}, t), extra || null);
  const pct = (n) => (n == null ? '—' : `${n}%`);

  // Objetivos de un enfoque: los generales y los de sus áreas (o con estrategias en ellas).
  function objetivosDe(areas) {
    return datos.objetivos.filter((o) => (o.estado || 'activo') === 'activo' && (!o.area || o.area === 'general' || areas.includes(o.area)
      || datos.estrategias.some((s) => s.objetivoId === o.id && areas.includes(s.area))));
  }

  function tarjetaObjetivo(o) {
    return h('div', { class: 'ccard pcard obj' },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, o.titulo), o.ritmo ? badge(RITMO[o.ritmo] || 'inactivo', o.ritmo) : null),
      h('div', { class: 'barra', role: 'img', 'aria-label': `Avance ${pct(o.avance)}` }, h('span', { style: `width:${o.avance || 0}%` })),
      h('div', { class: 'row muted', style: 'justify-content:space-between;font-size:13px' },
        h('span', {}, o.meta || 'Sin métrica'), h('span', {}, `${pct(o.avance)} · al ${fechaLarga(o.fechaLimite)}`)));
  }

  function bloqueEstrategias(areas) {
    const ests = datos.estrategias.filter((s) => areas.includes(s.area) && s.estado !== 'terminada');
    if (!ests.length) return vacio('Todavía no hay estrategias en esta área. Pídele a Claude que proponga una ligada a un objetivo.');
    return h('div', { class: 'list' }, ests.map((s) => {
      const obj = datos.objetivos.find((o) => o.id === s.objetivoId);
      const inis = datos.iniciativas.filter((i) => i.estrategiaId === s.id);
      return h('div', { class: 'item est' },
        h('div', { style: 'flex:1;min-width:220px' },
          h('div', { class: 'row' }, h('b', {}, s.titulo), areas.length > 1 ? badge('inactivo', AREA_NOMBRE[s.area]) : null, s.estado === 'pausada' ? badge('mes', 'pausada') : null),
          obj ? h('small', { class: 'muted' }, `Objetivo: ${obj.titulo}`) : null,
          inis.length ? h('ul', { class: 'inis' }, inis.map((i) => {
            const t = datos.tareas.filter((x) => x.iniciativaId === i.id);
            return h('li', {}, h('span', {}, i.titulo), ' ', badge(i.estado === 'en curso' ? 'ok' : i.estado === 'terminada' ? 'inactivo' : 'mes', i.estado || 'propuesta'),
              t.length ? h('small', { class: 'muted' }, ` ${t.filter((x) => x.estado === 'hecha').length}/${t.length} tareas`) : null);
          })) : null));
    }));
  }

  function bloqueTareas(areas) {
    const areaDe = (t) => { const i = datos.iniciativas.find((x) => x.id === t.iniciativaId); return i && datos.estrategias.find((s) => s.id === i.estrategiaId)?.area; };
    const lista = datos.tareas.filter((t) => t.estado !== 'hecha' && (!areaDe(t) ? areas.includes('ventas') : areas.includes(areaDe(t))))
      .sort((a, b) => String(a.vence || '9999').localeCompare(String(b.vence || '9999'))).slice(0, 15);
    if (!lista.length) return vacio('Sin tareas pendientes.');
    const hoy = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
    return h('div', { class: 'list' }, lista.map((t) => h('div', { class: 'item' },
      h('div', { style: 'flex:1;min-width:200px' }, h('b', {}, t.titulo), h('small', { class: 'muted', style: 'display:block' }, [t.responsable, t.prioridad && `prioridad ${t.prioridad}`].filter(Boolean).join(' · '))),
      t.estado === 'bloqueada' ? badge('atrasado', 'bloqueada') : null,
      t.vence ? badge(t.vence < hoy ? 'atrasado' : 'mes', `vence ${fechaLarga(t.vence)}`) : null)));
  }

  function renderVentas() {
    const cont = $('#ventas');
    const leads = estado().data.prospectos || [];
    const etapa = (p) => p.estado || 'por contactar';
    const porOrigen = {};
    for (const p of leads) porOrigen[p.origen || 'sin_dato'] = (porOrigen[p.origen || 'sin_dato'] || 0) + 1;
    const objs = objetivosDe(AREAS_VENTAS);
    cont.replaceChildren(
      datos.vision?.texto ? h('div', { class: 'card vision' }, h('small', { class: 'muted' }, 'Visión'), h('p', {}, datos.vision.texto)) : null,
      titulo('Objetivos'),
      objs.length ? h('div', { class: 'grid' }, objs.map(tarjetaObjetivo)) : vacio('Sin objetivos todavía. Pídele a Claude que cree uno con número y fecha (ej. "15 clientes activos al 31 de marzo").'),
      titulo('Embudo de leads', h('span', { class: 'muted' }, `${leads.length} leads`)),
      h('div', { class: 'kpis' }, ETAPAS.slice(0, 4).map((e) => h('div', { class: 'kpi' }, h('span', {}, e[0].toUpperCase() + e.slice(1)), h('b', {}, leads.filter((p) => etapa(p) === e).length)))),
      h('p', { class: 'muted', style: 'margin:10px 0 0' }, 'Por origen: ', Object.entries(porOrigen).sort((a, b) => b[1] - a[1]).map(([o, n]) => `${ORIGEN_NOMBRE[o] || o} ${n}`).join(' · ') || '—'),
      titulo('Estrategias'),
      bloqueEstrategias(AREAS_VENTAS),
      titulo('Productos para clientes'),
      datos.productos.length ? h('div', { class: 'grid' }, datos.productos.map((p) => h('div', { class: 'ccard pcard' },
        h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, p.nombre), badge(p.estado === 'activo' ? 'ok' : p.estado === 'pausado' ? 'inactivo' : 'mes', p.estado)),
        p.descripcion ? h('p', { class: 'muted', style: 'margin:0;font-size:14px' }, p.descripcion) : null,
        kv([['Precio', p.precioTexto || (p.precio ? `$${Number(p.precio).toLocaleString('es-CL')}` : '')], ['Para', p.publico], ['Incluye', (p.entregables || []).join(', ')]])))) : vacio('El catálogo está vacío. Pídele a Claude que diseñe los productos que vamos a ofrecer.'),
      titulo('Tareas pendientes'),
      bloqueTareas(AREAS_VENTAS),
    );
  }

  function renderMarca() {
    const cont = $('#marca');
    const leads = (estado().data.prospectos || []).filter((p) => ['instagram', 'tiktok'].includes(p.origen));
    const objs = objetivosDe(['marca_contenido']).filter((o) => o.area === 'marca_contenido' || datos.estrategias.some((s) => s.objetivoId === o.id && s.area === 'marca_contenido'));
    const brief = datos.briefings[0];
    const r = datos.rutina;
    cont.replaceChildren(
      titulo('Objetivos de marca'),
      objs.length ? h('div', { class: 'grid' }, objs.map(tarjetaObjetivo)) : vacio('Sin objetivos de marca todavía (ej. "1.000 seguidores en Instagram al 31 de enero").'),
      titulo('Estrategias de marca y contenido'),
      bloqueEstrategias(['marca_contenido']),
      titulo('Calendario de contenido', h('span', { class: 'muted' }, `${datos.publicaciones.length} publicaciones`)),
      datos.publicaciones.length ? h('div', { class: 'kanban' }, ESTADOS_PUB.map((e) => {
        const pubs = datos.publicaciones.filter((p) => p.estado === e).sort((a, b) => String(a.fecha || '9999').localeCompare(String(b.fecha || '9999')));
        return h('div', { class: 'kcol' }, h('h3', {}, `${e} `, h('span', { class: 'muted' }, pubs.length)),
          pubs.slice(0, e === 'Publicado' ? 8 : 30).map((p) => h('div', { class: 'kcard' },
            h('small', { class: 'muted' }, [`#${p.n}`, p.fecha && fechaLarga(p.fecha), p.formato].filter(Boolean).join(' · ')),
            h('b', {}, p.titulo || 'Sin título'), p.pilar ? h('small', { class: 'muted' }, p.pilar) : null)));
      })) : vacio('Sin publicaciones. Pídele a Claude, en la conversación de marca, que arme el calendario.'),
      titulo('Métricas semanales de redes'),
      datos.metricasRedes.length ? h('div', { style: 'overflow-x:auto' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, ['Semana', 'IG', 'TikTok', 'Guardados', 'Compartidos', 'Coment.', 'Mensajes', 'Diagnósticos', 'Mejor post'].map((t) => h('th', {}, t)))),
        h('tbody', {}, datos.metricasRedes.map((s) => h('tr', {}, [`${Number(s.semana.slice(8))}/${Number(s.semana.slice(5, 7))}`, s.seguidoresIg, s.seguidoresTiktok, s.guardados, s.compartidos, s.comentarios, s.mensajes, s.diagnosticos, s.mejorPost].map((v) => h('td', {}, v ?? '—'))))))) : vacio('Sin métricas registradas.'),
      h('p', { class: 'muted', style: 'margin:10px 0 0' }, `Leads que llegaron por redes: ${leads.length} · cerrados: ${leads.filter((p) => p.estado === 'cerrado').length}`),
      titulo('Rutina de comunidad', h('span', { class: 'muted' }, `semana del ${fechaLarga(r.semana)}`)),
      r.items.length ? h('ul', { class: 'rutina' }, r.items.map((i) => h('li', { class: i.hecho ? 'hecho' : '' }, h('span', { 'aria-hidden': 'true' }, i.hecho ? '✓' : '○'), ' ', i.tarea, h('span', { class: 'sr' }, i.hecho ? ' (hecha)' : ' (pendiente)')))) : vacio('Sin rutina definida.'),
      titulo('Último briefing del estratega'),
      brief ? h('div', { class: 'card' }, h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, brief.titulo), h('small', { class: 'muted' }, fechaLarga(brief.fecha))),
        h('p', { style: 'white-space:pre-wrap' }, brief.texto),
        datos.briefings.length > 1 ? h('button', { class: 'btn btn-sm', onclick: () => abrir('Briefings anteriores', null, datos.briefings.slice(1).map((b) => h('div', { class: 'blk' }, h('h3', {}, `${b.titulo} · ${fechaLarga(b.fecha)}`), h('p', { style: 'white-space:pre-wrap' }, b.texto)))) }, 'Ver anteriores') : null) : vacio('Sin briefings todavía.'),
      titulo('Biblioteca de marca'),
      datos.biblioteca.length ? h('div', { class: 'list' }, datos.biblioteca.map((a) => h('div', { class: 'item' },
        h('div', { style: 'flex:1' }, h('b', {}, a.nombre), h('small', { class: 'muted', style: 'display:block' }, [a.tipo, a.categoria].filter(Boolean).join(' · '))),
        /^https:\/\//.test(a.url) ? h('a', { class: 'btn btn-sm', href: a.url, target: '_blank', rel: 'noopener' }, 'Abrir') : null))) : vacio('La biblioteca está vacía.'),
    );
  }

  function render() {
    const ventas = !$('#tab-ventas').hidden;
    const marca = !$('#tab-marca').hidden;
    if (!ventas && !marca) return;
    if (Date.now() - cargadoEn > 60000) {
      if (!datos) $(ventas ? '#ventas' : '#marca').replaceChildren(vacio('Cargando…'));
      cargar();
    }
    if (!datos) {
      if (cargadoEn && !cargando) $(ventas ? '#ventas' : '#marca').replaceChildren(vacio('No se pudieron cargar los datos. Se reintenta en un minuto.'));
      return;
    }
    if (ventas) renderVentas();
    if (marca) renderMarca();
  }

  return { render };
}
