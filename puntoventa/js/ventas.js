/* F1 Ventas: tickets, cobro, entradas/salidas, devoluciones */
'use strict';

const Ventas = {
  el: null,
  sel: 0,
  ultimaVenta: null,

  get T() {
    if (!Store.tickets || !Store.tickets.list || !Store.tickets.list.length) Store.tickets = { list: [Ventas.nuevoTicket(1)], activo: 0, n: 1 };
    if (Store.tickets.activo >= Store.tickets.list.length) Store.tickets.activo = 0;
    return Store.tickets.list[Store.tickets.activo];
  },
  nuevoTicket(n) { return { id: Date.now() + Math.random(), nombre: `Ticket ${n}`, items: [], clienteId: null, notas: '' }; },
  save() { Store.saveTickets(); },

  render(el) {
    Ventas.el = el;
    el.innerHTML = `<div class="ventas">
      <div class="left">
        <div class="ticket-tabs" data-tabs></div>
        <form class="codebar" data-codeform autocomplete="off">
          <label>Código del producto: <input data-code placeholder="Escanee o escriba el código y presione Enter (ej. 3*7501234)" autofocus></label>
          <button class="primary" type="submit">Agregar</button>
        </form>
        <div class="actions">
          <button data-a="varios"><kbd>INS</kbd>Varios</button>
          <button data-a="comun"><kbd>Ctrl+P</kbd>Art. Común</button>
          <button data-a="buscar"><kbd>F10</kbd>Buscar</button>
          <button data-a="mayoreo"><kbd>F11</kbd>Mayoreo</button>
          <button data-a="entrada"><kbd>F7</kbd>Entradas</button>
          <button data-a="salida"><kbd>F8</kbd>Salidas</button>
          <button data-a="borrar"><kbd>DEL</kbd>Borrar Art.</button>
          <button data-a="verificador"><kbd>F9</kbd>Verificador</button>
          <button data-a="descuento"><kbd>Alt+D</kbd>Descuento</button>
          <button data-a="precio"><kbd>Alt+P</kbd>Cambiar precio</button>
        </div>
        <div class="table-wrap venta-table"><table class="grid"><thead><tr><th>Código</th><th>Descripción del producto</th><th class="num">Precio venta</th><th class="num">Cant.</th><th class="num">Importe</th><th class="num">Existencia</th></tr></thead><tbody data-lines></tbody></table></div>
        <div class="actions">
          <button data-a="cambiar"><kbd>F5</kbd>Cambiar ticket</button>
          <button data-a="pendiente"><kbd>F6</kbd>Nuevo ticket (pendiente)</button>
          <button data-a="eliminarTicket"><kbd>Alt+E</kbd>Eliminar ticket</button>
          <button data-a="reimprimir"><kbd>Alt+R</kbd>Reimprimir último ticket</button>
          <button data-a="ventasDia"><kbd>Alt+V</kbd>Ventas del día y devoluciones</button>
          <button data-a="notas"><kbd>Alt+N</kbd>Notas</button>
        </div>
      </div>
      <div class="right">
        <div class="total-box"><div class="lbl">TOTAL</div><div class="amount" data-total>$0.00</div><div class="items" data-items></div></div>
        <button class="success cobrar-btn" data-a="cobrar"><kbd>F12</kbd> Cobrar</button>
        <div class="cliente-box" data-cliente></div>
        <div class="lastsale" data-last></div>
        <p class="muted small">↑ ↓ elegir artículo · <b>+</b> / <b>-</b> cambiar cantidad (con el código vacío)</p>
      </div>
    </div>`;
    el.querySelector('[data-codeform]').onsubmit = (e) => { e.preventDefault(); Ventas.agregarCodigo(); };
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => Ventas.accion(b.dataset.a));
    el.querySelector('[data-lines]').onclick = (e) => {
      const tr = e.target.closest('tr[data-i]');
      if (!tr) return;
      Ventas.sel = +tr.dataset.i;
      if (e.target.closest('[data-qty]')) Ventas.cambiarCantidad(); else Ventas.renderLines();
      Ventas.focus();
    };
    Ventas.renderAll();
  },

  focus() { const i = Ventas.el && Ventas.el.querySelector('[data-code]'); if (i) i.focus(); },
  onDataChange() { if (App.current === 'ventas') { Ventas.renderLines(); Ventas.renderCliente(); } },

  renderAll() { Ventas.renderTabs(); Ventas.renderLines(); Ventas.renderCliente(); Ventas.renderLast(); },

  renderTabs() {
    const box = Ventas.el.querySelector('[data-tabs]');
    Ventas.T;
    const tk = Store.tickets;
    box.innerHTML = Store.tickets.list.map((t, i) => `<button data-t="${i}" class="${i === tk.activo ? 'active' : ''}">${U.esc(t.nombre)}${t.items.length ? ` (${t.items.length})` : ''}</button>`).join('');
    box.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { Store.tickets.activo = +b.dataset.t; Ventas.sel = 0; Ventas.save(); Ventas.renderAll(); Ventas.focus(); });
  },

  renderLines() {
    const t = Ventas.T;
    t.items.forEach(l => Store.calcularLinea(l));
    Ventas.sel = Math.min(Math.max(Ventas.sel, 0), Math.max(t.items.length - 1, 0));
    const tbody = Ventas.el.querySelector('[data-lines]');
    tbody.innerHTML = t.items.map((l, i) => {
      const p = l.productoId ? Store.byId.get(l.productoId) : null;
      const ex = p && p.usaInventario ? U.qty(p.existencia) : (p && p.tipoVenta === 'P' ? 'Paquete' : '—');
      return `<tr data-i="${i}" class="clickable ${i === Ventas.sel ? 'sel' : ''}"><td>${U.esc(l.codigo || 'COMÚN')}</td><td class="desc">${U.esc(l.descripcion)} ${l.etiqueta ? `<span class="badge-mayoreo">${U.esc(l.etiqueta)}</span>` : ''}</td>
        <td class="num">${U.money(l.precio)}</td><td class="num" data-qty title="Clic para cambiar cantidad">${U.qty(l.cantidad)}</td><td class="num"><b>${U.money(l.importe)}</b></td><td class="num ${p && p.usaInventario && p.existencia - l.cantidad < 0 ? 'bad' : ''}">${ex}</td></tr>`;
    }).join('') || `<tr><td colspan="6" class="muted center" style="padding:40px">Escanee un producto o presione F10 para buscar</td></tr>`;
    const s = tbody.querySelector('tr.sel'); if (s) s.scrollIntoView({ block: 'nearest' });
    const total = U.sum(t.items, l => l.importe);
    const arts = U.sum(t.items, l => l.tipoVenta === 'G' ? 1 : U.num(l.cantidad));
    Ventas.el.querySelector('[data-total]').textContent = U.money(total);
    Ventas.el.querySelector('[data-items]').textContent = `${U.qty(arts)} artículo(s) en el ticket`;
    Ventas.renderTabs();
  },

  renderCliente() {
    const box = Ventas.el.querySelector('[data-cliente]');
    const c = Store.clientes.find(x => x.id === Ventas.T.clienteId);
    box.innerHTML = c
      ? `<b>Cliente:</b> ${U.esc(c.nombre)}<br><span class="muted">Saldo: ${U.money(c.saldo)} · Crédito: ${c.credito ? (c.limite > 0 ? U.money(c.limite) : 'sin límite') : 'no'}</span><br><button class="link" data-c="quitar">Quitar cliente</button>`
      : `<span class="muted">Venta a público en general</span><br><button class="link" data-c="asignar">Asignar cliente (Alt+C)</button>`;
    box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => b.dataset.c === 'quitar' ? Ventas.setCliente(null) : Ventas.asignarCliente());
  },

  renderLast() {
    const box = Ventas.el.querySelector('[data-last]');
    const v = Ventas.ultimaVenta;
    box.innerHTML = v ? `<b>Última venta #${v.id}</b><br>Total: ${U.money(v.total)}<br>Pagó con: ${U.money(v.pagoCon || v.total)}<br><span class="ok" style="font-size:20px;font-weight:800">Cambio: ${U.money(v.cambio)}</span>` : '<span class="muted">Aquí verá el cambio de la última venta.</span>';
  },

  selLine() { return Ventas.T.items[Ventas.sel]; },

  onKey(e) {
    const k = e.key;
    const code = Ventas.el.querySelector('[data-code]');
    const vacio = !code.value;
    if (k === 'F12') { Ventas.accion('cobrar'); return true; }
    if (k === 'F10') { Ventas.accion('buscar'); return true; }
    if (k === 'F11') { Ventas.accion('mayoreo'); return true; }
    if (k === 'F9') { Ventas.accion('verificador'); return true; }
    if (k === 'F7') { Ventas.accion('entrada'); return true; }
    if (k === 'F8') { Ventas.accion('salida'); return true; }
    if (k === 'F5') { Ventas.accion('cambiar'); return true; }
    if (k === 'F6') { Ventas.accion('pendiente'); return true; }
    if (k === 'Insert') { Ventas.accion('varios'); return true; }
    if (k === 'Delete' && (vacio || document.activeElement !== code)) { Ventas.accion('borrar'); return true; }
    if (e.ctrlKey && (k === 'p' || k === 'P')) { Ventas.accion('comun'); return true; }
    if (e.altKey) {
      const map = { d: 'descuento', p: 'precio', e: 'eliminarTicket', r: 'reimprimir', v: 'ventasDia', n: 'notas', c: 'cliente' };
      const a = map[k.toLowerCase()];
      if (a) { Ventas.accion(a); return true; }
    }
    if (k === 'ArrowDown') { Ventas.sel++; Ventas.renderLines(); return true; }
    if (k === 'ArrowUp') { Ventas.sel--; Ventas.renderLines(); return true; }
    if (vacio && (k === '+' || k === '-') && document.activeElement === code) { Ventas.sumarCantidad(k === '+' ? 1 : -1); return true; }
    if (!UI.top() && document.activeElement === document.body && k.length === 1 && !e.ctrlKey && !e.altKey) { code.focus(); }
    return false;
  },

  async accion(a) {
    const t = Ventas.T;
    switch (a) {
      case 'cobrar': return Ventas.cobrar();
      case 'buscar': { const p = await UI.buscarProducto(); if (p) await Ventas.agregarProducto(p); break; }
      case 'varios': return Ventas.varios();
      case 'comun': return Ventas.articuloComun();
      case 'mayoreo': return Ventas.mayoreo();
      case 'entrada': return Ventas.entradaSalida('entrada');
      case 'salida': return Ventas.entradaSalida('salida');
      case 'borrar': {
        if (!t.items.length) return;
        t.items.splice(Ventas.sel, 1);
        Ventas.save(); Ventas.renderLines(); break;
      }
      case 'verificador': return Ventas.verificador();
      case 'descuento': return Ventas.descuento();
      case 'precio': return Ventas.cambiarPrecio();
      case 'cambiar': {
        Store.tickets.activo = (Store.tickets.activo + 1) % Store.tickets.list.length;
        Ventas.sel = 0; Ventas.save(); Ventas.renderAll(); break;
      }
      case 'pendiente': {
        Store.tickets.n = (Store.tickets.n || Store.tickets.list.length) + 1;
        Store.tickets.list.push(Ventas.nuevoTicket(Store.tickets.n));
        Store.tickets.activo = Store.tickets.list.length - 1;
        Ventas.sel = 0; Ventas.save(); Ventas.renderAll();
        UI.toast('Ticket anterior guardado como pendiente');
        break;
      }
      case 'eliminarTicket': {
        if (t.items.length && !await UI.confirm('¿Eliminar todos los artículos de este ticket?', { danger: true, ok: 'Eliminar' })) break;
        Ventas.cerrarTicketActivo(); break;
      }
      case 'reimprimir': {
        const v = Ventas.ultimaVenta || (await Ventas.ventasDelDia(U.today())).pop();
        if (!v) { UI.toast('No hay ventas para reimprimir'); break; }
        Print.ticket(v, { reimpresion: true }); break;
      }
      case 'ventasDia': return Ventas.ventasDia();
      case 'notas': { const n = await UI.prompt('Notas del ticket', 'Se imprimen al final del ticket', t.notas || ''); if (n !== null) { t.notas = n; Ventas.save(); } break; }
      case 'cliente': return Ventas.asignarCliente();
    }
    Ventas.focus();
  },

  cerrarTicketActivo() {
    const tk = Store.tickets;
    if (tk.list.length > 1) { tk.list.splice(tk.activo, 1); tk.activo = Math.max(0, tk.activo - 1); }
    else { tk.list = [Ventas.nuevoTicket(1)]; tk.activo = 0; tk.n = 1; }
    Ventas.sel = 0; Ventas.save(); Ventas.renderAll();
  },

  /* ---------- Agregar productos ---------- */
  async agregarCodigo() {
    const input = Ventas.el.querySelector('[data-code]');
    let txt = input.value.trim();
    input.value = '';
    if (!txt) return;
    let cant = null;
    const m = txt.match(/^(\d+(?:[.,]\d+)?)\s*\*\s*(.+)$/);
    if (m) { cant = U.num(m[1]); txt = m[2].trim(); }
    if (txt === '0') return Ventas.articuloComun();
    const p = Store.findProducto(txt);
    if (p) return Ventas.agregarProducto(p, cant);
    UI.toast(`No se encontró el código "${txt}"`, 'bad');
    const r = await UI.buscarProducto(txt);
    if (r) await Ventas.agregarProducto(r, cant);
    Ventas.focus();
  },

  async agregarProducto(p, cant = null) {
    const t = Ventas.T;
    if (p.tipoVenta === 'G' && cant == null) {
      cant = await Ventas.pedirGranel(p);
      if (cant == null) return Ventas.focus();
    }
    cant = cant == null ? 1 : cant;
    if (!(cant > 0)) return;
    if (!Store.config.venderSinExistencia && p.usaInventario) {
      const enTicket = U.sum(t.items.filter(l => l.productoId === p.id), l => U.num(l.cantidad));
      if (p.existencia - enTicket - cant < -0.0001) { UI.toast(`No hay suficiente existencia de "${p.descripcion}" (${U.qty(p.existencia)})`, 'bad'); return; }
    }
    const existente = p.tipoVenta !== 'G' && t.items.findIndex(l => l.productoId === p.id && l.precioManual == null && !l.descuentoPct);
    if (existente !== false && existente > -1) {
      t.items[existente].cantidad = U.round3(U.num(t.items[existente].cantidad) + cant);
      Ventas.sel = existente;
    } else {
      t.items.push({ uid: Date.now() + Math.random(), productoId: p.id, codigo: p.codigo, descripcion: p.descripcion, cantidad: cant, precioNormal: p.precio, tipoVenta: p.tipoVenta, mayoreo: false, precioManual: null, descuentoPct: 0 });
      Ventas.sel = t.items.length - 1;
    }
    if (p.usaInventario && p.existencia - cant < 0) App.status(`Atención: "${p.descripcion}" queda con existencia negativa`);
    else App.status('');
    Ventas.save();
    Ventas.renderLines();
    Ventas.focus();
  },

  pedirGranel(p) {
    const m = UI.modal({
      title: 'Producto a granel',
      body: `<p><b>${U.esc(p.descripcion)}</b><br><span class="muted">Precio: ${U.money(p.precio)} por unidad de medida</span></p>
        <div class="grid2"><label>Cantidad (kg / lt / m)<input data-c type="number" step="any" class="cobro-input" autofocus></label>
        <label>Importe ($)<input data-i type="number" step="any" class="cobro-input"></label></div>
        <p class="muted small">Escriba la cantidad o el importe a vender; el otro se calcula solo.</p>`,
      footer: `<button class="secondary" data-no>Cancelar</button><button class="primary" data-ok>Aceptar</button>`,
    });
    const c = m.q('[data-c]'), i = m.q('[data-i]');
    c.oninput = () => { i.value = c.value ? U.round2(U.num(c.value) * p.precio) : ''; };
    i.oninput = () => { c.value = i.value && p.precio ? U.round3(U.num(i.value) / p.precio) : ''; };
    const ok = () => { const q = U.round3(U.num(c.value)); if (q > 0) m.close(q); };
    m.q('[data-ok]').onclick = ok;
    m.q('[data-no]').onclick = () => m.close(null);
    m.onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } };
    return m.done;
  },

  async varios() {
    const l = Ventas.selLine();
    const r = await UI.form('Varios', [
      { name: 'cantidad', label: 'Cantidad', type: 'number', step: 'any', value: l ? l.cantidad : 1, autofocus: true, cls: 'cobro-input' },
      { name: 'codigo', label: 'Código del producto (déjelo vacío para cambiar la cantidad del artículo seleccionado)' },
    ]);
    if (!r) return Ventas.focus();
    const q = U.num(r.cantidad);
    if (!(q > 0)) return UI.toast('Cantidad inválida', 'bad');
    if (r.codigo.trim()) {
      const p = Store.findProducto(r.codigo) || await UI.buscarProducto(r.codigo);
      if (p) await Ventas.agregarProducto(p, q);
    } else if (l) { l.cantidad = U.round3(q); Ventas.save(); Ventas.renderLines(); }
    Ventas.focus();
  },

  async cambiarCantidad() {
    const l = Ventas.selLine(); if (!l) return;
    const v = await UI.prompt('Cambiar cantidad', l.descripcion, l.cantidad, 'number');
    if (v === null) return Ventas.focus();
    const q = U.round3(U.num(v));
    if (q > 0) { l.cantidad = q; Ventas.save(); Ventas.renderLines(); }
    Ventas.focus();
  },
  sumarCantidad(d) {
    const l = Ventas.selLine(); if (!l) return;
    const q = U.round3(U.num(l.cantidad) + d);
    if (q <= 0) { Ventas.T.items.splice(Ventas.sel, 1); } else l.cantidad = q;
    Ventas.save(); Ventas.renderLines();
  },

  async articuloComun() {
    const r = await UI.form('Artículo común (producto no registrado)', [
      { name: 'descripcion', label: 'Descripción', value: 'Artículo común', autofocus: true },
      { name: 'cantidad', label: 'Cantidad', type: 'number', step: 'any', value: 1 },
      { name: 'precio', label: 'Precio unitario', type: 'number', step: 'any', required: true },
      { name: 'departamento', label: 'Departamento (opcional)', type: 'select', value: '', options: [{ value: '', label: '— Ninguno —' }, ...Store.departamentos.map(d => ({ value: d.nombre, label: d.nombre }))] },
    ], { note: 'Úselo sólo para productos de poco valor. Se reporta con 100% de ganancia porque no tiene costo.' });
    if (!r) return Ventas.focus();
    const precio = U.round2(U.num(r.precio)), q = U.round3(U.num(r.cantidad, 1));
    if (!(precio >= 0) || !(q > 0)) return UI.toast('Datos inválidos', 'bad');
    Ventas.T.items.push({ uid: Date.now() + Math.random(), productoId: null, codigo: '', descripcion: r.descripcion || 'Artículo común', cantidad: q, precioNormal: precio, tipoVenta: 'U', departamento: r.departamento, precioManual: null, descuentoPct: 0 });
    Ventas.sel = Ventas.T.items.length - 1;
    Ventas.save(); Ventas.renderLines(); Ventas.focus();
  },

  async mayoreo() {
    const l = Ventas.selLine(); if (!l) return;
    const p = l.productoId && Store.byId.get(l.productoId);
    if (!p || !(p.mayoreo > 0)) return UI.toast('Este producto no tiene precio de mayoreo', 'bad');
    if (!await UI.autorizar('descuentos', 'aplicar precio de mayoreo')) return Ventas.focus();
    l.mayoreo = !l.mayoreo;
    Ventas.save(); Ventas.renderLines();
    UI.toast(l.mayoreo ? 'Precio de mayoreo aplicado' : 'Precio de mayoreo quitado');
    Ventas.focus();
  },

  async descuento() {
    const l = Ventas.selLine(); if (!l) return;
    if (!await UI.autorizar('descuentos', 'aplicar descuentos')) return Ventas.focus();
    const r = await UI.form('Descuento al artículo', [
      { name: 'pct', label: 'Porcentaje de descuento (%)', type: 'number', step: 'any', value: l.descuentoPct || '', autofocus: true },
    ], { note: `${U.esc(l.descripcion)} — importe actual ${U.money(l.importe)}. Escriba 0 para quitar el descuento.` });
    if (r) {
      const pct = U.num(r.pct);
      if (pct < 0 || pct > 100) UI.toast('Porcentaje inválido', 'bad');
      else { l.descuentoPct = pct; Ventas.save(); Ventas.renderLines(); }
    }
    Ventas.focus();
  },

  async cambiarPrecio() {
    const l = Ventas.selLine(); if (!l) return;
    if (!await UI.autorizar('descuentos', 'cambiar precios en la venta')) return Ventas.focus();
    const v = await UI.prompt('Cambiar precio', `Nuevo precio unitario para "${l.descripcion}" (vacío = precio normal)`, l.precioManual ?? '', 'number');
    if (v !== null) {
      l.precioManual = v === '' ? null : U.round2(U.num(v));
      Ventas.save(); Ventas.renderLines();
    }
    Ventas.focus();
  },

  async asignarCliente() {
    const c = await UI.buscarCliente();
    if (c) Ventas.setCliente(c.id);
    Ventas.focus();
  },
  setCliente(id) { Ventas.T.clienteId = id; Ventas.save(); Ventas.renderCliente(); Ventas.focus(); },

  async verificador() {
    const m = UI.modal({
      title: 'Verificador de precios', size: 'wide',
      body: `<form data-f><label>Escanee o escriba el código<input data-c autofocus class="cobro-input" style="text-align:left"></label></form><div data-r style="min-height:140px;text-align:center"></div>`,
    });
    const r = m.q('[data-r]'), c = m.q('[data-c]');
    m.q('[data-f]').onsubmit = async (e) => {
      e.preventDefault();
      let p = Store.findProducto(c.value);
      if (!p && c.value.trim()) p = await UI.buscarProducto(c.value);
      c.value = '';
      if (!p) { r.innerHTML = '<p class="bad">Producto no encontrado</p>'; c.focus(); return; }
      const promos = Store.promocionesDe(p.id);
      r.innerHTML = `<h2>${U.esc(p.descripcion)}</h2><div style="font-size:54px;font-weight:800;color:var(--ok)">${U.money(p.precio)}</div>
        ${p.mayoreo ? `<div>Mayoreo: <b>${U.money(p.mayoreo)}</b>${p.mayoreoDesde ? ` desde ${U.qty(p.mayoreoDesde)} unidades` : ''}</div>` : ''}
        ${promos.map(x => `<div class="tag warn">${U.esc(x.nombre || (x.tipo === 'nx' ? `${x.cantidad} por ${U.money(x.valor)}` : `-${x.valor}%`))}</div>`).join(' ')}
        <div class="muted">Código ${U.esc(p.codigo)} · ${p.usaInventario ? 'Existencia: ' + U.qty(p.existencia) : 'Sin control de inventario'}</div>`;
      c.focus();
    };
    await m.done;
    Ventas.focus();
  },

  async entradaSalida(tipo) {
    if (!await UI.autorizar('entradasSalidas', `registrar ${tipo}s de efectivo`)) return Ventas.focus();
    const r = await UI.form(tipo === 'entrada' ? 'Entrada de efectivo' : 'Salida de efectivo', [
      { name: 'monto', label: 'Cantidad', type: 'number', step: 'any', autofocus: true, required: true, cls: 'cobro-input' },
      { name: 'descripcion', label: tipo === 'entrada' ? 'Descripción (ej. cambio, préstamo)' : 'Motivo (ej. pago a proveedor, gastos)' },
    ], { ok: tipo === 'entrada' ? 'Registrar entrada' : 'Registrar salida' });
    if (r) {
      const monto = U.round2(U.num(r.monto));
      if (!(monto > 0)) UI.toast('Cantidad inválida', 'bad');
      else {
        await Store.movimientoCaja(tipo, monto, r.descripcion);
        App.tick();
        UI.toast(`${tipo === 'entrada' ? 'Entrada' : 'Salida'} de ${U.money(monto)} registrada`, 'ok');
      }
    }
    Ventas.focus();
  },

  /* ---------- Cobro ---------- */
  async cobrar() {
    const t = Ventas.T;
    if (!t.items.length) return UI.toast('No hay artículos en el ticket');
    t.items.forEach(l => Store.calcularLinea(l));
    const total = U.round2(U.sum(t.items, l => l.importe));
    const cliente = Store.clientes.find(c => c.id === t.clienteId);
    const comision = U.num(Store.config.comisionTarjeta);
    const m = UI.modal({
      title: 'Cobrar', size: 'wide',
      body: `<div class="cobro-total">${U.money(total)}</div>
        <div class="tabs" data-tabs>
          <button data-m="efectivo" class="active"><kbd>F5</kbd>Efectivo</button>
          <button data-m="tarjeta"><kbd>F6</kbd>Tarjeta</button>
          <button data-m="mixto"><kbd>F7</kbd>Mixto</button>
          <button data-m="credito"><kbd>F8</kbd>Crédito</button>
          <button data-m="vales"><kbd>F9</kbd>Vales</button>
        </div>
        <div data-p="efectivo"><label>Pagó con<input data-pago type="number" step="any" class="cobro-input" value="${total}"></label></div>
        <div data-p="tarjeta" class="hidden"><p>Se cobrará <b>${U.money(total)}</b> con tarjeta. Realice el cargo en su terminal bancaria.${comision ? ` Comisión estimada (${comision}%): ${U.money(total * comision / 100)}` : ''}</p><label>Referencia / autorización (opcional)<input data-ref1></label></div>
        <div data-p="vales" class="hidden"><p>Se cobrará <b>${U.money(total)}</b> con vales de despensa.</p><label>Folio / referencia de los vales (opcional)<input data-ref3></label></div>
        <div data-p="mixto" class="hidden"><div class="grid3"><label>Con tarjeta<input data-mt type="number" step="any" class="cobro-input" value="0"></label><label>Con vales<input data-mv type="number" step="any" class="cobro-input" value="0"></label><label>Efectivo recibido<input data-me type="number" step="any" class="cobro-input" value="${total}"></label></div><p class="muted small" data-mixinfo></p><label>Referencia (opcional)<input data-ref2></label></div>
        <div data-p="credito" class="hidden"><div data-cli></div><label>Anticipo en efectivo (opcional)<input data-ant type="number" step="any" class="cobro-input" value="0"></label></div>
        <div class="cobro-cambio" data-cambio></div>
        <p class="error" data-err></p>`,
      footer: `<button class="secondary" data-no>Cancelar (Esc)</button><button class="secondary" data-f2><kbd>F2</kbd>Cobrar sin imprimir</button><button class="primary big" data-f1><kbd>F1</kbd>Cobrar e imprimir</button>`,
    });
    let modo = 'efectivo';
    let clienteId = t.clienteId;
    const q = (s) => m.q(s);
    const calc = () => {
      const err = q('[data-err]'); err.textContent = '';
      let pago;
      if (modo === 'efectivo') {
        const con = U.num(q('[data-pago]').value);
        pago = { efectivo: total, tarjeta: 0, credito: 0, pagoCon: con, cambio: U.round2(con - total) };
        if (con + 0.005 < total) pago.error = 'La cantidad recibida es menor al total.';
      } else if (modo === 'tarjeta') {
        pago = { efectivo: 0, tarjeta: total, credito: 0, cambio: 0, referencia: q('[data-ref1]').value };
      } else if (modo === 'vales') {
        pago = { efectivo: 0, tarjeta: 0, vales: total, credito: 0, cambio: 0, referencia: q('[data-ref3]').value };
      } else if (modo === 'mixto') {
        const tj = U.round2(U.num(q('[data-mt]').value)), va = U.round2(U.num(q('[data-mv]').value)), rec = U.num(q('[data-me]').value);
        const ef = U.round2(total - tj - va);
        q('[data-mixinfo]').textContent = `Efectivo a cobrar: ${U.money(Math.max(ef, 0))}`;
        pago = { efectivo: ef, tarjeta: tj, vales: va, credito: 0, pagoCon: rec, cambio: U.round2(rec - ef), referencia: q('[data-ref2]').value };
        if (tj < 0 || va < 0 || ef < 0) pago.error = 'La suma de tarjeta y vales no puede ser mayor al total.';
        else if (rec + 0.005 < ef) pago.error = `Falta efectivo: debe recibir al menos ${U.money(ef)}.`;
        if (!pago.error && ef === 0) pago.cambio = 0;
      } else {
        const ant = U.round2(U.num(q('[data-ant]').value));
        pago = { efectivo: ant, tarjeta: 0, credito: U.round2(total - ant), pagoCon: ant, cambio: 0, clienteId };
        const c = Store.clientes.find(x => x.id === clienteId);
        if (!c) pago.error = 'Seleccione el cliente.';
        else if (!c.credito) pago.error = 'Este cliente no tiene crédito autorizado. Actívelo en F2 Clientes.';
        else if (ant < 0 || ant >= total) pago.error = 'El anticipo debe ser menor al total.';
        else if (c.limite > 0 && c.saldo + pago.credito > c.limite + 0.005) pago.error = `Excede el límite de crédito. Disponible: ${U.money(c.limite - c.saldo)}.`;
      }
      q('[data-cambio]').textContent = pago.cambio > 0 ? `Su cambio: ${U.money(pago.cambio)}` : '';
      if (pago.error) err.textContent = pago.error;
      return pago;
    };
    const renderCli = () => {
      const c = Store.clientes.find(x => x.id === clienteId);
      q('[data-cli]').innerHTML = c ? `<p><b>${U.esc(c.nombre)}</b><br>Saldo actual: ${U.money(c.saldo)} · Límite: ${c.credito ? (c.limite > 0 ? U.money(c.limite) : 'sin límite') : 'sin crédito'}<br>Saldo después de la venta: <b>${U.money(c.saldo + total - U.num(q('[data-ant]').value))}</b></p><button class="link" data-sel>Cambiar cliente</button>`
        : `<p class="warn">Debe seleccionar un cliente con crédito.</p><button class="secondary" data-sel>Seleccionar cliente</button>`;
      q('[data-sel]').onclick = async () => { const c2 = await UI.buscarCliente(); if (c2) { clienteId = c2.id; renderCli(); calc(); } };
    };
    const setModo = async (md) => {
      if (md === 'credito' && !await UI.autorizar('creditos', 'vender a crédito')) return;
      modo = md;
      m.qa('[data-m]').forEach(b => b.classList.toggle('active', b.dataset.m === md));
      m.qa('[data-p]').forEach(d => d.classList.toggle('hidden', d.dataset.p !== md));
      if (md === 'credito') { renderCli(); if (!clienteId) q('[data-sel]').click(); }
      calc();
      const f = m.q(`[data-p="${md}"] input`); if (f) { f.focus(); f.select(); }
    };
    m.qa('[data-m]').forEach(b => b.onclick = () => setModo(b.dataset.m));
    m.qa('input').forEach(i => i.oninput = () => { calc(); if (modo === 'credito') renderCli(); });
    const pagar = async (imprimir) => {
      const pago = calc();
      if (pago.error) return;
      m.qa('footer button').forEach(b => b.disabled = true);
      try {
        const venta = await Store.registrarVenta({ ...t, clienteId: modo === 'credito' ? clienteId : t.clienteId }, pago);
        m.close(true);
        Ventas.ultimaVenta = venta;
        Ventas.cerrarTicketActivo();
        App.tick();
        if (imprimir) Print.ticket(venta);
        UI.toast(`Venta #${venta.id} registrada${venta.cambio > 0 ? ` — Cambio: ${U.money(venta.cambio)}` : ''}`, 'ok');
      } catch (e) {
        q('[data-err]').textContent = e.message;
        m.qa('footer button').forEach(b => b.disabled = false);
      }
    };
    q('[data-f1]').onclick = () => pagar(true);
    q('[data-f2]').onclick = () => pagar(false);
    q('[data-no]').onclick = () => m.close(null);
    m.onKey = (e) => {
      if (e.key === 'F1' || (e.key === 'Enter' && !e.target.closest('button'))) { e.preventDefault(); pagar(Store.config.ticket.imprimirAuto || e.key === 'F1'); }
      else if (e.key === 'F2') { e.preventDefault(); pagar(false); }
      else if (e.key === 'F5') setModo('efectivo');
      else if (e.key === 'F6') setModo('tarjeta');
      else if (e.key === 'F7') setModo('mixto');
      else if (e.key === 'F8') setModo('credito');
      else if (e.key === 'F9') setModo('vales');
    };
    { const i = q('[data-pago]'); i.focus(); i.select(); }
    calc();
    await m.done;
    Ventas.focus();
  },

  /* ---------- Ventas del día y devoluciones ---------- */
  async ventasDelDia(key) { return (await Store.ventasDe(U.startOfDay(key), U.endOfDay(key))).sort((a, b) => a.ts - b.ts); },

  async ventasDia() {
    const m = UI.modal({
      title: 'Ventas del día y devoluciones', size: 'xwide',
      body: `<div class="row"><label style="max-width:180px">Fecha<input type="date" data-d value="${U.today()}"></label><label style="max-width:160px">Folio<input data-folio placeholder="Buscar folio"></label><label style="max-width:220px">Cajero<select data-u><option value="">Todos</option>${Store.usuarios.map(u => `<option>${U.esc(u.nombre)}</option>`).join('')}</select></label></div>
      <div class="grid2" style="align-items:start"><div class="table-wrap" style="max-height:55vh"><table class="grid"><thead><tr><th>Folio</th><th>Hora</th><th>Cajero</th><th>Cliente</th><th class="num">Total</th><th>Estado</th></tr></thead><tbody data-list></tbody></table></div>
      <div data-det class="panel"><p class="muted">Seleccione una venta para ver su detalle.</p></div></div>`,
    });
    let ventas = [], selId = null;
    const load = async () => {
      const folio = parseInt(m.q('[data-folio]').value, 10);
      if (folio) { const v = await DB.get('ventas', folio); ventas = v ? [v] : []; }
      else ventas = await Ventas.ventasDelDia(m.q('[data-d]').value || U.today());
      const u = m.q('[data-u]').value;
      if (u) ventas = ventas.filter(v => v.usuario === u);
      m.q('[data-list]').innerHTML = ventas.map(v => `<tr class="clickable ${v.id === selId ? 'sel' : ''}" data-id="${v.id}"><td>${v.id}</td><td>${U.fmtTime(v.ts)}</td><td>${U.esc(v.usuario)}</td><td>${U.esc(v.clienteNombre || '')}</td><td class="num">${U.money(v.total)}</td><td>${Ventas.estadoTag(v)}</td></tr>`).join('') || `<tr><td colspan="6" class="muted center">Sin ventas</td></tr>`;
      if (selId) detalle(ventas.find(v => v.id === selId));
    };
    const detalle = (v) => {
      const box = m.q('[data-det]');
      if (!v) { box.innerHTML = '<p class="muted">Seleccione una venta.</p>'; return; }
      const formas = [v.pagos.efectivo && `Efectivo ${U.money(v.pagos.efectivo)}`, v.pagos.tarjeta && `Tarjeta ${U.money(v.pagos.tarjeta)}`, v.pagos.vales && `Vales ${U.money(v.pagos.vales)}`, v.pagos.credito && `Crédito ${U.money(v.pagos.credito)}`].filter(Boolean).join(' · ');
      box.innerHTML = `<h3>Venta #${v.id} ${Ventas.estadoTag(v)}</h3><p class="muted">${U.fmtDateTime(v.ts)} · ${U.esc(v.usuario)}${v.clienteNombre ? ' · ' + U.esc(v.clienteNombre) : ''}<br>${formas}</p>
        <table class="grid"><thead><tr><th>Descripción</th><th class="num">Cant.</th><th class="num">Importe</th><th class="num">Devuelto</th></tr></thead><tbody>${v.items.map(l => `<tr><td>${U.esc(l.descripcion)}</td><td class="num">${U.qty(l.cantidad)}</td><td class="num">${U.money(l.importe)}</td><td class="num">${l.devuelto ? U.qty(l.devuelto) : ''}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2">Total</td><td class="num">${U.money(v.total)}</td><td></td></tr></tfoot></table>
        ${v.devoluciones.length ? `<p class="small">${v.devoluciones.map(d => `${U.fmtDateTime(d.ts)}: devolución ${U.money(d.monto)} (${U.esc(d.usuario)})${d.motivo ? ' - ' + U.esc(d.motivo) : ''}`).join('<br>')}</p>` : ''}
        <div class="toolbar" style="margin-top:10px"><button class="secondary" data-x="print">Reimprimir</button>${v.estado === 'ok' ? `<button class="secondary" data-x="dev">Devolver artículos</button><button class="danger" data-x="cancel">Cancelar venta</button>` : ''}</div>`;
      box.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => {
        if (b.dataset.x === 'print') return Print.ticket(v, { reimpresion: true });
        if (!await UI.autorizar('cancelar', 'hacer devoluciones o cancelar ventas')) return;
        if (b.dataset.x === 'cancel') {
          if (!await UI.confirm(`¿Cancelar la venta #${v.id} por ${U.money(v.total)}? Los productos regresan al inventario.`, { danger: true, ok: 'Cancelar venta' })) return;
          const motivo = await UI.prompt('Motivo', 'Motivo de la cancelación (opcional)', '') ?? '';
          try {
            const r = await Store.devolver(v.id, v.items.map((l, idx) => ({ idx, cantidad: l.cantidad - l.devuelto })), motivo, true);
            UI.toast(`Venta cancelada. Regrese ${U.money(r.dev.efectivo)} en efectivo${r.dev.credito ? ` y se descontaron ${U.money(r.dev.credito)} del crédito` : ''}`, 'ok');
          } catch (e) { UI.toast(e.message, 'bad'); }
        } else {
          const r = await Ventas.dialogoDevolucion(v);
          if (r) UI.toast(`Devolución registrada: regrese ${U.money(r.dev.efectivo)} en efectivo${r.dev.credito ? `; ${U.money(r.dev.credito)} descontados del crédito` : ''}`, 'ok');
        }
        App.tick();
        await load();
      });
    };
    m.q('[data-list]').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; selId = +tr.dataset.id; m.qa('[data-list] tr').forEach(x => x.classList.toggle('sel', x === tr)); detalle(ventas.find(v => v.id === selId)); };
    m.q('[data-d]').onchange = load; m.q('[data-u]').onchange = load; m.q('[data-folio]').oninput = U.debounce(load, 300);
    await load();
    await m.done;
    Ventas.focus();
  },
  estadoTag(v) {
    if (v.estado === 'cancelada') return '<span class="tag bad">Cancelada</span>';
    if (v.estado === 'devuelta') return '<span class="tag warn">Devuelta</span>';
    if (v.devoluciones && v.devoluciones.length) return '<span class="tag warn">Dev. parcial</span>';
    if (v.creditoPendiente > 0.005) return '<span class="tag">Crédito</span>';
    return '<span class="tag ok">Pagada</span>';
  },

  dialogoDevolucion(v) {
    const m = UI.modal({
      title: `Devolver artículos de la venta #${v.id}`, size: 'wide',
      body: `<table class="grid"><thead><tr><th>Descripción</th><th class="num">Vendido</th><th class="num">Ya devuelto</th><th class="num">Precio</th><th>Devolver</th></tr></thead><tbody>${v.items.map((l, i) => {
        const disp = U.round3(l.cantidad - l.devuelto);
        return `<tr><td>${U.esc(l.descripcion)}</td><td class="num">${U.qty(l.cantidad)}</td><td class="num">${U.qty(l.devuelto)}</td><td class="num">${U.money(l.precio)}</td><td><input type="number" step="any" min="0" max="${disp}" data-i="${i}" value="0" ${disp <= 0 ? 'disabled' : ''} style="width:90px"></td></tr>`;
      }).join('')}</tbody></table>
      <label>Motivo<input data-mot></label><p><b>Total a devolver: <span data-tot>$0.00</span></b></p><p class="error" data-err></p>`,
      footer: `<button class="secondary" data-no>Cancelar</button><button class="primary" data-ok>Registrar devolución</button>`,
    });
    const lines = () => Array.from(m.qa('[data-i]')).map(i => ({ idx: +i.dataset.i, cantidad: Math.min(U.num(i.value), U.num(i.max)) })).filter(x => x.cantidad > 0);
    m.qa('[data-i]').forEach(i => i.oninput = () => { m.q('[data-tot]').textContent = U.money(U.sum(lines(), x => v.items[x.idx].importe * x.cantidad / v.items[x.idx].cantidad)); });
    m.q('[data-no]').onclick = () => m.close(null);
    m.q('[data-ok]').onclick = async () => {
      const l = lines();
      if (!l.length) { m.q('[data-err]').textContent = 'Indique la cantidad a devolver.'; return; }
      try { m.close(await Store.devolver(v.id, l, m.q('[data-mot]').value, false)); }
      catch (e) { m.q('[data-err]').textContent = e.message; }
    };
    return m.done;
  },
};
