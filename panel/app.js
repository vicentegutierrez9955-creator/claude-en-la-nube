import {
  avisos, nivel, hoyChile, sumarPeriodo, esFecha, ingresoMensual, pesos, fechaLarga, cuando, descripcion, mensajeCobro,
} from '/panel/alertas.js';
import { iniciarProspectos } from '/panel/prospectos.js';
import { iniciarMaquetas } from '/panel/maquetas.js';

const $ = (s) => document.querySelector(s);
const ETIQUETA = { atrasado: 'Atrasado', pronto: 'Pronto', mes: 'Este mes', ok: 'Al día' };
let estado = { data: null, etag: null, usuario: '' };
let pestana = 'resumen';
let prospectos = null;
let maquetas = null;

// ---------- utilidades ----------
function h(tag, props, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo == null || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

function urlSegura(u) {
  try {
    const x = new URL(String(u || '').trim());
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null;
  } catch { return null; }
}

function waLink(numero, texto) {
  const n = String(numero || '').replace(/\D/g, '');
  return n ? `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ''}` : null;
}

function enlace(url, texto) {
  const u = urlSegura(url);
  return u ? h('a', { href: u, target: '_blank', rel: 'noopener' }, texto || u.replace(/^https?:\/\//, '').replace(/\/$/, '')) : (texto || url || '—');
}

function idNuevo(base) {
  const slug = String(base || 'cliente').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  return `${slug || 'cliente'}-${Math.random().toString(36).slice(2, 7)}`;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
}

async function api(ruta, opciones = {}) {
  try {
    const r = await fetch(ruta, { credentials: 'same-origin', headers: { 'content-type': 'application/json' }, ...opciones });
    let body = null;
    try { body = await r.json(); } catch { /* sin cuerpo */ }
    return { status: r.status, ok: r.ok, body };
  } catch {
    return { status: 0, ok: false, body: { error: 'Sin conexión' } };
  }
}

const badge = (n, texto) => h('span', { class: `badge b-${n}` }, texto || ETIQUETA[n]);
const cliente = (id) => estado.data.clientes.find((c) => c.id === id);
const hoy = () => hoyChile();

// ---------- sesión y datos ----------
function mostrarLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  if ($('#dlg').open) $('#dlg').close();
  try { $('#login-nombre').value = localStorage.getItem('panel-nombre') || ''; } catch { /* sin storage */ }
  ($('#login-nombre').value ? $('#login-clave') : $('#login-nombre')).focus();
}

async function cargar(silencioso) {
  const r = await api('/api/panel/datos');
  if (r.status === 401) return mostrarLogin();
  if (!r.ok) { if (!silencioso) toast(r.body?.error || 'No se pudieron cargar los datos'); return; }
  if (silencioso && r.body.etag === estado.etag) return;
  estado = { data: r.body.data, etag: r.body.etag, usuario: r.body.usuario };
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#usuario').textContent = estado.usuario;
  render();
}

// Aplica `fn` sobre una copia y guarda; si otra persona guardó antes, reintenta sobre lo nuevo.
async function cambiar(fn, mensaje) {
  for (let intento = 0; intento < 3; intento++) {
    const copia = structuredClone(estado.data);
    fn(copia);
    const r = await api('/api/panel/datos', { method: 'PUT', body: JSON.stringify({ data: copia, etag: estado.etag }) });
    if (r.ok) {
      estado.data = r.body.data;
      estado.etag = r.body.etag;
      render();
      if (mensaje) toast(mensaje);
      return true;
    }
    if (r.status === 409) { estado.data = r.body.data; estado.etag = r.body.etag; continue; }
    if (r.status === 401) { mostrarLogin(); return false; }
    toast(r.body?.error || 'No se pudo guardar');
    return false;
  }
  render();
  toast('Otra persona estaba editando. Revisa y vuelve a intentar.');
  return false;
}

// ---------- render ----------
function render() {
  if (!estado.data) return;
  for (const b of document.querySelectorAll('.tab')) {
    if (b.dataset.tab === pestana) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  for (const s of document.querySelectorAll('.tab-panel')) s.hidden = s.id !== `tab-${pestana}`;
  renderResumen();
  renderClientes();
  prospectos?.render();
  maquetas?.render();
  renderPagos();
  renderTrabajos();
  const t = $('#transferencia');
  if (document.activeElement !== t) t.value = estado.data.config?.transferencia || '';
  const a = estado.data.actualizado;
  $('#sync').textContent = a ? `Último cambio: ${new Date(a).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}${estado.data.actualizadoPor ? ` por ${estado.data.actualizadoPor}` : ''}` : '';
}

function renderResumen() {
  const d = estado.data;
  const todos = avisos(d, hoy());
  const activos = d.clientes.filter((c) => c.estado !== 'inactivo').length;
  const atrasados = todos.filter((a) => a.dias < 0);
  const porCobrar = todos.filter((a) => a.tipo === 'cobro' && a.dias <= 30).reduce((s, a) => s + a.monto, 0);
  const kpi = (titulo, valor, extra) => h('div', { class: `kpi${extra ? ' alerta' : ''}` }, h('span', {}, titulo), h('b', {}, valor));
  $('#kpis').replaceChildren(
    kpi('Clientes activos', activos),
    kpi('Ingreso mensual (hosting)', pesos(ingresoMensual(d))),
    kpi('Por cobrar en 30 días', pesos(porCobrar)),
    kpi('Atrasados', atrasados.length, atrasados.length > 0),
  );
  const pendientes = todos.filter((a) => nivel(a) !== 'ok');
  const proximos = todos.filter((a) => nivel(a) === 'ok').slice(0, 3);
  const cont = $('#avisos');
  cont.replaceChildren();
  if (!pendientes.length) cont.append(h('div', { class: 'empty' }, 'Todo al día. No hay cobros ni dominios por vencer pronto.'));
  pendientes.forEach((a) => cont.append(filaAviso(a)));
  if (proximos.length) {
    cont.append(h('div', { class: 'section-head' }, h('h2', {}, 'Lo que viene')));
    proximos.forEach((a) => cont.append(filaAviso(a)));
  }
}

function filaAviso(a) {
  const c = a.cliente;
  const acciones = a.tipo === 'cobro'
    ? [botonWhatsApp(c, true), h('button', { class: 'btn btn-sm', onclick: () => dialogoPago(c.id) }, 'Marcar pagado')]
    : [h('button', { class: 'btn btn-sm', onclick: () => dialogoRenovar(c.id) }, 'Renovado')];
  return h('div', { class: 'item' },
    badge(nivel(a)),
    h('div', { class: 'main' }, h('button', { class: 'link', onclick: () => detalle(c.id) }, h('b', {}, c.negocio)), h('small', {}, descripcion(a))),
    h('div', { class: 'when' }, fechaLarga(a.fecha), h('small', {}, cuando(a.dias))),
    h('div', { class: 'acts' }, acciones),
  );
}

function botonWhatsApp(c, chico) {
  const url = waLink(c.whatsapp, mensajeCobro(c, estado.data.config?.transferencia));
  return url ? h('a', { class: `btn btn-wa${chico ? ' btn-sm' : ''}`, href: url, target: '_blank', rel: 'noopener' }, 'Cobrar por WhatsApp') : null;
}

function estadoCobro(c) {
  const p = c.hosting?.proximoCobro;
  if (!esFecha(p) || c.hosting?.activo === false) return null;
  return avisos({ clientes: [c] }, hoy()).find((a) => a.tipo === 'cobro');
}

function renderClientes() {
  const q = $('#buscar').value.trim().toLowerCase();
  const lista = estado.data.clientes
    .filter((c) => !q || [c.negocio, c.contacto, c.dominio?.nombre, c.ciudad].some((v) => String(v || '').toLowerCase().includes(q)))
    .sort((a, b) => (a.estado === 'inactivo') - (b.estado === 'inactivo') || String(a.negocio).localeCompare(String(b.negocio)));
  const cont = $('#clientes');
  cont.replaceChildren();
  if (!lista.length) { cont.append(h('div', { class: 'empty' }, q ? 'Ningún cliente coincide con la búsqueda.' : 'Aún no hay clientes.')); return; }
  for (const c of lista) {
    const cobro = estadoCobro(c);
    const dom = avisos({ clientes: [c] }, hoy()).find((a) => a.tipo === 'dominio');
    cont.append(h('button', { class: 'ccard', onclick: () => detalle(c.id) },
      h('div', { class: 'row', style: 'justify-content:space-between' }, h('h3', {}, c.negocio), c.estado === 'inactivo' ? badge('inactivo', 'Inactivo') : (cobro ? badge(nivel(cobro)) : null)),
      h('dl', { class: 'meta' },
        h('dt', {}, 'Contacto'), h('dd', {}, c.contacto || '—'),
        h('dt', {}, 'Página'), h('dd', {}, (c.web || '—').replace(/^https?:\/\//, '')),
        h('dt', {}, 'Hosting'), h('dd', {}, c.hosting && c.hosting.activo !== false ? `${pesos(c.hosting.monto)} / ${c.hosting.frecuencia === 'anual' ? 'año' : 'mes'}` : 'No se cobra'),
        cobro ? [h('dt', {}, 'Próximo cobro'), h('dd', {}, `${fechaLarga(cobro.fecha)} (${cuando(cobro.dias)})`)] : null,
        dom ? [h('dt', {}, 'Dominio vence'), h('dd', {}, `${fechaLarga(dom.fecha)} (${cuando(dom.dias)})`)] : null,
      ),
    ));
  }
}

function renderPagos() {
  const pagos = [...estado.data.pagos].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const h0 = hoy();
  const mes = pagos.filter((p) => String(p.fecha).slice(0, 7) === h0.slice(0, 7)).reduce((s, p) => s + (Number(p.monto) || 0), 0);
  const anio = pagos.filter((p) => String(p.fecha).slice(0, 4) === h0.slice(0, 4)).reduce((s, p) => s + (Number(p.monto) || 0), 0);
  $('#pagos-total').textContent = `Este mes: ${pesos(mes)} · Este año: ${pesos(anio)}`;
  const cont = $('#pagos');
  cont.replaceChildren();
  if (!pagos.length) { cont.append(h('div', { class: 'empty' }, 'Todavía no hay pagos registrados. Usa "Marcar pagado" en un aviso.')); return; }
  for (const p of pagos) {
    const c = cliente(p.clienteId);
    cont.append(h('div', { class: 'item' },
      h('div', { class: 'main' }, h('b', {}, c?.negocio || 'Cliente eliminado'), h('small', {}, [p.concepto, p.periodo ? `periodo ${fechaLarga(p.periodo)}` : '', p.nota].filter(Boolean).join(' · '))),
      h('div', { class: 'when' }, h('b', {}, pesos(p.monto)), h('small', {}, `${fechaLarga(p.fecha)}${p.por ? ` · ${p.por}` : ''}`)),
      h('div', { class: 'acts' }, h('button', {
        class: 'btn btn-sm btn-danger',
        onclick: () => confirm('¿Borrar este pago del historial? La fecha del próximo cobro no cambia.') && cambiar((d) => { d.pagos = d.pagos.filter((x) => x.id !== p.id); }, 'Pago borrado'),
      }, 'Borrar')),
    ));
  }
}

// ---------- trabajos ----------
const ESTADO_T = { hecho: 'ok', 'en curso': 'pronto', pendiente: 'mes' };
const trabajos = (clienteId) => (estado.data.trabajos || [])
  .filter((t) => clienteId === undefined || t.clienteId === clienteId)
  .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.id).localeCompare(String(a.id)));
const trabajosDe = ({ prospectoId }) => trabajos().filter((t) => t.prospectoId === prospectoId);

function renderTrabajos() {
  const cont = $('#trabajos');
  cont.replaceChildren();
  const lista = trabajos();
  if (!lista.length) { cont.append(h('div', { class: 'empty' }, 'Todavía no hay trabajos anotados.')); return; }
  for (const t of lista) {
    const c = t.clienteId ? cliente(t.clienteId) : null;
    const links = (t.links || []).filter((l) => urlSegura(l.url));
    cont.append(h('div', { class: 'item', style: 'align-items:flex-start' },
      badge(ESTADO_T[t.estado] || 'ok', t.estado || 'hecho'),
      h('div', { class: 'main' },
        h('b', {}, t.titulo),
        h('small', {}, [c?.negocio || (t.prospectoId && prospectos?.nombre(t.prospectoId)) || t.cliente || 'Interno', t.por].filter(Boolean).join(' · ')),
        t.detalle ? h('p', { class: 'muted', style: 'margin:6px 0 0;white-space:pre-wrap;font-size:14px' }, t.detalle) : null,
        links.length ? h('div', { class: 'chips', style: 'margin-top:8px' }, links.map((l) => h('a', { class: 'btn btn-sm', href: urlSegura(l.url), target: '_blank', rel: 'noopener' }, l.nombre || 'Abrir'))) : null,
      ),
      h('div', { class: 'when' }, fechaLarga(t.fecha)),
      h('div', { class: 'acts' },
        c ? h('button', { class: 'btn btn-sm', onclick: () => detalle(c.id) }, 'Ver cliente') : null,
        h('button', {
          class: 'btn btn-sm btn-danger',
          onclick: () => confirm('¿Borrar este trabajo?') && cambiar((d) => { d.trabajos = (d.trabajos || []).filter((x) => x.id !== t.id); }, 'Trabajo borrado'),
        }, 'Borrar'),
      ),
    ));
  }
}

function formularioTrabajo() {
  const sel = h('select', {}, h('option', { value: '' }, 'Interno / otro'), estado.data.clientes.map((c) => h('option', { value: c.id }, c.negocio)));
  const titulo = h('input', { required: true, placeholder: 'Ej: Página web nueva' });
  const detalleT = h('textarea', { rows: 4, placeholder: 'Qué se hizo' });
  const estadoT = h('select', {}, ['hecho', 'en curso', 'pendiente'].map((v) => h('option', { value: v }, v)));
  const fecha = h('input', { type: 'date', value: hoy() });
  abrir('Anotar trabajo', null, h('div', { class: 'form' },
    h('label', {}, 'Cliente', sel), h('label', {}, 'Fecha', fecha), h('label', { class: 'full' }, 'Trabajo *', titulo),
    h('label', {}, 'Estado', estadoT), h('label', { class: 'full' }, 'Detalle', detalleT)), [
    h('button', { class: 'btn', onclick: cerrar }, 'Cancelar'),
    h('button', {
      class: 'btn btn-primary',
      onclick: async () => {
        if (!titulo.value.trim()) { titulo.focus(); return; }
        const ok = await cambiar((d) => {
          d.trabajos = d.trabajos || [];
          d.trabajos.push({ id: idNuevo('t'), clienteId: sel.value || null, cliente: '', fecha: fecha.value || hoy(), titulo: titulo.value.trim(), detalle: detalleT.value.trim(), estado: estadoT.value, links: [], por: estado.usuario });
        }, 'Trabajo anotado');
        if (ok) cerrar();
      },
    }, 'Guardar'),
  ]);
  titulo.focus();
}

// ---------- diálogos ----------
function abrir(titulo, subtitulo, contenido, pie) {
  $('#dlg-body').replaceChildren(
    h('div', { class: 'dlg-head' }, h('div', {}, h('h2', {}, titulo), subtitulo ? h('div', { class: 'muted' }, subtitulo) : null), h('button', { class: 'x', 'aria-label': 'Cerrar', onclick: cerrar }, '×')),
    h('div', { class: 'dlg-content' }, contenido),
    pie ? h('div', { class: 'dlg-foot' }, pie) : null,
  );
  if (!$('#dlg').open) $('#dlg').showModal();
}
function cerrar() { if ($('#dlg').open) $('#dlg').close(); }

function kv(pares) {
  return h('dl', { class: 'kv' }, pares.filter(Boolean).map(([k, v]) => [h('dt', {}, k), h('dd', {}, v === '' || v == null ? '—' : v)]));
}

function detalle(id) {
  const c = cliente(id);
  if (!c) return cerrar();
  const cobro = estadoCobro(c);
  const dom = avisos({ clientes: [c] }, hoy()).find((a) => a.tipo === 'dominio');
  const pagos = estado.data.pagos.filter((p) => p.clienteId === id).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const wa = waLink(c.whatsapp);
  const accesos = (c.accesos || []).filter((a) => urlSegura(a.url));
  abrir(c.negocio, [c.contacto, c.ciudad].filter(Boolean).join(' · '), [
    h('div', { class: 'blk' }, h('h3', {}, 'Contacto'), kv([
      ['WhatsApp', wa ? enlace(wa, `+${String(c.whatsapp).replace(/\D/g, '')}`) : '—'],
      ['Correo', c.email ? h('a', { href: `mailto:${c.email}` }, c.email) : '—'],
      ['Responsable', c.responsable],
      ['Cliente desde', fechaLarga(c.desde) || '—'],
      ['Estado', c.estado === 'inactivo' ? badge('inactivo', 'Inactivo') : badge('ok', 'Activo')],
    ])),
    h('div', { class: 'blk' }, h('h3', {}, 'Página y dominio'), kv([
      ['Página', c.web ? enlace(c.web) : '—'],
      ['Dominio', c.dominio?.nombre],
      ['Registrado en', c.dominio?.registrador],
      ['DNS en', c.dominio?.dns],
      ['Vence', dom ? h('span', {}, `${fechaLarga(dom.fecha)} `, badge(nivel(dom), cuando(dom.dias))) : '—'],
    ])),
    h('div', { class: 'blk' }, h('h3', {}, 'Hosting'), kv([
      ['Dónde', c.hosting?.proveedor],
      ['Valor', c.hosting ? `${pesos(c.hosting.monto)} ${c.hosting.frecuencia === 'anual' ? 'al año' : 'al mes'}` : '—'],
      ['Próximo cobro', cobro ? h('span', {}, `${fechaLarga(cobro.fecha)} `, badge(nivel(cobro), cuando(cobro.dias))) : 'No se cobra'],
    ])),
    (c.productos || []).length ? h('div', { class: 'blk' }, h('h3', {}, 'Productos contratados'), h('table', { class: 'table' },
      h('tr', {}, h('th', {}, 'Producto'), h('th', {}, 'Precio'), h('th', {}, 'Fecha'), h('th', {}, 'Nota')),
      c.productos.map((p) => h('tr', {}, h('td', {}, p.nombre), h('td', {}, p.precio ? pesos(p.precio) : '—'), h('td', {}, fechaLarga(p.fecha) || '—'), h('td', {}, p.nota || ''))),
    )) : null,
    accesos.length ? h('div', { class: 'blk' }, h('h3', {}, 'Accesos rápidos'), h('div', { class: 'chips' }, accesos.map((a) => h('a', { class: 'btn btn-sm', href: urlSegura(a.url), target: '_blank', rel: 'noopener' }, a.nombre || 'Abrir')))) : null,
    c.notas ? h('div', { class: 'blk' }, h('h3', {}, 'Notas'), h('p', { style: 'white-space:pre-wrap;margin:0' }, c.notas)) : null,
    trabajos(id).length ? h('div', { class: 'blk' }, h('h3', {}, 'Trabajos realizados'), h('table', { class: 'table' },
      trabajos(id).map((t) => h('tr', {}, h('td', { style: 'white-space:nowrap' }, fechaLarga(t.fecha)), h('td', {}, t.titulo), h('td', {}, badge(ESTADO_T[t.estado] || 'ok', t.estado || 'hecho')))))) : null,
    h('div', { class: 'blk' }, h('h3', {}, 'Pagos de este cliente'), pagos.length
      ? h('table', { class: 'table' }, pagos.map((p) => h('tr', {}, h('td', {}, fechaLarga(p.fecha)), h('td', {}, p.concepto), h('td', {}, pesos(p.monto)), h('td', { class: 'muted' }, p.por || ''))))
      : h('p', { class: 'muted', style: 'margin:0' }, 'Sin pagos registrados.')),
  ], [
    h('button', { class: 'btn btn-danger', style: 'margin-right:auto', onclick: () => eliminar(c.id) }, 'Eliminar'),
    cobro ? botonWhatsApp(c) : null,
    cobro ? h('button', { class: 'btn', onclick: () => dialogoPago(c.id) }, 'Marcar pagado') : null,
    h('button', { class: 'btn btn-primary', onclick: () => formulario(c.id) }, 'Editar'),
  ]);
}

async function eliminar(id) {
  const c = cliente(id);
  if (!c || !confirm(`¿Eliminar a ${c.negocio}? Sus pagos quedan en el historial. Si solo dejó de pagar, mejor márcalo como inactivo.`)) return;
  if (await cambiar((d) => { d.clientes = d.clientes.filter((x) => x.id !== id); }, 'Cliente eliminado')) cerrar();
}

function dialogoPago(id) {
  const c = cliente(id);
  if (!c?.hosting) return;
  const monto = h('input', { type: 'number', min: '0', step: '100', value: c.hosting.monto ?? '' });
  const fecha = h('input', { type: 'date', value: hoy() });
  const nota = h('input', { placeholder: 'Opcional, ej: transferencia' });
  const siguiente = sumarPeriodo(c.hosting.proximoCobro, c.hosting.frecuencia, c.hosting.dia);
  abrir('Registrar pago', c.negocio, [
    h('p', { style: 'margin:0' }, `Hosting del periodo ${fechaLarga(c.hosting.proximoCobro)}. El próximo cobro pasará al ${fechaLarga(siguiente)}.`),
    h('div', { class: 'form' }, h('label', {}, 'Monto recibido', monto), h('label', {}, 'Fecha del pago', fecha), h('label', { class: 'full' }, 'Nota', nota)),
  ], [
    h('button', { class: 'btn', onclick: () => detalle(id) }, 'Cancelar'),
    h('button', {
      class: 'btn btn-primary',
      onclick: async () => {
        const ok = await cambiar((d) => {
          const x = d.clientes.find((y) => y.id === id);
          d.pagos.push({ id: idNuevo('pago'), clienteId: id, concepto: 'Hosting', periodo: x.hosting.proximoCobro, monto: Number(monto.value) || 0, fecha: fecha.value || hoy(), nota: nota.value.trim(), por: estado.usuario });
          x.hosting.proximoCobro = sumarPeriodo(x.hosting.proximoCobro, x.hosting.frecuencia, x.hosting.dia);
        }, 'Pago registrado');
        if (ok) detalle(id);
      },
    }, 'Guardar pago'),
  ]);
}

function dialogoRenovar(id) {
  const c = cliente(id);
  if (!esFecha(c?.dominio?.vence)) return;
  const monto = h('input', { type: 'number', min: '0', step: '100', placeholder: 'Opcional' });
  const nuevo = sumarPeriodo(c.dominio.vence, 'anual');
  abrir('Dominio renovado', c.dominio.nombre, [
    h('p', { style: 'margin:0' }, `El vencimiento pasará del ${fechaLarga(c.dominio.vence)} al ${fechaLarga(nuevo)}.`),
    h('label', {}, 'Si el cliente pagó la renovación, ¿cuánto?', monto),
  ], [
    h('button', { class: 'btn', onclick: cerrar }, 'Cancelar'),
    h('button', {
      class: 'btn btn-primary',
      onclick: async () => {
        const ok = await cambiar((d) => {
          const x = d.clientes.find((y) => y.id === id);
          if (Number(monto.value) > 0) d.pagos.push({ id: idNuevo('pago'), clienteId: id, concepto: 'Renovación de dominio', periodo: x.dominio.vence, monto: Number(monto.value), fecha: hoy(), nota: '', por: estado.usuario });
          x.dominio.vence = sumarPeriodo(x.dominio.vence, 'anual');
        }, 'Dominio renovado');
        if (ok) cerrar();
      },
    }, 'Guardar'),
  ]);
}

function campo(etiqueta, valor, extra = {}) {
  const input = extra.tipo === 'textarea'
    ? h('textarea', { rows: 4, value: valor ?? '' })
    : extra.opciones
      ? h('select', {}, extra.opciones.map(([v, t]) => h('option', { value: v, selected: v === valor }, t)))
      : h('input', { type: extra.tipo || 'text', value: valor ?? '', placeholder: extra.ph, required: extra.req, min: extra.min, step: extra.step });
  return { input, el: h('label', { class: extra.full ? 'full' : null }, etiqueta, input) };
}

function filasRepetibles(items, columnas, clase, textoAgregar) {
  const cont = h('div', { class: 'rep' });
  const filas = h('div', { style: 'display:flex;flex-direction:column;gap:8px' });
  const agregar = (item = {}) => {
    const inputs = columnas.map(([k, ph, tipo]) => h('input', { type: tipo || 'text', placeholder: ph, value: item[k] ?? '', 'aria-label': ph, 'data-k': k }));
    const fila = h('div', { class: `rep-row ${clase}` }, inputs, h('button', { type: 'button', class: 'x', 'aria-label': 'Quitar', onclick: () => fila.remove() }, '×'));
    filas.append(fila);
  };
  items.forEach(agregar);
  cont.append(filas, h('button', { type: 'button', class: 'btn btn-sm', style: 'align-self:flex-start', onclick: () => agregar() }, textoAgregar));
  cont.valores = () => [...filas.children].map((f) => Object.fromEntries([...f.querySelectorAll('input')].map((i) => [i.dataset.k, i.value.trim()])))
    .filter((o) => Object.values(o).some(Boolean));
  return cont;
}

// `base` precarga un cliente nuevo; `prospectoId` marca ese prospecto como cerrado al guardar.
function formulario(id, base, prospectoId) {
  const c = id ? structuredClone(cliente(id)) : { estado: 'activo', responsable: estado.usuario, desde: hoy(), dominio: { registrador: 'NIC Chile', dns: 'Cloudflare' }, hosting: { proveedor: 'Vercel', frecuencia: 'mensual', activo: true }, productos: [], accesos: [], ...(base || {}) };
  const d = c.dominio || {};
  const ho = c.hosting || {};
  const f = {
    negocio: campo('Negocio *', c.negocio, { req: true }),
    contacto: campo('Contacto (dueño)', c.contacto),
    whatsapp: campo('WhatsApp', c.whatsapp, { ph: '56912345678' }),
    email: campo('Correo', c.email, { tipo: 'email' }),
    ciudad: campo('Comuna', c.ciudad),
    web: campo('Página web', c.web, { ph: 'https://…' }),
    responsable: campo('Responsable', c.responsable),
    desde: campo('Cliente desde', c.desde, { tipo: 'date' }),
    estado: campo('Estado', c.estado, { opciones: [['activo', 'Activo'], ['inactivo', 'Inactivo']] }),
    domNombre: campo('Dominio', d.nombre, { ph: 'negocio.cl' }),
    domReg: campo('Registrado en', d.registrador),
    domDns: campo('DNS en', d.dns),
    domVence: campo('Vence', d.vence, { tipo: 'date' }),
    hoProv: campo('Dónde está', ho.proveedor),
    hoMonto: campo('Valor', ho.monto, { tipo: 'number', min: '0', step: '100' }),
    hoFrec: campo('Frecuencia', ho.frecuencia, { opciones: [['mensual', 'Mensual'], ['anual', 'Anual']] }),
    hoProx: campo('Próximo cobro', ho.proximoCobro, { tipo: 'date' }),
    notas: campo('Notas', c.notas, { tipo: 'textarea', full: true }),
  };
  const cobrar = h('input', { type: 'checkbox', checked: ho.activo !== false });
  const productos = filasRepetibles(c.productos || [], [['nombre', 'Producto'], ['precio', 'Precio', 'number'], ['fecha', 'Fecha', 'date'], ['nota', 'Nota']], 'prod', '+ Agregar producto');
  const accesos = filasRepetibles(c.accesos || [], [['nombre', 'Nombre (ej: Cloudflare)'], ['url', 'https://…']], '', '+ Agregar acceso');
  const error = h('p', { class: 'error', hidden: true });
  const form = h('form', { class: 'form', id: 'form-cliente' },
    f.negocio.el, f.contacto.el, f.whatsapp.el, f.email.el, f.ciudad.el, f.web.el, f.responsable.el, f.desde.el, f.estado.el,
    h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Dominio'), f.domNombre.el, f.domReg.el, f.domDns.el, f.domVence.el),
    h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Hosting'), f.hoProv.el, f.hoMonto.el, f.hoFrec.el, f.hoProx.el, h('label', { class: 'check full' }, cobrar, 'Cobrar hosting a este cliente')),
    h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Productos contratados'), productos),
    h('fieldset', { class: 'fieldset' }, h('legend', {}, 'Accesos rápidos (links, nunca contraseñas)'), accesos),
    f.notas.el, error,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (k) => f[k].input.value.trim();
    if (!v('negocio')) { error.textContent = 'Falta el nombre del negocio.'; error.hidden = false; return; }
    const malos = accesos.valores().filter((a) => a.url && !urlSegura(a.url));
    if (malos.length) { error.textContent = 'Los accesos deben ser links que empiecen con https://'; error.hidden = false; return; }
    const prox = v('hoProx');
    const nuevo = {
      ...c,
      id: c.id || idNuevo(v('negocio')),
      negocio: v('negocio'), contacto: v('contacto'), whatsapp: v('whatsapp').replace(/\D/g, ''), email: v('email'), ciudad: v('ciudad'),
      web: v('web') && !/^https?:\/\//.test(v('web')) ? `https://${v('web')}` : v('web'),
      responsable: v('responsable'), desde: v('desde'), estado: v('estado'), notas: f.notas.input.value.trim(),
      dominio: { nombre: v('domNombre'), registrador: v('domReg'), dns: v('domDns'), vence: v('domVence') },
      hosting: { proveedor: v('hoProv'), monto: Number(v('hoMonto')) || 0, frecuencia: v('hoFrec'), proximoCobro: prox, dia: esFecha(prox) ? Number(prox.slice(8)) : null, activo: cobrar.checked },
      productos: productos.valores().map((p) => ({ ...p, precio: p.precio ? Number(p.precio) : null })),
      accesos: accesos.valores(),
    };
    const ok = await cambiar((data) => {
      const i = data.clientes.findIndex((x) => x.id === nuevo.id);
      if (i >= 0) data.clientes[i] = nuevo; else data.clientes.push(nuevo);
      const p = prospectoId && (data.prospectos || []).find((x) => x.id === prospectoId);
      if (p) { p.estado = 'cerrado'; p.clienteId = nuevo.id; }
    }, id ? 'Cliente actualizado' : 'Cliente agregado');
    if (ok) detalle(nuevo.id);
  });
  abrir(id ? `Editar ${c.negocio}` : 'Nuevo cliente', null, form, [
    h('button', { class: 'btn', type: 'button', onclick: () => (id ? detalle(id) : cerrar()) }, 'Cancelar'),
    h('button', { class: 'btn btn-primary', type: 'submit', form: 'form-cliente' }, 'Guardar'),
  ]);
  f.negocio.input.focus();
}

// ---------- eventos ----------
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = $('#login-nombre').value.trim();
  const err = $('#login-error');
  err.hidden = true;
  const r = await api('/api/panel/login', { method: 'POST', body: JSON.stringify({ nombre, clave: $('#login-clave').value }) });
  if (!r.ok) { err.textContent = r.body?.error || 'No se pudo entrar'; err.hidden = false; return; }
  try { localStorage.setItem('panel-nombre', nombre); } catch { /* sin storage */ }
  $('#login-clave').value = '';
  cargar();
});
$('#salir').addEventListener('click', async () => { await api('/api/panel/login', { method: 'DELETE' }); estado = { data: null, etag: null, usuario: '' }; mostrarLogin(); });
for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => { pestana = b.dataset.tab; render(); });
$('#buscar').addEventListener('input', () => { renderClientes(); prospectos?.render(); });
$('#nuevo').addEventListener('click', () => formulario(null));
$('#nuevo-trabajo').addEventListener('click', formularioTrabajo);
$('#guardar-transferencia').addEventListener('click', () => {
  const t = $('#transferencia').value.trim();
  cambiar((d) => { d.config = { ...(d.config || {}), transferencia: t }; }, 'Datos de transferencia guardados');
});
$('#probar-correo').addEventListener('click', async () => {
  const s = $('#correo-estado');
  s.textContent = 'Enviando…';
  const r = await api('/api/panel/correo', { method: 'POST' });
  s.textContent = r.ok ? `Correo enviado a ${(r.body.destinos || []).join(', ')}. Revisa también la carpeta de spam.` : `No se pudo enviar: ${r.body?.motivo || r.body?.error || 'error desconocido'}`;
});
$('#dlg').addEventListener('close', () => render());

// Trae los cambios de los demás cada minuto, sin interrumpir si hay un diálogo abierto.
setInterval(() => { if (document.visibilityState === 'visible' && !$('#dlg').open && !$('#app').hidden) cargar(true); }, 60000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !$('#dlg').open && !$('#app').hidden) cargar(true); });

prospectos = iniciarProspectos({
  h, $, badge, abrir, cerrar, cambiar, kv, enlace, urlSegura, waLink, idNuevo, campo, filasRepetibles, fechaLarga, hoy,
  estado: () => estado, formulario, trabajosDe,
});
maquetas = iniciarMaquetas({ h, $, badge, abrir, urlSegura, estado: () => estado });

cargar();
