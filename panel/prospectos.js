// Prospectos: negocios a los que les ofrecemos página, con lo que les hemos creado (maquetas, etc.).
export const ESTADOS_P = ['por contactar', 'contactado', 'interesado', 'cerrado', 'no interesado'];
const COLOR_P = { 'por contactar': 'inactivo', contactado: 'mes', interesado: 'pronto', cerrado: 'ok', 'no interesado': 'atrasado' };

export function iniciarProspectos(u) {
  const { h, $, badge, abrir, cerrar, cambiar, kv, enlace, urlSegura, waLink, idNuevo, campo, filasRepetibles, fechaLarga, hoy, estado, formulario, trabajosDe } = u;
  const lista = () => estado().data.prospectos || [];
  const buscar = (id) => lista().find((p) => p.id === id);
  const etiqueta = (p) => badge(COLOR_P[p.estado] || 'inactivo', p.estado || 'por contactar');

  function creados(p) {
    const links = (p.creado || []).filter((l) => urlSegura(l.url));
    return links.length
      ? h('div', { class: 'chips' }, links.map((l) => h('a', { class: 'btn btn-sm', href: urlSegura(l.url), target: '_blank', rel: 'noopener' }, l.nombre || 'Ver')))
      : h('span', { class: 'muted', style: 'font-size:14px' }, 'Aún no le creamos nada');
  }

  function botonWhatsApp(p, chico) {
    const url = waLink(p.whatsapp, p.mensaje);
    return url ? h('a', { class: `btn btn-wa${chico ? ' btn-sm' : ''}`, href: url, target: '_blank', rel: 'noopener' }, 'Escribir por WhatsApp') : null;
  }

  function render() {
    const q = $('#buscar').value.trim().toLowerCase();
    const todos = lista();
    const visibles = todos
      .filter((p) => !q || [p.negocio, p.rubro, p.comuna, p.contacto].some((v) => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => ESTADOS_P.indexOf(a.estado) - ESTADOS_P.indexOf(b.estado) || String(a.negocio).localeCompare(String(b.negocio)));
    const conteo = ESTADOS_P.map((e) => [e, todos.filter((p) => (p.estado || 'por contactar') === e).length]).filter(([, n]) => n);
    $('#prospectos-resumen').textContent = conteo.map(([e, n]) => `${n} ${e}`).join(' · ');
    const cont = $('#prospectos');
    cont.replaceChildren();
    if (!visibles.length) { cont.append(h('div', { class: 'empty' }, q ? 'Ningún prospecto coincide con la búsqueda.' : 'Aún no hay prospectos.')); return; }
    for (const p of visibles) {
      cont.append(h('div', { class: 'ccard pcard' },
        h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start' },
          h('button', { class: 'link', style: 'text-align:left', onclick: () => detalle(p.id) }, h('h3', {}, p.negocio)), etiqueta(p)),
        h('div', { class: 'muted', style: 'font-size:14px' }, [p.rubro, p.comuna].filter(Boolean).join(' · ')),
        h('div', {}, h('div', { class: 'mini' }, 'Lo que le creamos'), creados(p)),
        h('div', { class: 'row' }, botonWhatsApp(p, true), h('button', { class: 'btn btn-sm', onclick: () => detalle(p.id) }, 'Ver ficha')),
      ));
    }
  }

  function detalle(id) {
    const p = buscar(id);
    if (!p) return cerrar();
    const wa = waLink(p.whatsapp);
    const trabajos = trabajosDe({ prospectoId: id });
    const sel = h('select', { 'aria-label': 'Estado', style: 'width:auto' }, ESTADOS_P.map((e) => h('option', { value: e, selected: e === (p.estado || 'por contactar') }, e)));
    sel.addEventListener('change', () => cambiar((d) => { const x = (d.prospectos || []).find((y) => y.id === id); if (x) x.estado = sel.value; }, 'Estado actualizado').then(() => detalle(id)));
    abrir(p.negocio, [p.rubro, p.comuna].filter(Boolean).join(' · '), [
      h('div', { class: 'blk' }, h('h3', {}, 'Estado'), h('div', { class: 'row' }, sel, p.clienteId ? h('span', { class: 'muted' }, 'Ya es cliente') : null)),
      h('div', { class: 'blk' }, h('h3', {}, 'Lo que le creamos'), creados(p)),
      h('div', { class: 'blk' }, h('h3', {}, 'Datos'), kv([
        ['Contacto', p.contacto],
        ['WhatsApp', wa ? enlace(wa, `+${String(p.whatsapp).replace(/\D/g, '')}`) : 'Sin WhatsApp'],
        ['Teléfono', p.telefono],
        ['Dirección', p.direccion],
        ['Redes / web', p.redes ? enlace(/^https?:\/\//.test(p.redes) ? p.redes : `https://${p.redes}`, p.redes) : null],
        ['Responsable', p.responsable],
        ['Agregado', fechaLarga(p.desde)],
      ])),
      p.mensaje ? h('div', { class: 'blk' }, h('h3', {}, 'Primer mensaje sugerido'),
        h('p', { style: 'white-space:pre-wrap;margin:0 0 8px' }, p.mensaje),
        h('button', { class: 'btn btn-sm', onclick: (e) => { navigator.clipboard?.writeText(p.mensaje).then(() => { e.target.textContent = 'Copiado'; }); } }, 'Copiar mensaje')) : null,
      p.notas ? h('div', { class: 'blk' }, h('h3', {}, 'Notas'), h('p', { style: 'white-space:pre-wrap;margin:0' }, p.notas)) : null,
      trabajos.length ? h('div', { class: 'blk' }, h('h3', {}, 'Trabajos'), h('table', { class: 'table' },
        trabajos.map((t) => h('tr', {}, h('td', { style: 'white-space:nowrap' }, fechaLarga(t.fecha)), h('td', {}, t.titulo))))) : null,
    ], [
      h('button', { class: 'btn btn-danger', style: 'margin-right:auto', onclick: () => eliminar(id) }, 'Eliminar'),
      botonWhatsApp(p),
      p.clienteId ? null : h('button', { class: 'btn', onclick: () => pasarACliente(id) }, 'Pasar a cliente'),
      h('button', { class: 'btn btn-primary', onclick: () => formularioProspecto(id) }, 'Editar'),
    ]);
  }

  async function eliminar(id) {
    const p = buscar(id);
    if (!p || !confirm(`¿Eliminar el prospecto ${p.negocio}? Si no le interesó, mejor márcalo como "no interesado".`)) return;
    if (await cambiar((d) => { d.prospectos = (d.prospectos || []).filter((x) => x.id !== id); }, 'Prospecto eliminado')) cerrar();
  }

  function pasarACliente(id) {
    const p = buscar(id);
    const web = (p.creado || []).map((l) => urlSegura(l.url)).find(Boolean) || '';
    formulario(null, {
      negocio: p.negocio, contacto: p.contacto, whatsapp: p.whatsapp, ciudad: p.comuna, web,
      notas: [p.notas, `Viene de prospectos (${p.rubro || ''}).`].filter(Boolean).join('\n'),
      accesos: (p.creado || []).filter((l) => urlSegura(l.url)),
    }, id);
  }

  function formularioProspecto(id) {
    const p = id ? structuredClone(buscar(id)) : { estado: 'por contactar', responsable: estado().usuario, desde: hoy(), creado: [] };
    const f = {
      negocio: campo('Negocio *', p.negocio, { req: true }),
      rubro: campo('Rubro', p.rubro, { ph: 'Ej: Podología' }),
      comuna: campo('Comuna', p.comuna),
      direccion: campo('Dirección', p.direccion),
      contacto: campo('Contacto (dueño)', p.contacto),
      whatsapp: campo('WhatsApp', p.whatsapp, { ph: '56912345678' }),
      telefono: campo('Teléfono fijo', p.telefono),
      redes: campo('Instagram / web', p.redes),
      responsable: campo('Responsable', p.responsable),
      estado: campo('Estado', p.estado, { opciones: ESTADOS_P.map((e) => [e, e]) }),
      mensaje: campo('Primer mensaje sugerido', p.mensaje, { tipo: 'textarea', full: true }),
      notas: campo('Notas', p.notas, { tipo: 'textarea', full: true }),
    };
    const creado = filasRepetibles(p.creado || [], [['nombre', 'Qué es (ej: Maqueta)'], ['url', 'https://…']], '', '+ Agregar link');
    const error = h('p', { class: 'error', hidden: true });
    const form = h('form', { class: 'form', id: 'form-prospecto' },
      Object.values(f).slice(0, 10).map((x) => x.el),
      h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Lo que le creamos (maquetas, propuestas)'), creado),
      f.mensaje.el, f.notas.el, error);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = (k) => f[k].input.value.trim();
      if (!v('negocio')) { error.textContent = 'Falta el nombre del negocio.'; error.hidden = false; return; }
      if (creado.valores().some((l) => l.url && !urlSegura(l.url))) { error.textContent = 'Los links deben empezar con https://'; error.hidden = false; return; }
      const nuevo = {
        ...p, id: p.id || idNuevo(v('negocio')),
        negocio: v('negocio'), rubro: v('rubro'), comuna: v('comuna'), direccion: v('direccion'), contacto: v('contacto'),
        whatsapp: v('whatsapp').replace(/\D/g, ''), telefono: v('telefono'), redes: v('redes'), responsable: v('responsable'),
        estado: v('estado'), mensaje: f.mensaje.input.value.trim(), notas: f.notas.input.value.trim(), creado: creado.valores(),
      };
      const ok = await cambiar((d) => {
        d.prospectos = d.prospectos || [];
        const i = d.prospectos.findIndex((x) => x.id === nuevo.id);
        if (i >= 0) d.prospectos[i] = nuevo; else d.prospectos.push(nuevo);
      }, id ? 'Prospecto actualizado' : 'Prospecto agregado');
      if (ok) detalle(nuevo.id);
    });
    abrir(id ? `Editar ${p.negocio}` : 'Nuevo prospecto', null, form, [
      h('button', { class: 'btn', type: 'button', onclick: () => (id ? detalle(id) : cerrar()) }, 'Cancelar'),
      h('button', { class: 'btn btn-primary', type: 'submit', form: 'form-prospecto' }, 'Guardar'),
    ]);
    f.negocio.input.focus();
  }

  $('#nuevo-prospecto').addEventListener('click', () => formularioProspecto(null));
  return { render, nombre: (id) => buscar(id)?.negocio };
}
