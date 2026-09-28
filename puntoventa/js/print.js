/* Impresión de tickets, cortes, reportes y etiquetas */
'use strict';

const Print = {
  html(html, copias = 1) {
    const area = document.getElementById('print-area');
    area.innerHTML = Array.from({ length: Math.max(1, copias) }, () => html).join('<div style="page-break-after:always"></div>');
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); area.innerHTML = ''; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => { window.print(); setTimeout(done, 500); }, 50);
  },

  encabezado() {
    const c = Store.config, n = c.negocio, t = c.ticket;
    return `${t.logo ? `<img class="logo-img" src="${t.logo}" alt="">` : ''}
      <div class="c big">${U.esc(n.nombre)}</div>
      ${n.direccion ? `<div class="c">${U.esc(n.direccion)}</div>` : ''}
      ${n.telefono ? `<div class="c">Tel. ${U.esc(n.telefono)}</div>` : ''}
      ${n.rfc ? `<div class="c">RFC: ${U.esc(n.rfc)}</div>` : ''}
      ${t.encabezado ? `<div class="c">${U.esc(t.encabezado).replace(/\n/g, '<br>')}</div>` : ''}`;
  },
  cls() { return 'ticket' + (Store.config.ticket.ancho === '58' ? ' w58' : ''); },

  ticketHTML(v, { reimpresion = false } = {}) {
    const c = Store.config, t = c.ticket;
    const imp = c.impuestos;
    const items = v.items.map(l => `<tr><td colspan="3">${U.esc(l.descripcion)}</td></tr>
      <tr><td>${U.qty(l.cantidad)} x ${U.money(l.precio)}</td><td></td><td class="r">${U.money(l.importe)}</td></tr>
      ${l.etiqueta ? `<tr><td colspan="3" class="small">&nbsp;&nbsp;${U.esc(l.etiqueta)}</td></tr>` : ''}
      ${l.devuelto ? `<tr><td colspan="3">&nbsp;&nbsp;DEVUELTO: ${U.qty(l.devuelto)}</td></tr>` : ''}`).join('');
    const numArt = U.sum(v.items, l => l.tipoVenta === 'G' ? 1 : l.cantidad);
    let impuestos = '';
    if (imp.usar && imp.porcentaje > 0) {
      const base = U.round2(v.total / (1 + imp.porcentaje / 100));
      impuestos = `<tr><td>Subtotal</td><td class="r">${U.money(base)}</td></tr><tr><td>${U.esc(imp.nombre)} ${imp.porcentaje}%</td><td class="r">${U.money(v.total - base)}</td></tr>`;
    }
    const devs = U.sum(v.devoluciones || [], d => d.monto);
    return `<div class="${Print.cls()}">${Print.encabezado()}
      <hr>
      ${reimpresion ? '<div class="c">*** REIMPRESIÓN ***</div>' : ''}
      ${v.estado === 'cancelada' ? '<div class="c big">*** CANCELADA ***</div>' : ''}
      <div>Folio: ${v.id}</div>
      <div>Fecha: ${U.fmtDateTime(v.ts)}</div>
      ${t.mostrarCajero ? `<div>Le atendió: ${U.esc(v.usuario)}</div>` : ''}
      ${t.mostrarCliente && v.clienteNombre ? `<div>Cliente: ${U.esc(v.clienteNombre)}</div>` : ''}
      <hr>
      <table>${items}</table>
      <hr>
      <div>No. de artículos: ${U.qty(numArt)}</div>
      <table>${impuestos}
        <tr><td class="big">TOTAL</td><td class="r big">${U.money(v.total)}</td></tr>
        ${v.pagos.efectivo ? `<tr><td>Efectivo</td><td class="r">${U.money(v.pagoCon || v.pagos.efectivo)}</td></tr>` : ''}
        ${v.pagos.tarjeta ? `<tr><td>Tarjeta${v.referencia ? ' (' + U.esc(v.referencia) + ')' : ''}</td><td class="r">${U.money(v.pagos.tarjeta)}</td></tr>` : ''}
        ${v.pagos.vales ? `<tr><td>Vales</td><td class="r">${U.money(v.pagos.vales)}</td></tr>` : ''}
        ${v.pagos.credito ? `<tr><td>A crédito</td><td class="r">${U.money(v.pagos.credito)}</td></tr>` : ''}
        ${v.cambio ? `<tr><td>Cambio</td><td class="r">${U.money(v.cambio)}</td></tr>` : ''}
        ${devs ? `<tr><td>Devoluciones</td><td class="r">-${U.money(devs)}</td></tr>` : ''}
      </table>
      ${t.mostrarAhorro && v.ahorro > 0 ? `<div class="c">¡Usted ahorró ${U.money(v.ahorro)}!</div>` : ''}
      ${v.notas ? `<hr><div>${U.esc(v.notas)}</div>` : ''}
      <hr>
      <div class="c">${U.esc(t.pie || '').replace(/\n/g, '<br>')}</div>
    </div>`;
  },
  ticket(v, opts = {}) { Print.html(Print.ticketHTML(v, opts), opts.reimpresion ? 1 : Store.config.ticket.copias || 1); },

  corteHTML(titulo, r, extra = '') {
    const fila = (k, v, b = false) => `<tr><td>${b ? '<b>' + k + '</b>' : k}</td><td class="r">${b ? '<b>' + U.money(v) + '</b>' : U.money(v)}</td></tr>`;
    return `<div class="${Print.cls()}">${Print.encabezado()}<hr>
      <div class="c big">${U.esc(titulo)}</div>${extra}<hr>
      <div class="c"><b>DINERO EN CAJA</b></div>
      <table>${fila('Fondo de caja', r.fondo)}${fila('Ventas en efectivo', r.ventasEfectivo)}${fila('Abonos en efectivo', r.abonosEfectivo)}${fila('Entradas', r.entradas)}${fila('Salidas', -r.salidas)}${fila('Devoluciones en efectivo', -r.devolucionesEfectivo)}${fila('Total en caja', r.efectivoEsperado, true)}</table>
      <hr><div class="c"><b>VENTAS</b></div>
      <table>${fila('En efectivo', r.ventasEfectivo)}${fila('Con tarjeta', r.ventasTarjeta)}${r.ventasVales ? fila('Con vales', r.ventasVales) : ''}${fila('A crédito', r.ventasCredito)}${fila('Devoluciones', -r.devolucionesTotal)}${fila('Total ventas', r.ventasNetas, true)}</table>
      <div>Número de ventas: ${r.numVentas}</div>
      ${r.abonosTarjeta ? `<table>${fila('Abonos con tarjeta', r.abonosTarjeta)}</table>` : ''}
      <hr><div class="c"><b>GANANCIA</b></div><table>${fila('Ganancia', r.ganancia, true)}</table>
      <hr><div class="c"><b>VENTAS POR DEPARTAMENTO</b></div>
      <table>${Object.entries(r.departamentos).map(([k, d]) => fila(U.esc(k), d.ventas)).join('')}</table>
      ${r.entradasLista.length ? `<hr><div class="c"><b>ENTRADAS</b></div><table>${r.entradasLista.map(m => fila(U.fmtTime(m.ts) + ' ' + U.esc(m.descripcion), m.monto)).join('')}</table>` : ''}
      ${r.salidasLista.length ? `<hr><div class="c"><b>SALIDAS</b></div><table>${r.salidasLista.map(m => fila(U.fmtTime(m.ts) + ' ' + U.esc(m.descripcion), m.monto)).join('')}</table>` : ''}
      <hr><div class="c">Impreso ${U.fmtDateTime(Date.now())}</div></div>`;
  },

  reporte(titulo, tableHTML, subtitulo = '') {
    Print.html(`<div class="report-print"><h2>${U.esc(Store.config.negocio.nombre)} — ${U.esc(titulo)}</h2>${subtitulo ? `<p>${subtitulo}</p>` : ''}${tableHTML}<p>Impreso ${U.fmtDateTime(Date.now())}</p></div>`);
  },

  etiquetas(lista) {
    const html = `<div class="labels">${lista.map(({ p, n }) => Array.from({ length: n }, () => `<div class="label-item"><div>${U.esc(p.descripcion)}</div><svg class="bc" data-code="${U.esc(p.codigo)}"></svg><div class="precio">${U.money(p.precio)}</div></div>`).join('')).join('')}</div>`;
    const area = document.getElementById('print-area');
    Print.html(html);
    area.querySelectorAll('svg.bc').forEach(svg => {
      try { JsBarcode(svg, svg.dataset.code, { format: 'CODE128', height: 40, fontSize: 12, margin: 0, width: 1.5 }); }
      catch (e) { svg.outerHTML = `<div>${U.esc(svg.dataset.code)}</div>`; }
    });
  },
};
