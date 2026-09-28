/* Reportes: ventas y ganancias por día, cajero, caja, departamento, forma de pago; productos más vendidos; listado de tickets */
'use strict';

const Reportes = {
  el: null,
  from: null,
  to: null,

  render(el) {
    Reportes.el = el;
    Reportes.from = Reportes.from || U.firstOfMonth();
    Reportes.to = Reportes.to || U.today();
    el.innerHTML = `<div class="panel"><div class="toolbar"><h2 style="margin:0 12px 0 0">Reportes</h2>
      <button class="secondary" data-p="hoy">Hoy</button><button class="secondary" data-p="ayer">Ayer</button><button class="secondary" data-p="semana">Últimos 7 días</button><button class="secondary" data-p="mes">Este mes</button><button class="secondary" data-p="mesant">Mes anterior</button></div>
      <div class="row">${UI.rangoFechas('r', Reportes.from, Reportes.to)}<label style="max-width:220px">Agrupar por<select data-g><option value="dia">Día</option><option value="cajero">Cajero</option><option value="caja">Caja</option><option value="departamento">Departamento</option><option value="forma">Forma de pago</option><option value="hora">Hora del día</option><option value="productos">Productos más vendidos</option><option value="tickets">Listado de tickets</option></select></label><button class="primary" data-go>Consultar</button><button class="secondary" data-x>Exportar a Excel</button><button class="secondary" data-pr>Imprimir</button></div></div>
      <div data-res></div>`;
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
      const hoy = U.today(), d = new Date();
      const r = { hoy: [hoy, hoy], ayer: [U.addDays(hoy, -1), U.addDays(hoy, -1)], semana: [U.addDays(hoy, -6), hoy], mes: [U.firstOfMonth(), hoy] }[b.dataset.p]
        || [U.dateKey(new Date(d.getFullYear(), d.getMonth() - 1, 1)), U.dateKey(new Date(d.getFullYear(), d.getMonth(), 0))];
      el.querySelector('[data-r-from]').value = r[0]; el.querySelector('[data-r-to]').value = r[1];
      Reportes.go();
    });
    el.querySelector('[data-go]').onclick = Reportes.go;
    el.querySelector('[data-g]').onchange = Reportes.go;
    el.querySelector('[data-x]').onclick = () => Reportes.exportRows && U.exportXlsx(`reporte-${el.querySelector('[data-g]').value}.xlsx`, Reportes.exportRows, 'Reporte');
    el.querySelector('[data-pr]').onclick = () => { const t = el.querySelector('[data-t]'); if (t) Print.reporte('Reporte de ventas', el.querySelector('.stats').outerHTML + t.outerHTML, `${el.querySelector('[data-r-from]').value} a ${el.querySelector('[data-r-to]').value}`); };
    Reportes.go();
  },
  focus() {},

  async go() {
    const el = Reportes.el;
    Reportes.from = el.querySelector('[data-r-from]').value; Reportes.to = el.querySelector('[data-r-to]').value;
    const from = U.startOfDay(Reportes.from), to = U.endOfDay(Reportes.to);
    const g = el.querySelector('[data-g]').value;
    const res = el.querySelector('[data-res]');
    res.innerHTML = '<p class="muted">Calculando…</p>';
    const [ventas, movs] = await Promise.all([Store.ventasDe(from, to), DB.range('movcaja', 'ts', from, to)]);
    const r = Store.resumen(ventas, movs, 0);
    const stats = `<div class="stats"><div class="stat"><div class="k">Ventas netas</div><div class="v">${U.money(r.ventasNetas)}</div></div><div class="stat"><div class="k">Ganancia</div><div class="v ok">${U.money(r.ganancia)}</div></div><div class="stat"><div class="k">Número de ventas</div><div class="v">${r.numVentas}</div></div><div class="stat"><div class="k">Ticket promedio</div><div class="v">${U.money(r.numVentas ? r.ventasTotal / r.numVentas : 0)}</div></div><div class="stat"><div class="k">Devoluciones</div><div class="v bad">${U.money(r.devolucionesTotal)}</div></div><div class="stat"><div class="k">Margen</div><div class="v">${r.ventasNetas ? U.pct(r.ganancia / r.ventasNetas * 100) : '0%'}</div></div></div>`;

    let cols, rows;
    const netoLinea = (l) => ({ imp: l.importe * (l.cantidad - l.devuelto) / l.cantidad, cost: l.costo * (l.cantidad - l.devuelto), q: l.cantidad - l.devuelto });
    const agrupar = (keyFn) => {
      const m = new Map();
      for (const v of ventas) {
        const k = keyFn(v);
        const x = m.get(k) || { clave: k, ventas: 0, total: 0, ganancia: 0 };
        x.ventas++;
        for (const l of v.items) { const n = netoLinea(l); x.total += n.imp; x.ganancia += n.imp - n.cost; }
        m.set(k, x);
      }
      return [...m.values()];
    };
    if (g === 'dia') {
      rows = agrupar(v => U.dateKey(v.ts)).sort((a, b) => a.clave.localeCompare(b.clave)).map(x => ({ ...x, etiqueta: U.fmtDate(U.startOfDay(x.clave)) }));
    } else if (g === 'cajero') rows = agrupar(v => v.usuario).sort((a, b) => b.total - a.total).map(x => ({ ...x, etiqueta: x.clave }));
    else if (g === 'caja') rows = agrupar(v => v.caja || 'Caja 1').sort((a, b) => b.total - a.total).map(x => ({ ...x, etiqueta: x.clave }));
    else if (g === 'hora') rows = agrupar(v => U.pad(new Date(v.ts).getHours())).sort((a, b) => a.clave.localeCompare(b.clave)).map(x => ({ ...x, etiqueta: `${x.clave}:00 - ${x.clave}:59` }));
    else if (g === 'forma') {
      rows = [['Efectivo', r.ventasEfectivo], ['Tarjeta', r.ventasTarjeta], ['Vales', r.ventasVales], ['Crédito', r.ventasCredito]].map(([k, v]) => ({ etiqueta: k, total: v, ventas: ventas.filter(x => x.pagos[{ Efectivo: 'efectivo', Tarjeta: 'tarjeta', Vales: 'vales', Crédito: 'credito' }[k]] > 0).length, ganancia: null }));
    } else if (g === 'departamento') {
      rows = Object.entries(r.departamentos).map(([k, d]) => ({ etiqueta: k, total: d.ventas, ganancia: d.ganancia, ventas: null })).sort((a, b) => b.total - a.total);
    }

    if (g === 'productos') {
      const m = new Map();
      for (const v of ventas) for (const l of v.items) {
        const k = l.productoId || 'c:' + l.descripcion; const n = netoLinea(l);
        const x = m.get(k) || { codigo: l.codigo || 'COMÚN', descripcion: l.descripcion, departamento: l.departamento, cantidad: 0, total: 0, ganancia: 0 };
        x.cantidad += n.q; x.total += n.imp; x.ganancia += n.imp - n.cost; m.set(k, x);
      }
      const list = [...m.values()].filter(x => x.cantidad > 0).sort((a, b) => b.cantidad - a.cantidad);
      Reportes.exportRows = list.map(x => ({ Codigo: x.codigo, Descripcion: x.descripcion, Departamento: x.departamento, Cantidad: U.round3(x.cantidad), Vendido: U.round2(x.total), Ganancia: U.round2(x.ganancia) }));
      res.innerHTML = stats + `<div class="panel"><div class="table-wrap" style="max-height:calc(100vh - 420px)"><table class="grid" data-t><thead><tr><th>#</th><th>Código</th><th>Descripción</th><th>Departamento</th><th class="num">Cantidad</th><th class="num">Vendido</th><th class="num">Ganancia</th></tr></thead><tbody>${list.slice(0, 2000).map((x, i) => `<tr><td>${i + 1}</td><td>${U.esc(x.codigo)}</td><td>${U.esc(x.descripcion)}</td><td>${U.esc(x.departamento)}</td><td class="num">${U.qty(x.cantidad)}</td><td class="num">${U.money(x.total)}</td><td class="num">${U.money(x.ganancia)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted center">Sin ventas</td></tr>'}</tbody></table></div></div>`;
      return;
    }
    if (g === 'tickets') {
      const list = ventas.slice().sort((a, b) => b.ts - a.ts);
      Reportes.exportRows = list.map(v => ({ Folio: v.id, Fecha: U.fmtDateTime(v.ts), Caja: v.caja || '', Cajero: v.usuario, Cliente: v.clienteNombre || '', Total: v.total, Efectivo: v.pagos.efectivo, Tarjeta: v.pagos.tarjeta, Vales: v.pagos.vales || 0, Credito: v.pagos.credito, Devuelto: U.round2(U.sum(v.devoluciones, d => d.monto)), Ganancia: v.ganancia, Estado: v.estado }));
      res.innerHTML = stats + `<div class="panel"><div class="table-wrap" style="max-height:calc(100vh - 420px)"><table class="grid" data-t><thead><tr><th>Folio</th><th>Fecha</th><th>Caja</th><th>Cajero</th><th>Cliente</th><th class="num">Total</th><th>Pago</th><th>Estado</th></tr></thead><tbody>${list.slice(0, 3000).map(v => `<tr><td>${v.id}</td><td>${U.fmtDateTime(v.ts)}</td><td>${U.esc(v.caja || '')}</td><td>${U.esc(v.usuario)}</td><td>${U.esc(v.clienteNombre || '')}</td><td class="num">${U.money(v.total)}</td><td>${[v.pagos.efectivo && 'Efectivo', v.pagos.tarjeta && 'Tarjeta', v.pagos.vales && 'Vales', v.pagos.credito && 'Crédito'].filter(Boolean).join(' + ')}</td><td>${Ventas.estadoTag(v)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted center">Sin ventas</td></tr>'}</tbody></table></div></div>`;
      return;
    }

    const max = Math.max(1, ...rows.map(x => x.total));
    Reportes.exportRows = rows.map(x => ({ Concepto: x.etiqueta, Ventas: x.ventas ?? '', Total: U.round2(x.total), Ganancia: x.ganancia == null ? '' : U.round2(x.ganancia) }));
    res.innerHTML = stats + `<div class="grid2" style="align-items:start"><div class="panel"><div class="table-wrap" style="max-height:calc(100vh - 420px)"><table class="grid" data-t><thead><tr><th>Concepto</th><th class="num">Núm. ventas</th><th class="num">Total</th><th class="num">Ganancia</th></tr></thead><tbody>${rows.map(x => `<tr><td>${U.esc(x.etiqueta)}</td><td class="num">${x.ventas ?? ''}</td><td class="num">${U.money(x.total)}</td><td class="num">${x.ganancia == null ? '' : U.money(x.ganancia)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted center">Sin ventas</td></tr>'}</tbody><tfoot><tr><td>Total</td><td class="num">${g === 'departamento' || g === 'forma' ? '' : U.sum(rows, x => x.ventas)}</td><td class="num">${U.money(U.sum(rows, x => x.total))}</td><td class="num">${g === 'forma' ? '' : U.money(U.sum(rows, x => x.ganancia || 0))}</td></tr></tfoot></table></div></div>
      <div class="panel"><h3>Gráfica</h3><div class="chart-bars">${rows.map(x => `<div class="bar-row"><span>${U.esc(x.etiqueta)}</span><div class="bar" style="width:${(Math.max(x.total, 0) / max * 100).toFixed(1)}%"></div><span class="right">${U.money(x.total)}</span></div>`).join('')}</div></div></div>`;
  },
};
