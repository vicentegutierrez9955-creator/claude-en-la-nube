// Prospectos: negocios a los que les ofrecemos página, con lo que les hemos creado (maquetas, etc.).
import { esFecha } from '/panel/alertas.js';

export const ESTADOS_P = ['por contactar', 'contactado', 'interesado', 'cerrado', 'no interesado'];
// Primer mensaje por WhatsApp: pregunta si quieren ver la maqueta (sin link, precio ni reunión).
// {negocio} se reemplaza por el nombre del prospecto. El equipo lo puede cambiar en Ajustes.
export const MENSAJE_INICIAL = `Hola, ¿cómo están? Les escribimos de Optimind Partners. Vimos {negocio} en Google y nos gustaron mucho sus reseñas, así que les armamos una maqueta de página web para que vean cómo podría quedar.

Es gratis y sin compromiso. ¿Les gustaría que se la enviemos?`;
// Si el prospecto ya tiene página web, la oferta es mejorarla (sin criticar la que tiene).
export const MENSAJE_CON_WEB = `Hola, ¿cómo están? Les escribimos de Optimind Partners. Vimos la página web de {negocio} y nos gustaron mucho sus reseñas, así que les armamos una versión renovada: más moderna, rápida en el celular y con contacto directo por WhatsApp.

Es gratis y sin compromiso. ¿Les gustaría verla?`;
// Correos: asunto corto con el nombre del negocio (sin "gratis" para no caer en spam) y la misma
// pregunta de interés al final.
export const CORREO_ASUNTO = 'Una maqueta para {negocio}';
export const CORREO_CUERPO = `Hola, ¿cómo están?

Les escribimos de Optimind Partners. Vimos {negocio} en Google y nos gustaron mucho sus reseñas, así que les armamos una maqueta de página web para que vean cómo podría quedar: con sus servicios, cómo llegar y un botón para que sus clientes les escriban directo por WhatsApp.

Es gratis y sin compromiso. ¿Les gustaría que se la enviemos?

Saludos,
Equipo Optimind Partners`;
export const CORREO_ASUNTO_WEB = 'Una idea para la web de {negocio}';
export const CORREO_CUERPO_WEB = `Hola, ¿cómo están?

Les escribimos de Optimind Partners. Vimos la página web de {negocio} y nos gustaron mucho sus reseñas, así que les armamos una versión renovada: más moderna, rápida en el celular y con un botón para que sus clientes les escriban directo por WhatsApp.

Es gratis y sin compromiso. ¿Les gustaría verla?

Saludos,
Equipo Optimind Partners`;
// Textos que el equipo puede cambiar en Ajustes: clave en config → [id del campo, texto recomendado].
const PLANTILLAS = {
  mensajeProspecto: ['mensaje-prospecto', MENSAJE_INICIAL],
  mensajeProspectoWeb: ['mensaje-prospecto-web', MENSAJE_CON_WEB],
  correoAsunto: ['correo-asunto', CORREO_ASUNTO],
  correoCuerpo: ['correo-cuerpo', CORREO_CUERPO],
  correoAsuntoWeb: ['correo-asunto-web', CORREO_ASUNTO_WEB],
  correoCuerpoWeb: ['correo-cuerpo-web', CORREO_CUERPO_WEB],
};
// Cada grupo se guarda con un botón (guardar-<grupo> / restaurar-<grupo>).
const GRUPOS = { 'mensaje-prospecto': ['mensajeProspecto'], 'mensaje-prospecto-web': ['mensajeProspectoWeb'], correo: ['correoAsunto', 'correoCuerpo'], 'correo-web': ['correoAsuntoWeb', 'correoCuerpoWeb'] };
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Con menos de esto no se nombran las reseñas en el mensaje.
const RESENAS_MIN = 10;
const NOTA_MIN = 4;
const FRASE_RESENAS = ' y nos gustaron mucho sus reseñas';
const COLOR_P = { 'por contactar': 'inactivo', contactado: 'mes', interesado: 'pronto', cerrado: 'ok', 'no interesado': 'atrasado' };

