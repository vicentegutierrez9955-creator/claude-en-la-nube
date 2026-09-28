/* F2 Clientes: catálogo, crédito, abonos, estado de cuenta, reporte de saldos */
'use strict';

const Clientes = {
  el: null,
  selId: null,
  filtro: '',

  render(el) {
    Clientes.el = el;
    el.innerHTML = `<div class="panel">
      <div class="toolbar"><h2 style="margin:0 12px 0 0">Clientes</h2>
        <button class="primary" data-a="nuevo">+ Nuevo cliente</button>
        <button class="secondary" data-a="editar">Modificar</button>
        <button class="secondary" data-a="eliminar">Eliminar</button>
        <span class="grow"></span>
        <button class="secondary" data-a="abono">Registrar abono</button>
        <button class="secondary" data-a="estado">Estado de cuenta</button>
        <button class="secondary" data-a="saldos">Reporte de saldos</button>
        <button class="secondary" data-a="exportar">Exportar a Excel</button>
      </div>
      <div class="row"><label class="grow">Buscar cliente<input data-q placeholder="Nombre, teléfono o correo" value="${U.esc(Clientes.filtro)}"></label><label class="check" style="flex:0"><input type="checkbox" data-deudores> Sólo con saldo</label></div>
    </div>
    <div class="panel"><div class="table-wrap" style="max-height:calc(100vh - 290px)"><table class="grid"><thead><tr><th>Nombre</th><th>Teléfono</th><th>Dirección</th><th>Crédito</th><th class="num">Límite</th><th class="num">Saldo</th><th>Último abono</th></tr></thead><tbody data-list></tbody></table></div></div>`;
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => Clientes.accion(b.dataset.a));
    el.querySelector('[data-q]').oninput = (e) => { Clientes.filtro = e.target.value; Clientes.renderList(); };
    el.querySelector('[data-deudores]').onchange = () => Clientes.renderList();
    el.querySelector('[data-list]').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) { Clientes.selId = +tr.dataset.id; Clientes.renderList(); } };
    el.querySelector('[data-list]').ondblclick = () => Clientes.accion('estado');
    Clientes.renderList();
  },
  focus() { const i = Clientes.el && Clientes.el.querySelector('[data-q]'); if (i) i.focus(); },
  onDataChange() { if (App.current === 'clientes') Clientes.renderList(); },

  lista() {
    const q = U.norm(Clientes.filtro);
    const deud = Clientes.el.querySelector('[data-deudores]').checked;
    return Store.clientes.filter(c => (!q || U.norm(`${c.nombre} ${c.telefono || ''} ${c.email || ''}`).includes(q)) && (!deud || c.saldo > 0.005));
  },
  renderList() {
    const rows = Clientes.lista();
    Clientes.el.querySelector('[data-list]').innerHTML = rows.map(c => `<tr class="clickable ${c.id === Clientes.selId ? 'sel' : ''}" data-id="${c.id}"><td>${U.esc(c.nombre)}</td><td>${U.esc(c.telefono || '')}</td><td>${U.esc(c.direccion || '')}</td><td>${c.credito ? '<span class="tag ok">Sí</span>' : '<span class="tag">No</span>'}</td><td class="num">${c.credito ? (c.limite > 0 ? U.money(c.limite) : 'Sin límite') : ''}</td><td class="num ${c.saldo > 0 ? 'bad' : ''}">${U.money(c.saldo)}</td><td>${c.ultimoAbono ? U.fmtDate(c.ultimoAbono) : ''}</td></tr>`).join('') || `<tr><td colspan="7" class="muted center">No hay clientes</td></tr>`;
  },
  sel() { return Store.clientes.find(c => c.id === Clientes.selId); },
  onKey(e) {
    if (e.key === 'Insert') { Clientes.accion('nuevo'); return true; }
    return false;
  },

  async accion(a) {
    const c = Clientes.sel();
    if (['editar', 'eliminar', 'abono', 'estado'].includes(a) && !c) return UI.toast('Seleccione un cliente de la lista');
    if (a === 'nuevo') { const n = await Clientes.editar(); if (n) Clientes.selId = n.id; }
    else if (a === 'editar') await Clientes.editar(c);
    else if (a === 'eliminar') {
      if (await UI.confirm(`¿Eliminar al cliente "${c.nombre}"?`, { danger: true, ok: 'Eliminar' })) {
        try { await Store.eliminarCliente(c.id); UI.toast('Cliente eliminado', 'ok'); } catch (e) { UI.alert(e.message); }
      }
    } else if (a === 'abono') await Clientes.abono(c);
    else if (a === 'estado') await Clientes.estadoCuenta(c);
    else if (a === 'saldos') Clientes.reporteSaldos();
    else if (a === 'exportar') U.exportXlsx('clientes.xlsx', Store.clientes.map(c => ({ Nombre: c.nombre, Telefono: c.telefono || '', Email: c.email || '', Direccion: c.direccion || '', RFC: c.rfc || '', Credito: c.credito ? 'Sí' : 'No', Limite: c.limite, Saldo: c.saldo })), 'Clientes');
    if (App.current === 'clientes') Clientes.renderList();
  },

  async editar(c = {}) {
    if (!Store.can('clientes') && !await UI.autorizar('clientes', 'administrar clientes')) return null;
    const r = await UI.form(c.id ? 'Modificar cliente' : 'Nuevo cliente', [
      { name: 'nombre', label: 'Nombre completo', value: c.nombre, required: true, autofocus: true },
      { name: 'telefono', label: 'Teléfono', value: c.telefono },
      { name: 'email', label: 'Correo electrónico', value: c.email },
      { name: 'direccion', label: 'Dirección', value: c.direccion },
      { name: 'rfc', label: 'RFC / Identificación fiscal', value: c.rfc },
      { name: 'credito', label: 'Tiene crédito autorizado', type: 'checkbox', value: c.id ? c.credito : false },
      { name: 'limite', label: 'Límite de crédito (0 = sin límite)', type: 'number', step: 'any', value: c.limite || 0 },
      { name: 'notas', label: 'Notas', type: 'textarea', value: c.notas },
    ], { ok: 'Guardar' });
    if (!r) return null;
    try {
      const out = await Store.guardarCliente({ ...c, ...r });
      UI.toast('Cliente guardado', 'ok');
      return out;
    } catch (e) { UI.alert(e.message); return null; }
  },

  async abono(c) {
    if (!await UI.autorizar('creditos', 'recibir abonos')) return;
    if (!(c.saldo > 0.005)) return UI.alert(`${c.nombre} no tiene saldo pendiente.`);
    const pend = (await DB.byIndex('ventas', 'clienteId', c.id)).filter(v => v.creditoPendiente > 0.005).sort((a, b) => a.ts - b.ts);
    const r = await UI.form(`Abono de ${c.nombre}`, [
      { name: 'monto', label: `Cantidad a abonar (saldo ${U.money(c.saldo)})`, type: 'number', step: 'any', value: c.saldo, autofocus: true, cls: 'cobro-input' },
      { name: 'forma', label: 'Forma de pago', type: 'select', value: 'efectivo', options: [{ value: 'efectivo', label: 'Efectivo' }, { value: 'tarjeta', label: 'Tarjeta' }] },
      { name: 'venta', label: 'Aplicar a', type: 'select', value: '', options: [{ value: '', label: 'Los tickets más antiguos primero' }, ...pend.map(v => ({ value: v.id, label: `Ticket #${v.id} del ${U.fmtDate(v.ts)} — pendiente ${U.money(v.creditoPendiente)}` }))] },
      { name: 'nota', label: 'Comentario' },
      { name: 'imprimir', label: 'Imprimir comprobante', type: 'checkbox', value: true },
    ], { ok: 'Registrar abono' });
    if (!r) return;
    try {
      const res = await Store.abonar(c.id, r.monto, r.forma, r.venta ? +r.venta : null, r.nota);
      App.tick();
      UI.toast(`Abono registrado. Nuevo saldo: ${U.money(res.cliente.saldo)}`, 'ok');
      if (r.imprimir) Print.html(`<div class="${Print.cls()}">${Print.encabezado()}<hr><div class="c big">COMPROBANTE DE ABONO</div><div>Fecha: ${U.fmtDateTime(Date.now())}</div><div>Cliente: ${U.esc(c.nombre)}</div><hr>
        <table><tr><td>Abono (${r.forma})</td><td class="r big">${U.money(U.num(r.monto))}</td></tr>${res.aplicado.map(a => `<tr><td>Ticket #${a.ventaId}</td><td class="r">${U.money(a.monto)}</td></tr>`).join('')}<tr><td><b>Saldo actual</b></td><td class="r"><b>${U.money(res.cliente.saldo)}</b></td></tr></table>${r.nota ? `<div>${U.esc(r.nota)}</div>` : ''}<hr><div class="c">Recibió: ${U.esc(Store.user.nombre)}</div></div>`);
    } catch (e) { UI.alert(e.message); }
  },

  async estadoCuenta(c) {
    const movs = (await DB.byIndex('movcredito', 'clienteId', c.id)).sort((a, b) => a.ts - b.ts);
    const ventas = await DB.byIndex('ventas', 'clienteId', c.id);
    const pend = ventas.filter(v => v.creditoPendiente > 0.005).sort((a, b) => a.ts - b.ts);
    const m = UI.modal({
      title: `Estado de cuenta — ${c.nombre}`, size: 'xwide',
      body: `<div class="stats"><div class="stat"><div class="k">Saldo actual</div><div class="v ${c.saldo > 0 ? 'bad' : 'ok'}">${U.money(c.saldo)}</div></div>
        <div class="stat"><div class="k">Límite de crédito</div><div class="v">${c.credito ? (c.limite > 0 ? U.money(c.limite) : 'Sin límite') : 'Sin crédito'}</div></div>
        <div class="stat"><div class="k">Disponible</div><div class="v">${c.credito && c.limite > 0 ? U.money(c.limite - c.saldo) : '—'}</div></div>
        <div class="stat"><div class="k">Compras totales</div><div class="v">${U.money(U.sum(ventas, v => v.total))}</div></div></div>
        <div class="row"><label style="max-width:200px">Mostrar<select data-f><option value="todo">Todos los movimientos</option><option value="pend">Sólo tickets pendientes</option></select></label></div>
        <div data-content></div>`,
      footer: `<button class="secondary" data-print>Imprimir estado de cuenta</button><button class="primary" data-abono>Registrar abono</button>`,
    });
    const tablaMovs = () => `<div class="table-wrap" style="max-height:50vh"><table class="grid"><thead><tr><th>Fecha</th><th>Concepto</th><th class="num">Cargo</th><th class="num">Abono</th><th class="num">Saldo</th><th>Atendió</th></tr></thead><tbody>${movs.map(x => `<tr><td>${U.fmtDateTime(x.ts)}</td><td>${U.esc(x.tipo === 'cargo' ? `Venta a crédito #${x.ventaId}` : x.tipo === 'abono' ? `Abono (${x.forma})${x.nota ? ' - ' + x.nota : ''}` : x.nota)}</td><td class="num">${x.tipo === 'cargo' ? U.money(x.monto) : ''}</td><td class="num">${x.tipo !== 'cargo' ? U.money(x.monto) : ''}</td><td class="num">${U.money(x.saldo)}</td><td>${U.esc(x.usuario)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted center">Sin movimientos</td></tr>'}</tbody></table></div>`;
    const tablaPend = () => `<div class="table-wrap" style="max-height:50vh"><table class="grid"><thead><tr><th>Ticket</th><th>Fecha</th><th>Artículos</th><th class="num">Total</th><th class="num">Pendiente</th></tr></thead><tbody>${pend.map(v => `<tr><td>#${v.id}</td><td>${U.fmtDateTime(v.ts)}</td><td class="small">${v.items.map(l => `${U.qty(l.cantidad)} ${U.esc(l.descripcion)}`).join(', ')}</td><td class="num">${U.money(v.total)}</td><td class="num">${U.money(v.creditoPendiente)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted center">Sin tickets pendientes</td></tr>'}</tbody></table></div>`;
    const draw = () => { m.q('[data-content]').innerHTML = m.q('[data-f]').value === 'pend' ? tablaPend() : tablaMovs(); };
    m.q('[data-f]').onchange = draw;
    draw();
    m.q('[data-print]').onclick = () => Print.reporte(`Estado de cuenta: ${c.nombre}`, m.q('[data-content]').innerHTML.replace(/class="table-wrap"[^>]*/, ''), `Saldo actual: <b>${U.money(c.saldo)}</b> · Tel. ${U.esc(c.telefono || '')}`);
    m.q('[data-abono]').onclick = async () => { m.close(); await Clientes.abono(c); if (App.current === 'clientes') Clientes.renderList(); };
    await m.done;
  },

  reporteSaldos() {
    const rows = Store.clientes.filter(c => c.saldo > 0.005).sort((a, b) => b.saldo - a.saldo);
    const table = `<table class="grid"><thead><tr><th>Cliente</th><th>Teléfono</th><th class="num">Límite</th><th class="num">Saldo</th><th>Último abono</th></tr></thead><tbody>${rows.map(c => `<tr><td>${U.esc(c.nombre)}</td><td>${U.esc(c.telefono || '')}</td><td class="num">${c.limite > 0 ? U.money(c.limite) : 'Sin límite'}</td><td class="num">${U.money(c.saldo)}</td><td>${c.ultimoAbono ? U.fmtDate(c.ultimoAbono) : 'Nunca'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted center">Ningún cliente debe dinero</td></tr>'}</tbody><tfoot><tr><td colspan="3">Total por cobrar</td><td class="num">${U.money(U.sum(rows, c => c.saldo))}</td><td></td></tr></tfoot></table>`;
    const m = UI.modal({ title: 'Reporte de saldos', size: 'wide', body: `<div class="table-wrap" style="max-height:60vh">${table}</div>`, footer: `<button class="secondary" data-x>Exportar a Excel</button><button class="primary" data-p>Imprimir</button>` });
    m.q('[data-p]').onclick = () => Print.reporte('Reporte de saldos', table);
    m.q('[data-x]').onclick = () => U.exportXlsx('saldos-clientes.xlsx', rows.map(c => ({ Cliente: c.nombre, Telefono: c.telefono || '', Limite: c.limite, Saldo: c.saldo, 'Ultimo abono': c.ultimoAbono ? U.fmtDate(c.ultimoAbono) : '' })), 'Saldos');
  },
};
