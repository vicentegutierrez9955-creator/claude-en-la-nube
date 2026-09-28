/* F4 Inventario: agregar, ajustes, bajos en inventario, reporte, movimientos, kardex */
'use strict';

const TIPOS_MOV = { venta: 'Venta', entrada: 'Entrada (agregar)', ajuste: 'Ajuste', devolucion: 'Devolución', cancelacion: 'Cancelación', importacion: 'Importación', alta: 'Alta de producto', precio: 'Cambio de precio' };

const Inventario = {
  el: null,
  tab: 'agregar',
  agregados: [],

  render(el) {
    Inventario.el = el;
    const tabs = [['agregar', 'Agregar'], ['ajustes', 'Ajustes'], ['bajos', 'Productos bajos en inventario'], ['reporte', 'Reporte de inventario'], ['movimientos', 'Reporte de movimientos'], ['kardex', 'Kardex']];
    el.innerHTML = `<div class="panel"><div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${k === Inventario.tab ? 'active' : ''}">${n}</button>`).join('')}</div><div data-body></div></div>`;
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { Inventario.tab = b.dataset.tab; Inventario.render(el); Inventario.focus(); });
    Inventario[Inventario.tab](el.querySelector('[data-body]'));
  },
  focus() { const i = Inventario.el && Inventario.el.querySelector('[data-code], [data-focus]'); if (i && !UI.modals.length) i.focus(); },
  onKey(e) {
    if (e.key === 'F10' && ['agregar', 'ajustes', 'kardex'].includes(Inventario.tab)) { Inventario.buscar(); return true; }
    return false;
  },
  onDataChange() { if (App.current === 'inventario' && ['bajos', 'reporte'].includes(Inventario.tab) && !UI.modals.length) Inventario.render(Inventario.el); },

  async buscar() {
    const p = await UI.buscarProducto();
    if (p) Inventario.elegir(p);
  },
  elegir: null,

  codigoForm(box, onProducto, texto) {
    box.insertAdjacentHTML('afterbegin', `<form class="codebar" data-cf style="margin-bottom:10px"><label>${texto}<input data-code placeholder="Escanee o escriba el código y presione Enter"></label><button class="secondary" type="button" data-bus><kbd>F10</kbd>Buscar</button></form>`);
    const f = box.querySelector('[data-cf]');
    Inventario.elegir = onProducto;
    f.onsubmit = async (e) => {
      e.preventDefault();
      const c = f.querySelector('[data-code]');
      const txt = c.value.trim(); c.value = '';
      if (!txt) return;
      const p = Store.findProducto(txt) || await UI.buscarProducto(txt);
      if (p) onProducto(p);
    };
    f.querySelector('[data-bus]').onclick = () => Inventario.buscar();
  },
  esInventariable(p) {
    if (p.tipoVenta === 'P') { UI.alert(`"${p.descripcion}" es un paquete: su inventario se toma de los productos que lo forman.`); return false; }
    if (!p.usaInventario) { UI.alert(`"${p.descripcion}" no utiliza inventario. Actívelo en F3 Productos → Modificar.`); return false; }
    return true;
  },

  /* ---------- Agregar mercancía ---------- */
  agregar(box) {
    box.innerHTML = `<p class="muted">Registre la mercancía que llega a su negocio. Puede actualizar el costo y los precios en el mismo paso.</p>
      <div class="table-wrap"><table class="grid"><thead><tr><th>Hora</th><th>Código</th><th>Descripción</th><th class="num">Cantidad agregada</th><th class="num">Costo</th><th class="num">Existencia nueva</th></tr></thead><tbody data-l></tbody><tfoot><tr><td colspan="4">Total invertido en esta sesión</td><td class="num" data-tot></td><td></td></tr></tfoot></table></div>`;
    Inventario.codigoForm(box, (p) => Inventario.dialogoAgregar(p), 'Producto a agregar:');
    Inventario.drawAgregados(box);
  },
  drawAgregados(box) {
    box.querySelector('[data-l]').innerHTML = Inventario.agregados.map(a => `<tr><td>${U.fmtTime(a.ts)}</td><td>${U.esc(a.codigo)}</td><td>${U.esc(a.descripcion)}</td><td class="num">${U.qty(a.cantidad)}</td><td class="num">${U.money(a.costo * a.cantidad)}</td><td class="num">${U.qty(a.existencia)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted center">Aún no agrega mercancía</td></tr>';
    box.querySelector('[data-tot]').textContent = U.money(U.sum(Inventario.agregados, a => a.costo * a.cantidad));
  },
  async dialogoAgregar(p) {
    if (!Inventario.esInventariable(p)) return;
    const r = await UI.form(`Agregar inventario: ${p.descripcion}`, [
      { name: 'cantidad', label: `Cantidad a agregar (hay ${U.qty(p.existencia)})`, type: 'number', step: 'any', autofocus: true, required: true, cls: 'cobro-input' },
      { name: 'costo', label: 'Precio de costo', type: 'number', step: 'any', value: p.costo },
      { name: 'precio', label: 'Precio de venta', type: 'number', step: 'any', value: p.precio },
      { name: 'mayoreo', label: 'Precio de mayoreo', type: 'number', step: 'any', value: p.mayoreo || '' },
      { name: 'nota', label: 'Nota (proveedor, factura, etc.)' },
    ], { ok: 'Agregar' });
    if (!r) return Inventario.focus();
    const q = U.round3(U.num(r.cantidad));
    if (!(q > 0)) { UI.toast('Cantidad inválida', 'bad'); return Inventario.focus(); }
    try {
      await Store.movimientoInventario(p.id, q, 'entrada', r.nota || 'Entrada de mercancía', { costo: U.round2(U.num(r.costo)), precio: U.round2(U.num(r.precio)), mayoreo: U.round2(U.num(r.mayoreo)) });
      const x = Store.byId.get(p.id);
      Inventario.agregados.unshift({ ts: Date.now(), codigo: x.codigo, descripcion: x.descripcion, cantidad: q, costo: x.costo, existencia: x.existencia });
      UI.toast(`Se agregaron ${U.qty(q)} de "${x.descripcion}". Nueva existencia: ${U.qty(x.existencia)}`, 'ok');
      if (Inventario.tab === 'agregar' && App.current === 'inventario') Inventario.drawAgregados(Inventario.el);
    } catch (e) { UI.alert(e.message); }
    Inventario.focus();
  },

  /* ---------- Ajustes ---------- */
  ajustes(box) {
    box.innerHTML = `<p class="muted">Corrija la existencia por conteo físico, merma, robo, caducidad o errores de captura. El motivo aparece en los reportes.</p><div data-rec></div>`;
    Inventario.codigoForm(box, (p) => Inventario.dialogoAjuste(p), 'Producto a ajustar:');
  },
  async dialogoAjuste(p) {
    if (!Inventario.esInventariable(p)) return;
    const r = await UI.form(`Ajustar inventario: ${p.descripcion}`, [
      { name: 'modo', label: 'Tipo de ajuste', type: 'select', value: 'nueva', options: [{ value: 'nueva', label: 'Indicar la cantidad real que hay' }, { value: 'quitar', label: 'Disminuir (sacar) una cantidad' }, { value: 'sumar', label: 'Aumentar una cantidad' }] },
      { name: 'cantidad', label: `Cantidad (existencia actual: ${U.qty(p.existencia)})`, type: 'number', step: 'any', autofocus: true, required: true, cls: 'cobro-input' },
      { name: 'motivo', label: 'Motivo', type: 'select', value: 'Conteo físico', options: ['Conteo físico', 'Merma', 'Producto dañado', 'Caducidad', 'Robo', 'Consumo interno', 'Error de captura', 'Otro'].map(x => ({ value: x, label: x })) },
      { name: 'nota', label: 'Comentario' },
    ], { ok: 'Ajustar' });
    if (!r) return Inventario.focus();
    const q = U.round3(U.num(r.cantidad));
    const delta = r.modo === 'nueva' ? U.round3(q - p.existencia) : r.modo === 'quitar' ? -q : q;
    if (!delta) { UI.toast('La existencia no cambia'); return Inventario.focus(); }
    try {
      await Store.movimientoInventario(p.id, delta, 'ajuste', r.motivo + (r.nota ? ' - ' + r.nota : ''));
      const x = Store.byId.get(p.id);
      UI.toast(`Ajuste registrado. "${x.descripcion}" ahora tiene ${U.qty(x.existencia)}`, 'ok');
      const rec = Inventario.el.querySelector('[data-rec]');
      if (rec) rec.insertAdjacentHTML('afterbegin', `<p>${U.fmtTime(Date.now())} · ${U.esc(x.descripcion)}: ${delta > 0 ? '+' : ''}${U.qty(delta)} (${U.esc(r.motivo)}) → existencia ${U.qty(x.existencia)}</p>`);
    } catch (e) { UI.alert(e.message); }
    Inventario.focus();
  },

  /* ---------- Bajos en inventario / compras sugeridas ---------- */
  bajos(box) {
    const rows = Store.productos.filter(p => p.usaInventario && p.tipoVenta !== 'P' && p.existencia <= p.minimo).sort((a, b) => (a.departamento || '').localeCompare(b.departamento || '') || a.descripcion.localeCompare(b.descripcion));
    const sug = (p) => Math.max(0, U.round3((p.maximo > 0 ? p.maximo : p.minimo * 2) - p.existencia));
    const table = `<table class="grid"><thead><tr><th>Código</th><th>Descripción</th><th>Departamento</th><th class="num">Hay</th><th class="num">Mínimo</th><th class="num">Máximo</th><th class="num">Compra sugerida</th><th class="num">Costo aprox.</th></tr></thead><tbody>${rows.map(p => `<tr><td>${U.esc(p.codigo)}</td><td>${U.esc(p.descripcion)}</td><td>${U.esc(p.departamento)}</td><td class="num bad">${U.qty(p.existencia)}</td><td class="num">${U.qty(p.minimo)}</td><td class="num">${U.qty(p.maximo)}</td><td class="num"><b>${U.qty(sug(p))}</b></td><td class="num">${U.money(sug(p) * p.costo)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted center">Ningún producto está por debajo de su mínimo</td></tr>'}</tbody><tfoot><tr><td colspan="7">Total de la compra sugerida</td><td class="num">${U.money(U.sum(rows, p => sug(p) * p.costo))}</td></tr></tfoot></table>`;
    box.innerHTML = `<div class="toolbar"><span class="muted">Productos cuya existencia es igual o menor a su inventario mínimo. La compra sugerida completa hasta el máximo.</span><span class="grow"></span><button class="secondary" data-x>Exportar a Excel</button><button class="secondary" data-p>Imprimir</button></div><div class="table-wrap" style="max-height:calc(100vh - 300px)">${table}</div>`;
    box.querySelector('[data-p]').onclick = () => Print.reporte('Productos bajos en inventario', table);
    box.querySelector('[data-x]').onclick = () => U.exportXlsx('bajos-en-inventario.xlsx', rows.map(p => ({ Codigo: p.codigo, Descripcion: p.descripcion, Departamento: p.departamento, Hay: p.existencia, Minimo: p.minimo, Maximo: p.maximo, 'Compra sugerida': sug(p), Costo: p.costo })), 'Bajos');
  },

  /* ---------- Reporte de inventario ---------- */
  reporte(box) {
    box.innerHTML = `<div class="row"><label style="max-width:280px">Departamento<select data-dep data-focus><option value="">Todos</option>${Store.departamentos.map(d => `<option>${U.esc(d.nombre)}</option>`).join('')}</select></label><span class="grow"></span><button class="secondary" data-x>Exportar a Excel</button><button class="secondary" data-p>Imprimir</button></div><div data-res style="margin-top:10px"></div>`;
    let rows = [];
    const draw = () => {
      const dep = box.querySelector('[data-dep]').value;
      rows = Store.productos.filter(p => p.usaInventario && p.tipoVenta !== 'P' && (!dep || p.departamento === dep)).sort((a, b) => a.descripcion.localeCompare(b.descripcion));
      const invCosto = U.sum(rows, p => Math.max(p.existencia, 0) * p.costo), invVenta = U.sum(rows, p => Math.max(p.existencia, 0) * p.precio);
      box.querySelector('[data-res]').innerHTML = `<div class="stats"><div class="stat"><div class="k">Costo del inventario (dinero invertido)</div><div class="v">${U.money(invCosto)}</div></div><div class="stat"><div class="k">Valor a precio de venta</div><div class="v">${U.money(invVenta)}</div></div><div class="stat"><div class="k">Ganancia proyectada</div><div class="v ok">${U.money(invVenta - invCosto)}</div></div><div class="stat"><div class="k">Productos con inventario</div><div class="v">${rows.length}</div></div></div>
        <div class="table-wrap" style="max-height:calc(100vh - 420px)"><table class="grid" data-t><thead><tr><th>Código</th><th>Descripción</th><th>Departamento</th><th class="num">Costo</th><th class="num">Precio venta</th><th class="num">Existencia</th><th class="num">Inv. mínimo</th><th class="num">Valor (costo)</th></tr></thead><tbody>${rows.slice(0, 3000).map(p => `<tr><td>${U.esc(p.codigo)}</td><td>${U.esc(p.descripcion)}</td><td>${U.esc(p.departamento)}</td><td class="num">${U.money(p.costo)}</td><td class="num">${U.money(p.precio)}</td><td class="num ${p.existencia <= p.minimo ? 'bad' : ''}">${U.qty(p.existencia)}</td><td class="num">${U.qty(p.minimo)}</td><td class="num">${U.money(Math.max(p.existencia, 0) * p.costo)}</td></tr>`).join('')}</tbody></table></div>${rows.length > 3000 ? '<p class="muted small">Se muestran 3000; exporte a Excel para ver todos.</p>' : ''}`;
    };
    box.querySelector('[data-dep]').onchange = draw;
    box.querySelector('[data-x]').onclick = () => Importar.exportar(rows);
    box.querySelector('[data-p]').onclick = () => { const t = box.querySelector('[data-t]'); Print.reporte('Reporte de inventario', t.outerHTML, box.querySelector('.stats').innerText.replace(/\n/g, ' · ')); };
    draw();
  },

  /* ---------- Reporte de movimientos ---------- */
  movimientos(box) {
    box.innerHTML = `<div class="row">${UI.rangoFechas('mv', U.addDays(U.today(), -7), U.today())}<label>Tipo<select data-tipo><option value="">Todos</option>${Object.entries(TIPOS_MOV).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label><label class="grow">Producto / nota<input data-q data-focus></label><button class="primary" data-go>Consultar</button><button class="secondary" data-x>Exportar</button></div><div data-res style="margin-top:10px"></div>`;
    let rows = [];
    const go = async () => {
      const from = U.startOfDay(box.querySelector('[data-mv-from]').value), to = U.endOfDay(box.querySelector('[data-mv-to]').value);
      const tipo = box.querySelector('[data-tipo]').value, q = U.norm(box.querySelector('[data-q]').value);
      rows = (await DB.range('movinv', 'ts', from, to)).filter(m => (!tipo || m.tipo === tipo) && (!q || U.norm(`${m.codigo} ${m.descripcion} ${m.nota}`).includes(q))).sort((a, b) => b.ts - a.ts);
      box.querySelector('[data-res]').innerHTML = Inventario.tablaMovs(rows, true);
    };
    box.querySelector('[data-go]').onclick = go;
    box.querySelector('[data-q]').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    box.querySelector('[data-x]').onclick = () => U.exportXlsx('movimientos-inventario.xlsx', rows.map(m => ({ Fecha: U.fmtDateTime(m.ts), Codigo: m.codigo, Descripcion: m.descripcion, Tipo: TIPOS_MOV[m.tipo] || m.tipo, Cantidad: m.cantidad, Antes: m.antes, Despues: m.despues, Nota: m.nota, Usuario: m.usuario })), 'Movimientos');
    go();
  },
  tablaMovs(rows, conProducto) {
    return `<div class="table-wrap" style="max-height:calc(100vh - 330px)"><table class="grid"><thead><tr><th>Fecha</th>${conProducto ? '<th>Producto</th>' : ''}<th>Movimiento</th><th class="num">Cantidad</th><th class="num">Había</th><th class="num">Quedó</th><th>Detalle</th><th>Usuario</th></tr></thead><tbody>${rows.slice(0, 3000).map(m => `<tr><td class="nowrap">${U.fmtDateTime(m.ts)}</td>${conProducto ? `<td>${U.esc(m.descripcion)}</td>` : ''}<td>${U.esc(TIPOS_MOV[m.tipo] || m.tipo)}</td><td class="num ${m.cantidad < 0 ? 'bad' : m.cantidad > 0 ? 'ok' : ''}">${m.tipo === 'precio' ? '' : (m.cantidad > 0 ? '+' : '') + U.qty(m.cantidad)}</td><td class="num">${m.tipo === 'precio' ? '' : U.qty(m.antes)}</td><td class="num">${m.tipo === 'precio' ? '' : U.qty(m.despues)}</td><td>${U.esc(m.nota)}</td><td>${U.esc(m.usuario)}</td></tr>`).join('') || `<tr><td colspan="${conProducto ? 8 : 7}" class="muted center">Sin movimientos</td></tr>`}</tbody></table></div>`;
  },

  /* ---------- Kardex por producto ---------- */
  kardex(box) {
    box.innerHTML = `<p class="muted">Historial completo de un producto: entradas, ventas, devoluciones, ajustes y cambios de precio.</p><div data-res></div>`;
    Inventario.codigoForm(box, async (p) => {
      const movs = (await DB.byIndex('movinv', 'productoId', p.id)).sort((a, b) => b.ts - a.ts);
      const x = Store.byId.get(p.id);
      const vendidos = -U.sum(movs.filter(m => m.tipo === 'venta'), m => m.cantidad);
      box.querySelector('[data-res]').innerHTML = `<h3>${U.esc(x.descripcion)} <span class="muted">(${U.esc(x.codigo)})</span></h3>
        <div class="stats"><div class="stat"><div class="k">Existencia</div><div class="v">${x.usaInventario ? U.qty(x.existencia) : '—'}</div></div><div class="stat"><div class="k">Precio venta</div><div class="v">${U.money(x.precio)}</div></div><div class="stat"><div class="k">Costo</div><div class="v">${U.money(x.costo)}</div></div><div class="stat"><div class="k">Unidades vendidas (historial)</div><div class="v">${U.qty(vendidos)}</div></div></div>
        ${Inventario.tablaMovs(movs, false)}`;
    }, 'Producto:');
  },
};
