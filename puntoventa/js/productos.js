/* F3 Productos: catálogo, alta/modificación, departamentos, promociones, actualizar varios, etiquetas, ventas por periodo */
'use strict';

const Productos = {
  el: null,
  selId: null,
  checked: new Set(),
  filtro: '',
  depto: '',
  limite: 500,

  render(el) {
    Productos.el = el;
    el.innerHTML = `<div class="panel">
      <div class="toolbar"><h2 style="margin:0 12px 0 0">Productos</h2>
        <button class="primary" data-a="nuevo"><kbd>INS</kbd>Nuevo</button>
        <button class="secondary" data-a="modificar">Modificar</button>
        <button class="secondary" data-a="eliminar"><kbd>DEL</kbd>Eliminar</button>
        <button class="secondary" data-a="departamentos">Departamentos</button>
        <button class="secondary" data-a="promociones">Promociones</button>
        <button class="secondary" data-a="varios">Actualizar varios</button>
        <button class="secondary" data-a="ventasPeriodo">Ventas por periodo</button>
        <span class="grow"></span>
        <button class="secondary" data-a="importar">Importar</button>
        <button class="secondary" data-a="exportar">Exportar a Excel</button>
        <button class="secondary" data-a="etiquetas">Imprimir etiquetas</button>
      </div>
      <div class="row">
        <label class="grow">Buscar producto (código, descripción o departamento)<input data-q value="${U.esc(Productos.filtro)}"></label>
        <label style="max-width:260px">Departamento<select data-dep></select></label>
        <label style="max-width:200px">Mostrar<select data-ver><option value="">Todos</option><option value="bajos">Bajos en inventario</option><option value="sininv">Sin control de inventario</option><option value="granel">Granel</option><option value="paquete">Paquetes</option><option value="promo">Con promoción</option></select></label>
      </div>
    </div>
    <div class="panel"><p class="muted small" data-info></p><div class="table-wrap" style="max-height:calc(100vh - 320px)"><table class="grid"><thead><tr><th><input type="checkbox" data-all title="Seleccionar todos"></th><th>Código</th><th>Descripción</th><th>Departamento</th><th>Tipo</th><th class="num">Costo</th><th class="num">Precio venta</th><th class="num">Mayoreo</th><th class="num">Existencia</th><th class="num">Mín.</th></tr></thead><tbody data-list></tbody></table></div></div>`;
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => Productos.accion(b.dataset.a));
    el.querySelector('[data-q]').oninput = U.debounce((e) => { Productos.filtro = el.querySelector('[data-q]').value; Productos.renderList(); }, 150);
    el.querySelector('[data-dep]').onchange = (e) => { Productos.depto = e.target.value; Productos.renderList(); };
    el.querySelector('[data-ver]').onchange = () => Productos.renderList();
    el.querySelector('[data-all]').onchange = (e) => { for (const p of Productos.rows) e.target.checked ? Productos.checked.add(p.id) : Productos.checked.delete(p.id); Productos.renderList(); };
    const list = el.querySelector('[data-list]');
    list.onclick = (e) => {
      const tr = e.target.closest('tr[data-id]'); if (!tr) return;
      const id = +tr.dataset.id;
      if (e.target.matches('input[type=checkbox]')) { e.target.checked ? Productos.checked.add(id) : Productos.checked.delete(id); return; }
      Productos.selId = id; list.querySelectorAll('tr').forEach(x => x.classList.toggle('sel', x === tr));
    };
    list.ondblclick = (e) => { if (e.target.closest('tr[data-id]')) Productos.accion('modificar'); };
    Productos.renderDeps();
    Productos.renderList();
  },
  focus() { const i = Productos.el && Productos.el.querySelector('[data-q]'); if (i && !UI.modals.length) i.focus(); },
  onDataChange() { if (App.current === 'productos') { Productos.renderDeps(); Productos.renderList(); } },
  onKey(e) {
    if (e.key === 'Insert') { Productos.accion('nuevo'); return true; }
    if (e.key === 'Delete' && document.activeElement.tagName !== 'INPUT') { Productos.accion('eliminar'); return true; }
    if (e.key === 'Enter' && Productos.selId && document.activeElement.tagName !== 'INPUT') { Productos.accion('modificar'); return true; }
    return false;
  },

  renderDeps() {
    const s = Productos.el.querySelector('[data-dep]');
    s.innerHTML = `<option value="">Todos</option>${Store.departamentos.map(d => `<option ${d.nombre === Productos.depto ? 'selected' : ''}>${U.esc(d.nombre)}</option>`).join('')}`;
  },
  filtrar() {
    const ver = Productos.el.querySelector('[data-ver]').value;
    const conPromo = new Set(Store.promociones.map(x => x.productoId));
    let rows = Productos.filtro ? Store.buscarProductos(Productos.filtro, 1e9) : Store.productos.slice().sort((a, b) => a.descripcion.localeCompare(b.descripcion));
    if (Productos.depto) rows = rows.filter(p => p.departamento === Productos.depto);
    if (ver === 'bajos') rows = rows.filter(p => p.usaInventario && p.existencia <= p.minimo);
    if (ver === 'sininv') rows = rows.filter(p => !p.usaInventario);
    if (ver === 'granel') rows = rows.filter(p => p.tipoVenta === 'G');
    if (ver === 'paquete') rows = rows.filter(p => p.tipoVenta === 'P');
    if (ver === 'promo') rows = rows.filter(p => conPromo.has(p.id));
    return rows;
  },
  renderList() {
    const all = Productos.filtrar();
    Productos.rows = all;
    const rows = all.slice(0, Productos.limite);
    Productos.el.querySelector('[data-info]').innerHTML = `${all.length} producto(s)${all.length > rows.length ? ` · mostrando los primeros ${rows.length}, use el buscador para encontrar otros` : ''} · ${Productos.checked.size} seleccionado(s) con la casilla`;
    Productos.el.querySelector('[data-list]').innerHTML = rows.map(p => `<tr class="clickable ${p.id === Productos.selId ? 'sel' : ''}" data-id="${p.id}">
      <td><input type="checkbox" ${Productos.checked.has(p.id) ? 'checked' : ''}></td><td>${U.esc(p.codigo)}</td><td>${U.esc(p.descripcion)}</td><td>${U.esc(p.departamento)}</td>
      <td><span class="tag ${p.tipoVenta === 'G' ? 'warn' : p.tipoVenta === 'P' ? 'ok' : ''}">${{ U: 'Unidad', G: 'Granel', P: 'Paquete' }[p.tipoVenta]}</span></td>
      <td class="num">${U.money(Store.costoProducto(p))}</td><td class="num"><b>${U.money(p.precio)}</b></td><td class="num">${p.mayoreo ? U.money(p.mayoreo) : ''}</td>
      <td class="num ${p.usaInventario && p.existencia <= p.minimo ? 'bad' : ''}">${p.usaInventario ? U.qty(p.existencia) : '—'}</td><td class="num">${p.usaInventario ? U.qty(p.minimo) : ''}</td></tr>`).join('') || `<tr><td colspan="10" class="muted center" style="padding:30px">No hay productos. Use <b>Nuevo</b> o <b>Importar</b> para cargar su catálogo desde Excel.</td></tr>`;
  },
  sel() { return Store.byId.get(Productos.selId); },

  async accion(a) {
    const p = Productos.sel();
    if (a === 'nuevo') { const n = await Productos.editar(); if (n) { Productos.selId = n.id; } }
    else if (a === 'modificar') { if (!p) return UI.toast('Seleccione un producto'); await Productos.editar(p); }
    else if (a === 'eliminar') {
      const ids = Productos.checked.size ? [...Productos.checked] : p ? [p.id] : [];
      if (!ids.length) return UI.toast('Seleccione un producto');
      const txt = ids.length === 1 ? `¿Eliminar el producto "${Store.byId.get(ids[0]).descripcion}"?` : `¿Eliminar ${ids.length} productos seleccionados?`;
      if (!await UI.confirm(txt + '\nLas ventas anteriores no se modifican.', { danger: true, ok: 'Eliminar' })) return;
      let err = 0;
      for (const id of ids) { try { await Store.eliminarProducto(id); Productos.checked.delete(id); } catch (e) { err++; UI.toast(e.message, 'bad'); } }
      UI.toast(`${ids.length - err} producto(s) eliminado(s)`, 'ok');
    }
    else if (a === 'departamentos') await Productos.departamentos();
    else if (a === 'promociones') await Productos.promociones();
    else if (a === 'varios') await Productos.actualizarVarios();
    else if (a === 'ventasPeriodo') await Productos.ventasPeriodo();
    else if (a === 'importar') await Importar.abrir();
    else if (a === 'exportar') Importar.exportar(Productos.checked.size ? [...Productos.checked].map(id => Store.byId.get(id)) : Productos.filtrar());
    else if (a === 'etiquetas') await Productos.etiquetas();
    if (App.current === 'productos') { Productos.renderDeps(); Productos.renderList(); }
  },

  /* ---------- Formulario de producto ---------- */
  editar(p = null) {
    const nuevo = !p;
    p = p ? JSON.parse(JSON.stringify(p)) : { codigo: '', descripcion: '', tipoVenta: 'U', costo: 0, precio: 0, mayoreo: 0, mayoreoDesde: 0, departamento: '', usaInventario: true, existencia: 0, minimo: 0, maximo: 0, componentes: [] };
    const gan = p.costo > 0 ? U.round2((p.precio / p.costo - 1) * 100) : '';
    const m = UI.modal({
      title: nuevo ? 'Nuevo producto' : `Modificar producto: ${p.descripcion}`, size: 'wide',
      body: `<form data-f autocomplete="off">
        <div class="grid2"><label>Código de barras<input name="codigo" value="${U.esc(p.codigo)}" required autofocus></label><label>Descripción<input name="descripcion" value="${U.esc(p.descripcion)}" required></label></div>
        <fieldset style="border:1px solid var(--line);border-radius:6px;margin:10px 0"><legend>Se vende</legend>
          <label class="check" style="display:inline-flex;margin-right:16px"><input type="radio" name="tipoVenta" value="U" ${p.tipoVenta === 'U' ? 'checked' : ''}> Por unidad / pieza</label>
          <label class="check" style="display:inline-flex;margin-right:16px"><input type="radio" name="tipoVenta" value="G" ${p.tipoVenta === 'G' ? 'checked' : ''}> A granel (usa decimales: kg, lt, m)</label>
          <label class="check" style="display:inline-flex"><input type="radio" name="tipoVenta" value="P" ${p.tipoVenta === 'P' ? 'checked' : ''}> Como paquete (usa inventario de otros productos)</label>
        </fieldset>
        <div class="grid4"><label>Precio costo<input name="costo" type="number" step="any" value="${p.costo}"></label><label>Ganancia (%)<input name="ganancia" type="number" step="any" value="${gan}"></label><label>Precio venta<input name="precio" type="number" step="any" value="${p.precio}" required></label><label>Precio mayoreo<input name="mayoreo" type="number" step="any" value="${p.mayoreo || ''}"></label></div>
        <div class="grid4" style="margin-top:10px"><label>Mayoreo automático desde (cant.)<input name="mayoreoDesde" type="number" step="any" value="${p.mayoreoDesde || ''}" placeholder="Opcional"></label>
          <label style="grid-column:span 2">Departamento<select name="departamento"><option value="">— Sin departamento —</option>${Store.departamentos.map(d => `<option ${d.nombre === p.departamento ? 'selected' : ''}>${U.esc(d.nombre)}</option>`).join('')}</select></label>
          <div style="display:flex;align-items:flex-end"><button type="button" class="secondary" data-dep>Administrar departamentos</button></div></div>
        <div data-inv class="panel" style="margin-top:10px"><label class="check"><input type="checkbox" name="usaInventario" ${p.usaInventario ? 'checked' : ''}> Este producto utiliza inventario</label>
          <div class="grid3" data-invf style="margin-top:8px"><label>${nuevo ? 'Hay (existencia inicial)' : 'Hay (existencia actual)'}<input name="existencia" type="number" step="any" value="${p.existencia}" ${nuevo ? '' : 'disabled title="Para cambiar la existencia use F4 Inventario → Agregar o Ajustar"'}></label><label>Inventario mínimo<input name="minimo" type="number" step="any" value="${p.minimo}"></label><label>Inventario máximo<input name="maximo" type="number" step="any" value="${p.maximo}"></label></div>
          ${nuevo ? '' : '<p class="muted small">Para cambiar la existencia use F4 Inventario → Agregar o Ajustar.</p>'}</div>
        <div data-paq class="panel" style="margin-top:10px"><h3>Productos incluidos en el paquete</h3><div class="toolbar"><button type="button" class="secondary" data-addc>+ Agregar producto al paquete</button></div><table class="grid"><thead><tr><th>Código</th><th>Descripción</th><th class="num">Cantidad</th><th class="num">Costo</th><th></th></tr></thead><tbody data-comp></tbody></table></div>
        <button type="submit" class="hidden"></button></form><p class="error" data-err></p>`,
      footer: `<button class="secondary" data-no>Cancelar</button><button class="primary" data-ok>Guardar producto</button>`,
    });
    const f = m.q('[data-f]');
    const E = f.elements;
    const comps = p.componentes.map(c => ({ ...c }));
    const syncTipo = () => {
      const t = f.querySelector('input[name=tipoVenta]:checked').value;
      m.q('[data-paq]').classList.toggle('hidden', t !== 'P');
      m.q('[data-inv]').classList.toggle('hidden', t === 'P');
      m.q('[data-invf]').classList.toggle('hidden', !E.usaInventario.checked);
    };
    const drawComps = () => {
      m.q('[data-comp]').innerHTML = comps.map((c, i) => { const x = Store.byId.get(c.id); return x ? `<tr><td>${U.esc(x.codigo)}</td><td>${U.esc(x.descripcion)}</td><td class="num"><input type="number" step="any" value="${c.cantidad}" data-cq="${i}" style="width:80px"></td><td class="num">${U.money(x.costo * c.cantidad)}</td><td><button type="button" class="ghost" data-cdel="${i}">✕</button></td></tr>` : ''; }).join('') || '<tr><td colspan="5" class="muted center">Agregue los productos que forman el paquete</td></tr>';
      m.qa('[data-cq]').forEach(i => i.oninput = () => { comps[+i.dataset.cq].cantidad = U.num(i.value); });
      m.qa('[data-cdel]').forEach(b => b.onclick = () => { comps.splice(+b.dataset.cdel, 1); drawComps(); });
    };
    f.querySelectorAll('input[name=tipoVenta]').forEach(r => r.onchange = syncTipo);
    E.usaInventario.onchange = syncTipo;
    E.costo.oninput = () => { if (E.ganancia.value !== '') E.precio.value = U.round2(U.num(E.costo.value) * (1 + U.num(E.ganancia.value) / 100)); };
    E.ganancia.oninput = () => { E.precio.value = U.round2(U.num(E.costo.value) * (1 + U.num(E.ganancia.value) / 100)); };
    E.precio.oninput = () => { const c = U.num(E.costo.value); E.ganancia.value = c > 0 ? U.round2((U.num(E.precio.value) / c - 1) * 100) : ''; };
    m.q('[data-dep]').onclick = async () => {
      await Productos.departamentos();
      const cur = E.departamento.value;
      E.departamento.innerHTML = `<option value="">— Sin departamento —</option>${Store.departamentos.map(d => `<option ${d.nombre === cur ? 'selected' : ''}>${U.esc(d.nombre)}</option>`).join('')}`;
    };
    m.q('[data-addc]').onclick = async () => {
      const x = await UI.buscarProducto('', { titulo: 'Agregar producto al paquete' });
      if (!x) return;
      if (x.tipoVenta === 'P') return UI.toast('No se puede incluir un paquete dentro de otro', 'bad');
      const ex = comps.find(c => c.id === x.id);
      if (ex) ex.cantidad += 1; else comps.push({ id: x.id, cantidad: 1 });
      drawComps();
    };
    const guardar = async () => {
      if (!f.reportValidity()) return;
      const data = {
        id: p.id, codigo: E.codigo.value, descripcion: E.descripcion.value, tipoVenta: f.querySelector('input[name=tipoVenta]:checked').value,
        costo: E.costo.value, precio: E.precio.value, mayoreo: E.mayoreo.value, mayoreoDesde: E.mayoreoDesde.value, departamento: E.departamento.value,
        usaInventario: E.usaInventario.checked, minimo: E.minimo.value, maximo: E.maximo.value, componentes: comps,
      };
      if (nuevo) data.existencia = E.existencia.value;
      if (U.num(data.precio) < U.num(data.costo) && !await UI.confirm('El precio de venta es menor al costo. ¿Guardar de todos modos?')) return;
      try {
        const out = await Store.guardarProducto(data);
        UI.toast('Producto guardado', 'ok');
        m.close(out);
      } catch (e) { m.q('[data-err]').textContent = e.message; }
    };
    f.onsubmit = (e) => { e.preventDefault(); guardar(); };
    m.q('[data-ok]').onclick = guardar;
    m.q('[data-no]').onclick = () => m.close(null);
    syncTipo(); drawComps();
    return m.done;
  },

  /* ---------- Departamentos ---------- */
  async departamentos() {
    const m = UI.modal({
      title: 'Departamentos',
      body: `<form data-f class="row"><label class="grow">Nuevo departamento<input data-n></label><button class="primary" type="submit">Agregar</button></form><div class="table-wrap" style="max-height:50vh"><table class="grid"><thead><tr><th>Departamento</th><th class="num">Productos</th><th></th></tr></thead><tbody data-l></tbody></table></div>`,
    });
    const draw = () => {
      m.q('[data-l]').innerHTML = Store.departamentos.map(d => `<tr><td>${U.esc(d.nombre)}</td><td class="num">${Store.productos.filter(p => p.departamento === d.nombre).length}</td><td class="right nowrap"><button class="ghost" data-r="${d.id}">Renombrar</button><button class="ghost bad" data-d="${d.id}">Eliminar</button></td></tr>`).join('') || '<tr><td colspan="3" class="muted center">Sin departamentos</td></tr>';
      m.qa('[data-r]').forEach(b => b.onclick = async () => {
        const d = Store.departamentos.find(x => x.id === +b.dataset.r);
        const n = await UI.prompt('Renombrar departamento', 'Nuevo nombre', d.nombre);
        if (n) { try { await Store.guardarDepartamento(d.id, n); draw(); } catch (e) { UI.toast(e.message, 'bad'); } }
      });
      m.qa('[data-d]').forEach(b => b.onclick = async () => {
        const d = Store.departamentos.find(x => x.id === +b.dataset.d);
        if (await UI.confirm(`¿Eliminar el departamento "${d.nombre}"? Sus productos quedarán sin departamento.`, { danger: true, ok: 'Eliminar' })) { await Store.eliminarDepartamento(d.id); draw(); }
      });
    };
    m.q('[data-f]').onsubmit = async (e) => {
      e.preventDefault();
      try { await Store.guardarDepartamento(null, m.q('[data-n]').value); m.q('[data-n]').value = ''; draw(); } catch (ex) { UI.toast(ex.message, 'bad'); }
    };
    draw();
    await m.done;
  },

  /* ---------- Promociones ---------- */
  promoTexto(x) {
    if (x.tipo === 'rango') return `De ${U.qty(x.cantidad)}${x.hasta ? ' a ' + U.qty(x.hasta) : ' en adelante'}: ${U.money(x.valor)} c/u`;
    if (x.tipo === 'nx') return `Lleva ${U.qty(x.cantidad)} por ${U.money(x.valor)}`;
    return `${U.pct(x.valor)} de descuento`;
  },
  async promociones() {
    const m = UI.modal({
      title: 'Promociones', size: 'xwide',
      body: `<div class="toolbar"><button class="primary" data-n>+ Nueva promoción</button><span class="muted small">Las promociones se aplican solas en la venta cuando se cumple la cantidad y la vigencia.</span></div>
      <div class="table-wrap" style="max-height:55vh"><table class="grid"><thead><tr><th>Producto</th><th>Promoción</th><th>Nombre</th><th>Vigencia</th><th>Estado</th><th></th></tr></thead><tbody data-l></tbody></table></div>`,
    });
    const draw = () => {
      const hoy = U.today();
      m.q('[data-l]').innerHTML = Store.promociones.map(x => {
        const p = Store.byId.get(x.productoId);
        const vig = x.activa !== false && (!x.desde || x.desde <= hoy) && (!x.hasta_f || x.hasta_f >= hoy);
        return `<tr><td>${p ? U.esc(p.descripcion) : '(eliminado)'}</td><td>${Productos.promoTexto(x)}</td><td>${U.esc(x.nombre || '')}</td><td>${x.desde || 'Siempre'}${x.hasta_f ? ' a ' + x.hasta_f : ''}</td><td>${vig ? '<span class="tag ok">Vigente</span>' : '<span class="tag">Inactiva</span>'}</td><td class="right nowrap"><button class="ghost" data-e="${x.id}">Modificar</button><button class="ghost bad" data-d="${x.id}">Eliminar</button></td></tr>`;
      }).join('') || '<tr><td colspan="6" class="muted center">Sin promociones</td></tr>';
      m.qa('[data-e]').forEach(b => b.onclick = async () => { await Productos.editarPromo(Store.promociones.find(x => x.id === +b.dataset.e)); draw(); });
      m.qa('[data-d]').forEach(b => b.onclick = async () => { if (await UI.confirm('¿Eliminar la promoción?', { danger: true })) { await Store.eliminarPromocion(+b.dataset.d); draw(); } });
    };
    m.q('[data-n]').onclick = async () => { await Productos.editarPromo(); draw(); };
    draw();
    await m.done;
  },
  async editarPromo(x = null) {
    let prod = x ? Store.byId.get(x.productoId) : await UI.buscarProducto('', { titulo: 'Producto para la promoción' });
    if (!prod) return;
    const r = await UI.form(`Promoción: ${prod.descripcion} (precio normal ${U.money(prod.precio)})`, [
      { name: 'tipo', label: 'Tipo de promoción', type: 'select', value: x ? x.tipo : 'rango', options: [
        { value: 'rango', label: 'Precio especial por cantidad (de X a Y unidades)' },
        { value: 'nx', label: 'Lleva N por $X (ej. 3 por $10)' },
        { value: 'pct', label: 'Porcentaje de descuento' }] },
      { name: 'cantidad', label: 'Desde (cantidad) / N', type: 'number', step: 'any', value: x ? x.cantidad : 2 },
      { name: 'hasta', label: 'Hasta (cantidad, vacío = sin límite; sólo para precio por cantidad)', type: 'number', step: 'any', value: x ? x.hasta || '' : '' },
      { name: 'valor', label: 'Precio unitario / Precio del grupo / Porcentaje', type: 'number', step: 'any', value: x ? x.valor : '', required: true },
      { name: 'nombre', label: 'Nombre que aparece en el ticket (opcional)', value: x ? x.nombre : '' },
      { name: 'desde', label: 'Vigente desde (opcional)', type: 'date', value: x ? x.desde || '' : '' },
      { name: 'hasta_f', label: 'Vigente hasta (opcional)', type: 'date', value: x ? x.hasta_f || '' : '' },
      { name: 'activa', label: 'Promoción activa', type: 'checkbox', value: x ? x.activa !== false : true },
    ], { ok: 'Guardar promoción' });
    if (!r) return;
    const promo = { ...(x || {}), productoId: prod.id, tipo: r.tipo, cantidad: U.num(r.cantidad), hasta: U.num(r.hasta) || null, valor: U.num(r.valor), nombre: r.nombre, desde: r.desde || null, hasta_f: r.hasta_f || null, activa: r.activa };
    if (promo.tipo !== 'pct' && !(promo.cantidad > 0)) return UI.toast('Indique la cantidad', 'bad');
    if (promo.tipo === 'pct' && (promo.valor <= 0 || promo.valor >= 100)) return UI.toast('Porcentaje inválido', 'bad');
    await Store.guardarPromocion(promo);
    UI.toast('Promoción guardada', 'ok');
  },

  /* ---------- Actualizar varios productos ---------- */
  async actualizarVarios() {
    const ids = Productos.checked.size ? [...Productos.checked] : Productos.filtrar().map(p => p.id);
    if (!ids.length) return UI.toast('No hay productos para actualizar');
    const r = await UI.form(`Actualizar ${ids.length} producto(s)`, [
      { name: 'accion', label: 'Qué desea hacer', type: 'select', value: 'aumentarPrecio', options: [
        { value: 'aumentarPrecio', label: 'Aumentar precio de venta (%)' },
        { value: 'disminuirPrecio', label: 'Disminuir precio de venta (%)' },
        { value: 'ganancia', label: 'Calcular precio con % de ganancia sobre el costo' },
        { value: 'precio', label: 'Asignar el mismo precio de venta' },
        { value: 'aumentarCosto', label: 'Aumentar precio de costo (%)' },
        { value: 'mayoreoPct', label: 'Precio de mayoreo = precio venta menos (%)' },
        { value: 'departamento', label: 'Cambiar departamento' },
        { value: 'usaInventario', label: 'Usar inventario (escriba si / no)' },
        { value: 'minimo', label: 'Asignar inventario mínimo' },
        { value: 'maximo', label: 'Asignar inventario máximo' },
        { value: 'tipoVenta', label: 'Tipo de venta (U = unidad, G = granel)' }] },
      { name: 'valor', label: 'Valor', required: true, autofocus: true },
    ], { ok: 'Aplicar cambios', note: Productos.checked.size ? 'Se modificarán los productos marcados con la casilla.' : 'Se modificarán todos los productos mostrados con el filtro actual (marque casillas para elegir sólo algunos).' });
    if (!r) return;
    let valor = r.valor;
    if (r.accion === 'usaInventario') valor = U.norm(valor).startsWith('s');
    if (r.accion === 'tipoVenta') valor = String(valor).trim().toUpperCase().slice(0, 1);
    if (!await UI.confirm(`Se aplicará el cambio a ${ids.length} producto(s). ¿Continuar?`)) return;
    try {
      const n = await Store.actualizarVarios(ids, r.accion, valor);
      UI.toast(`${n} producto(s) actualizados`, 'ok');
    } catch (e) { UI.alert(e.message); }
  },

  /* ---------- Etiquetas con código de barras ---------- */
  async etiquetas() {
    const lista = Productos.checked.size ? [...Productos.checked].map(id => Store.byId.get(id)) : Productos.sel() ? [Productos.sel()] : [];
    if (!lista.length) return UI.toast('Seleccione productos (con la casilla) para imprimir etiquetas');
    const n = await UI.prompt('Imprimir etiquetas', `Etiquetas por producto (${lista.length} producto(s))`, 1, 'number');
    if (n === null) return;
    Print.etiquetas(lista.map(p => ({ p, n: Math.max(1, Math.min(500, parseInt(n, 10) || 1)) })));
  },

  /* ---------- Ventas por periodo ---------- */
  async ventasPeriodo() {
    const m = UI.modal({
      title: 'Ventas por periodo (por producto)', size: 'xwide',
      body: `<div class="row">${UI.rangoFechas('vp', U.firstOfMonth(), U.today())}<label>Departamento<select data-dep><option value="">Todos</option>${Store.departamentos.map(d => `<option>${U.esc(d.nombre)}</option>`).join('')}</select></label><button class="primary" data-go>Consultar</button></div>
      <div data-res></div>`,
      footer: `<button class="secondary" data-x>Exportar a Excel</button><button class="secondary" data-p>Imprimir</button>`,
    });
    let rows = [];
    const go = async () => {
      const from = U.startOfDay(m.q('[data-vp-from]').value), to = U.endOfDay(m.q('[data-vp-to]').value);
      const dep = m.q('[data-dep]').value;
      const ventas = await Store.ventasDe(from, to);
      const map = new Map();
      for (const v of ventas) for (const l of v.items) {
        if (dep && l.departamento !== dep) continue;
        const k = l.productoId || 'c:' + l.descripcion;
        const r = map.get(k) || { codigo: l.codigo || 'COMÚN', descripcion: l.descripcion, departamento: l.departamento, cantidad: 0, importe: 0, costo: 0 };
        const neto = l.cantidad - l.devuelto;
        r.cantidad += neto; r.importe += l.importe * neto / l.cantidad; r.costo += l.costo * neto;
        map.set(k, r);
      }
      rows = [...map.values()].filter(r => r.cantidad > 0).sort((a, b) => b.importe - a.importe);
      m.q('[data-res]').innerHTML = `<div class="stats"><div class="stat"><div class="k">Vendido</div><div class="v">${U.money(U.sum(rows, r => r.importe))}</div></div><div class="stat"><div class="k">Costo</div><div class="v">${U.money(U.sum(rows, r => r.costo))}</div></div><div class="stat"><div class="k">Ganancia</div><div class="v ok">${U.money(U.sum(rows, r => r.importe - r.costo))}</div></div><div class="stat"><div class="k">Productos distintos</div><div class="v">${rows.length}</div></div></div>
      <div class="table-wrap" style="max-height:45vh"><table class="grid" data-t><thead><tr><th>Código</th><th>Descripción</th><th>Departamento</th><th class="num">Cantidad</th><th class="num">Vendido</th><th class="num">Ganancia</th></tr></thead><tbody>${rows.map(r => `<tr><td>${U.esc(r.codigo)}</td><td>${U.esc(r.descripcion)}</td><td>${U.esc(r.departamento)}</td><td class="num">${U.qty(r.cantidad)}</td><td class="num">${U.money(r.importe)}</td><td class="num">${U.money(r.importe - r.costo)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted center">Sin ventas en el periodo</td></tr>'}</tbody></table></div>`;
    };
    m.q('[data-go]').onclick = go;
    m.q('[data-x]').onclick = () => U.exportXlsx('ventas-por-periodo.xlsx', rows.map(r => ({ Codigo: r.codigo, Descripcion: r.descripcion, Departamento: r.departamento, Cantidad: U.round3(r.cantidad), Vendido: U.round2(r.importe), Costo: U.round2(r.costo), Ganancia: U.round2(r.importe - r.costo) })), 'Ventas');
    m.q('[data-p]').onclick = () => { const t = m.q('[data-t]'); if (t) Print.reporte('Ventas por periodo', t.outerHTML, `${m.q('[data-vp-from]').value} a ${m.q('[data-vp-to]').value}`); };
    await go();
    await m.done;
  },
};