export function iniciarProspectos(u) {
  const { h, $, badge, abrir, cerrar, cambiar, kv, enlace, urlSegura, waLink, idNuevo, campo, filasRepetibles, fechaLarga, hoy, estado, formulario, trabajosDe } = u;
  const lista = () => estado().data.prospectos || [];
  const buscar = (id) => lista().find((p) => p.id === id);
  const conWeb = (p) => p.tieneWeb === 'si' || Boolean(urlSegura(p.webActual));
  const plantilla = (clave) => estado().data.config?.[clave] || PLANTILLAS[clave][1];
  const sinDato = (v) => v === undefined || v === null || v === '';
  const buenasResenas = (p) => Number(p.googleNota) >= NOTA_MIN && Number(p.googleResenas) >= RESENAS_MIN;
  const rellenar = (p, clave) => {
    const t = plantilla(clave);
    return (buenasResenas(p) ? t : t.replace(FRASE_RESENAS, '')).replaceAll('{negocio}', p.negocio || 'su negocio');
  };
  // Si el prospecto trae un primer mensaje propio (ej. el que va con el video de su maqueta), se usa ese.
  const mensajeDe = (p) => (p.mensaje?.trim() ? p.mensaje.trim() : rellenar(p, conWeb(p) ? 'mensajeProspectoWeb' : 'mensajeProspecto'));
  const correoDe = (p) => (conWeb(p)
    ? { asunto: rellenar(p, 'correoAsuntoWeb'), cuerpo: rellenar(p, 'correoCuerpoWeb') }
    : { asunto: rellenar(p, 'correoAsunto'), cuerpo: rellenar(p, 'correoCuerpo') });
  const copiar = (texto) => (e) => { navigator.clipboard?.writeText(texto).then(() => { e.target.textContent = 'Copiado'; }); };
  const textoWeb = (p) => (conWeb(p) ? 'Ya tiene página web' : p.tieneWeb === 'no' ? 'Sin página web' : 'Página web: sin revisar');
  const linkWeb = (p) => (urlSegura(p.webActual) ? enlace(p.webActual, 'ver la actual') : null);
  const textoResenas = (p) => {
    if (sinDato(p.googleResenas)) return 'Reseñas en Google: sin revisar';
    if (Number(p.googleResenas) === 0) return 'Sin reseñas en Google';
    const n = `${p.googleResenas} reseña${Number(p.googleResenas) === 1 ? '' : 's'} en Google`;
    return sinDato(p.googleNota) ? n : `★ ${Number(p.googleNota).toFixed(1).replace('.', ',')} · ${n}`;
  };
  const mapsUrl = (p) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.negocio, p.direccion, p.comuna].filter(Boolean).join(', '))}`;
  const etiqueta = (p) => badge(COLOR_P[p.estado] || 'inactivo', p.estado || 'por contactar');

  function creados(p) {
    const links = (p.creado || []).filter((l) => urlSegura(l.url));
    return links.length
      ? h('div', { class: 'chips' }, links.map((l) => h('a', { class: 'btn btn-sm', href: urlSegura(l.url), target: '_blank', rel: 'noopener' }, l.nombre || 'Ver')))
      : h('span', { class: 'muted', style: 'font-size:14px' }, 'Aún no le creamos nada');
  }

  // Al abrir WhatsApp o el correo desde el panel, el prospecto pasa a "contactado" (solo si estaba
  // "por contactar", para no bajar a uno que ya está "interesado") y se anota quién y cuándo.
  const marcarContactado = (p, via) => () => {
    if ((p.estado || 'por contactar') !== 'por contactar') return;
    cambiar((d) => {
      const x = (d.prospectos || []).find((y) => y.id === p.id);
      if (!x || (x.estado || 'por contactar') !== 'por contactar') return;
      x.estado = 'contactado';
      x.contactado = { fecha: hoy(), por: estado().usuario, via };
    }, `${p.negocio}: marcado como contactado`).then(() => { if ($('#dlg').open) detalle(p.id); });
  };

  function botonCorreo(p, chico) {
    if (!EMAIL_OK.test(p.email || '')) return null;
    const { asunto, cuerpo } = correoDe(p);
    const url = `mailto:${encodeURIComponent(p.email)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
    return h('a', { class: `btn btn-correo${chico ? ' btn-sm' : ''}`, href: url, onclick: marcarContactado(p, 'correo') }, 'Escribir por correo');
  }

  function botonWhatsApp(p, chico) {
    const url = waLink(p.whatsapp, mensajeDe(p));
    return url ? h('a', { class: `btn btn-wa${chico ? ' btn-sm' : ''}`, href: url, target: '_blank', rel: 'noopener', onclick: marcarContactado(p, 'WhatsApp') }, 'Escribir por WhatsApp') : null;
  }

  // El orden de las tarjetas es el del arreglo `prospectos`; el equipo lo cambia arrastrando.
  function render() {
    if (arrastre) return;
    for (const [clave, [id]] of Object.entries(PLANTILLAS)) {
      const campoAjustes = $(`#${id}`);
      if (document.activeElement !== campoAjustes) campoAjustes.value = plantilla(clave);
    }
    const q = $('#buscar').value.trim().toLowerCase();
    const todos = lista();
    const visibles = todos
      .filter((p) => !q || [p.negocio, p.rubro, p.comuna, p.contacto].some((v) => String(v || '').toLowerCase().includes(q)));
    const conteo = ESTADOS_P.map((e) => [e, todos.filter((p) => (p.estado || 'por contactar') === e).length]).filter(([, n]) => n);
    $('#prospectos-resumen').textContent = [...conteo.map(([e, n]) => `${n} ${e}`), todos.length > 1 ? 'arrastra ⠿ para ordenar' : ''].filter(Boolean).join(' · ');
    const cont = $('#prospectos');
    cont.replaceChildren();
    if (!visibles.length) { cont.append(h('div', { class: 'empty' }, q ? 'Ningún prospecto coincide con la búsqueda.' : 'Aún no hay prospectos.')); return; }
    // Separados por la fecha en que se agregaron, los más nuevos arriba. Dentro de cada fecha se
    // mantiene el orden del arreglo (el que el equipo arma arrastrando).
    const porFecha = new Map();
    for (const p of visibles) {
      const f = esFecha(p.desde) ? p.desde : '';
      if (!porFecha.has(f)) porFecha.set(f, []);
      porFecha.get(f).push(p);
    }
    const fechas = [...porFecha.keys()].sort((a, b) => (!a ? 1 : !b ? -1 : b.localeCompare(a)));
    for (const f of fechas) {
      const grupo = porFecha.get(f);
      const grilla = h('div', { class: 'grid' }, grupo.map(tarjeta));
      cont.append(h('div', { class: 'pgrupo' },
        h('div', { class: 'pgrupo-head' }, h('h3', {}, f ? fechaLarga(f) : 'Sin fecha'), h('span', {}, `${grupo.length} prospecto${grupo.length === 1 ? '' : 's'}`)),
        grilla));
    }
  }

  function tarjeta(p) {
    return h('div', { class: 'ccard pcard', 'data-id': p.id },
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start;flex-wrap:nowrap' },
        h('div', { class: 'row', style: 'align-items:flex-start;flex-wrap:nowrap;gap:2px' },
          h('button', { class: 'mover', type: 'button', 'data-id': p.id, title: 'Arrastra para ordenar (o usa las flechas)', 'aria-label': `Mover ${p.negocio}` }, '⠿'),
          h('button', { class: 'link', style: 'text-align:left', onclick: () => detalle(p.id) }, h('h3', {}, p.negocio))),
        etiqueta(p)),
      h('div', { class: 'muted', style: 'font-size:14px' }, [p.rubro, p.comuna].filter(Boolean).join(' · ')),
      h('div', { class: buenasResenas(p) ? 'resenas' : 'muted', style: 'font-size:14px' }, textoResenas(p)),
      h('div', { class: conWeb(p) ? 'conweb' : 'muted', style: 'font-size:14px' }, textoWeb(p), linkWeb(p) ? [' · ', linkWeb(p)] : null),
      h('div', {}, h('div', { class: 'mini' }, 'Lo que le creamos'), creados(p)),
      h('div', { class: 'row' }, botonWhatsApp(p, true), botonCorreo(p, true), h('button', { class: 'btn btn-sm', onclick: () => detalle(p.id) }, 'Ver ficha')),
    );
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
        ['Correo', EMAIL_OK.test(p.email || '') ? p.email : 'Sin correo'],
        ['Teléfono', p.telefono],
        ['Dirección', p.direccion],
        ['Google', h('span', {}, textoResenas(p), ' · ', enlace(mapsUrl(p), 'Ver en Google Maps'))],
        ['Página web', h('span', {}, textoWeb(p), linkWeb(p) ? [' · ', linkWeb(p)] : null)],
        ['Redes / web', p.redes ? enlace(/^https?:\/\//.test(p.redes) ? p.redes : `https://${p.redes}`, p.redes) : null],
        ['Responsable', p.responsable],
        ['Agregado', fechaLarga(p.desde)],
        p.contactado ? ['Contactado', [fechaLarga(p.contactado.fecha), p.contactado.por && `por ${p.contactado.por}`, p.contactado.via && `(${p.contactado.via})`].filter(Boolean).join(' ')] : null,
      ])),
      h('div', { class: 'blk' }, h('h3', {}, p.mensaje?.trim() ? 'Primer mensaje (propio de este prospecto)' : conWeb(p) ? 'Mensaje de WhatsApp (ya tiene página)' : 'Mensaje de WhatsApp'),
        h('p', { style: 'white-space:pre-wrap;margin:0 0 8px' }, mensajeDe(p)),
        h('button', { class: 'btn btn-sm', onclick: copiar(mensajeDe(p)) }, 'Copiar mensaje')),
      h('div', { class: 'blk' }, h('h3', {}, conWeb(p) ? 'Correo (ya tiene página)' : 'Correo'),
        h('p', { style: 'margin:0 0 6px' }, h('b', {}, 'Asunto: '), correoDe(p).asunto),
        h('p', { style: 'white-space:pre-wrap;margin:0 0 8px' }, correoDe(p).cuerpo),
        h('div', { class: 'row' },
          h('button', { class: 'btn btn-sm', onclick: copiar(correoDe(p).asunto) }, 'Copiar asunto'),
          h('button', { class: 'btn btn-sm', onclick: copiar(correoDe(p).cuerpo) }, 'Copiar correo'))),
      p.notas ? h('div', { class: 'blk' }, h('h3', {}, 'Notas'), h('p', { style: 'white-space:pre-wrap;margin:0' }, p.notas)) : null,
      trabajos.length ? h('div', { class: 'blk' }, h('h3', {}, 'Trabajos'), h('table', { class: 'table' },
        trabajos.map((t) => h('tr', {}, h('td', { style: 'white-space:nowrap' }, fechaLarga(t.fecha)), h('td', {}, t.titulo))))) : null,
    ], [
      h('button', { class: 'btn btn-danger', style: 'margin-right:auto', onclick: () => eliminar(id) }, 'Eliminar'),
      botonWhatsApp(p),
      botonCorreo(p),
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
      email: campo('Correo', p.email, { tipo: 'email', ph: 'contacto@negocio.cl' }),
      telefono: campo('Teléfono fijo', p.telefono),
      redes: campo('Instagram / redes', p.redes),
      tieneWeb: campo('¿Tiene página web?', conWeb(p) ? 'si' : p.tieneWeb || '', { opciones: [['', 'Sin revisar'], ['no', 'No tiene'], ['si', 'Sí, ya tiene']] }),
      webActual: campo('Su página actual', p.webActual, { ph: 'https://…' }),
      responsable: campo('Responsable', p.responsable),
      estado: campo('Estado', p.estado, { opciones: ESTADOS_P.map((e) => [e, e]) }),
      googleNota: campo('Nota en Google', sinDato(p.googleNota) ? '' : String(p.googleNota).replace('.', ','), { ph: 'Ej: 4,6' }),
      googleResenas: campo('Reseñas en Google', p.googleResenas, { tipo: 'number', min: 0, step: 1, ph: 'Cantidad (0 si no tiene)' }),
      mensaje: campo('Primer mensaje propio (si se deja vacío se usa el de Ajustes)', p.mensaje, { tipo: 'textarea', full: true }),
      notas: campo('Notas', p.notas, { tipo: 'textarea', full: true }),
    };
    const creado = filasRepetibles(p.creado || [], [['nombre', 'Qué es (ej: Maqueta)'], ['url', 'https://…']], '', '+ Agregar link');
    const error = h('p', { class: 'error', hidden: true });
    const form = h('form', { class: 'form', id: 'form-prospecto' },
      Object.values(f).filter((x) => x !== f.notas).map((x) => x.el),
      h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Lo que le creamos (maquetas, propuestas)'), creado),
      f.notas.el, error);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = (k) => f[k].input.value.trim();
      if (!v('negocio')) { error.textContent = 'Falta el nombre del negocio.'; error.hidden = false; return; }
      if (creado.valores().some((l) => l.url && !urlSegura(l.url))) { error.textContent = 'Los links deben empezar con https://'; error.hidden = false; return; }
      const nota = v('googleNota').replace(',', '.');
      if (nota && !(Number(nota) >= 1 && Number(nota) <= 5)) { error.textContent = 'La nota de Google va de 1 a 5 (ej: 4,6).'; error.hidden = false; return; }
      const webActual = v('webActual') && !/^https?:\/\//i.test(v('webActual')) ? `https://${v('webActual')}` : v('webActual');
      if (webActual && !urlSegura(webActual)) { error.textContent = 'La página actual debe ser un link válido.'; error.hidden = false; return; }
      if (v('email') && !EMAIL_OK.test(v('email'))) { error.textContent = 'Revisa el correo (ej: contacto@negocio.cl).'; error.hidden = false; return; }
      const resenas = v('googleResenas');
      if (resenas && !(Number.isInteger(Number(resenas)) && Number(resenas) >= 0)) { error.textContent = 'Las reseñas de Google son una cantidad (0 si no tiene).'; error.hidden = false; return; }
      const nuevo = {
        ...p, id: p.id || idNuevo(v('negocio')),
        negocio: v('negocio'), rubro: v('rubro'), comuna: v('comuna'), direccion: v('direccion'), contacto: v('contacto'),
        whatsapp: v('whatsapp').replace(/\D/g, ''), email: v('email').toLowerCase(), telefono: v('telefono'), redes: v('redes'), responsable: v('responsable'),
        estado: v('estado'), googleNota: nota ? Number(nota) : '', googleResenas: resenas ? Number(resenas) : '',
        tieneWeb: webActual ? 'si' : v('tieneWeb'), webActual, mensaje: f.mensaje.input.value.trim(), notas: f.notas.input.value.trim(), creado: creado.valores(),
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

  // ---------- ordenar arrastrando ----------
  let arrastre = null;
  const cont = $('#prospectos');
  const idsVisibles = () => [...cont.querySelectorAll('.pcard')].map((c) => c.dataset.id);

  // Reemplaza, en el orden completo, las posiciones de las tarjetas visibles por su nuevo orden
  // (así también funciona con la búsqueda activa).
  function guardarOrden(visibles, enfocar) {
    cambiar((d) => {
      const todos = d.prospectos || [];
      const porId = new Map(todos.map((p) => [p.id, p]));
      const enVista = new Set(visibles);
      let k = 0;
      d.prospectos = todos.map((p) => (enVista.has(p.id) ? porId.get(visibles[k++]) : p)).filter(Boolean);
    }).then(() => { if (enfocar) cont.querySelector(`.mover[data-id="${CSS.escape(enfocar)}"]`)?.focus(); });
  }

  cont.addEventListener('pointerdown', (e) => {
    const asa = e.target.closest('.mover');
    if (!asa || e.button > 0) return;
    e.preventDefault();
    try { asa.setPointerCapture(e.pointerId); } catch { /* sin captura: igual seguimos el puntero en window */ }
    arrastre = { tarjeta: asa.closest('.pcard'), antes: idsVisibles().join() };
    arrastre.tarjeta.classList.add('arrastrando');
    document.body.classList.add('ordenando');
  });
  window.addEventListener('pointermove', (e) => {
    if (!arrastre) return;
    const otra = document.elementFromPoint(e.clientX, e.clientY)?.closest('.pcard');
    // Solo se ordena dentro de la misma fecha.
    if (otra && otra !== arrastre.tarjeta && otra.parentNode === arrastre.tarjeta.parentNode) {
      const tarjetas = [...otra.parentNode.querySelectorAll('.pcard')];
      if (tarjetas.indexOf(arrastre.tarjeta) < tarjetas.indexOf(otra)) otra.after(arrastre.tarjeta); else otra.before(arrastre.tarjeta);
    }
    if (e.clientY < 80) window.scrollBy(0, -14);
    else if (e.clientY > window.innerHeight - 80) window.scrollBy(0, 14);
  });
  const soltar = () => {
    if (!arrastre) return;
    arrastre.tarjeta.classList.remove('arrastrando');
    document.body.classList.remove('ordenando');
    const cambio = idsVisibles().join() !== arrastre.antes;
    arrastre = null;
    if (cambio) guardarOrden(idsVisibles()); else render();
  };
  window.addEventListener('pointerup', soltar);
  window.addEventListener('pointercancel', soltar);
  cont.addEventListener('keydown', (e) => {
    const asa = e.target.closest('.mover');
    const paso = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[e.key];
    if (!asa || !paso) return;
    e.preventDefault();
    const tarjeta = asa.closest('.pcard');
    const tarjetas = [...tarjeta.parentNode.querySelectorAll('.pcard')];
    const vecina = tarjetas[tarjetas.indexOf(tarjeta) + paso];
    if (!vecina) return;
    // Se mueve en pantalla al tiro, para que varias flechas seguidas se sumen.
    if (paso < 0) vecina.before(tarjeta); else vecina.after(tarjeta);
    asa.focus();
    guardarOrden(idsVisibles(), asa.dataset.id);
  });

  $('#nuevo-prospecto').addEventListener('click', () => formularioProspecto(null));
  // Ajustes: mensajes de WhatsApp y correos (sin página web y con página web), para todo el equipo.
  for (const [grupo, claves] of Object.entries(GRUPOS)) {
    $(`#guardar-${grupo}`).addEventListener('click', () => {
      const valores = claves.map((clave) => [clave, $(`#${PLANTILLAS[clave][0]}`).value.trim()]);
      cambiar((d) => {
        d.config = { ...(d.config || {}) };
        for (const [clave, t] of valores) if (t && t !== PLANTILLAS[clave][1]) d.config[clave] = t; else delete d.config[clave];
      }, 'Guardado');
    });
    $(`#restaurar-${grupo}`).addEventListener('click', () => {
      for (const clave of claves) $(`#${PLANTILLAS[clave][0]}`).value = PLANTILLAS[clave][1];
      $(`#guardar-${grupo}`).click();
    });
  }
  return { render, nombre: (id) => buscar(id)?.negocio };
}
