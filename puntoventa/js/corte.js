/* Corte de caja: turno actual de esta caja, corte del día (todas las cajas) e historial */
'use strict';

const Corte = {
  el: null,
  tab: 'turno',

  render(el) {
    Corte.el = el;
    const tabs = [['turno', 'Corte de esta caja'], ['dia', 'Corte del día (todas las cajas)'], ['historial', 'Historial de cortes']];
    el.innerHTML = `<div class="panel"><div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${k === Corte.tab ? 'active' : ''}">${n}</button>`).join('')}</div><div data-body></div></div>`;
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { Corte.tab = b.dataset.tab; Corte.render(el); });
    Corte[Corte.tab](el.querySelector('[data-body]'));
  },
  focus() {},

  vista(r, titulo) {
    const fila = (k, v, cls = '') => `<tr><td>${k}</td><td class="num ${cls}">${U.money(v)}</td></tr>`;
    const deps = Object.entries(r.departamentos).sort((a, b) => b[1].ventas - a[1].ventas);
    return `<h3>${titulo}</h3>
      <div class="stats"><div class="stat"><div class="k">Ventas totales</div><div class="v">${U.money(r.ventasNetas)}</div></div><div class="stat"><div class="k">Ganancia</div><div class="v ok">${U.money(r.ganancia)}</div></div><div class="stat"><div class="k">Dinero que debe haber en caja</div><div class="v">${U.money(r.efectivoEsperado)}</div></div><div class="stat"><div class="k">Número de ventas</div><div class="v">${r.numVentas}</div></div></div>
      <div class="grid3" style="align-items:start">
        <div class="panel"><h3>Dinero en caja</h3><table class="grid">${fila('Fondo de caja', r.fondo)}${fila('Ventas en efectivo', r.ventasEfectivo, 'ok')}${fila('Abonos en efectivo', r.abonosEfectivo, 'ok')}${fila('Entradas', r.entradas, 'ok')}${fila('Salidas', -r.salidas, 'bad')}${fila('Devoluciones en efectivo', -r.devolucionesEfectivo, 'bad')}<tfoot>${fila('Total en caja', r.efectivoEsperado)}</tfoot></table></div>
        <div class="panel"><h3>Ventas</h3><table class="grid">${fila('En efectivo', r.ventasEfectivo)}${fila('Con tarjeta', r.ventasTarjeta)}${fila('Con vales', r.ventasVales)}${fila('A crédito', r.ventasCredito)}${fila('Devoluciones', -r.devolucionesTotal, 'bad')}<tfoot>${fila('Total', r.ventasNetas)}</tfoot></table>
          ${r.abonosTarjeta ? `<p class="small">Abonos con tarjeta: ${U.money(r.abonosTarjeta)}</p>` : ''}${r.canceladas ? `<p class="small warn">Ventas canceladas: ${r.canceladas}</p>` : ''}</div>
        <div class="panel"><h3>Ventas por departamento</h3><table class="grid"><thead><tr><th>Departamento</th><th class="num">Ventas</th><th class="num">Ganancia</th></tr></thead><tbody>${deps.map(([k, d]) => `<tr><td>${U.esc(k)}</td><td class="num">${U.money(d.ventas)}</td><td class="num">${U.money(d.ganancia)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Sin ventas</td></tr>'}</tbody></table></div>
      </div>
      <div class="grid2" style="align-items:start;margin-top:12px">
        <div class="panel"><h3>Entradas de efectivo</h3><table class="grid">${r.entradasLista.map(m => `<tr><td>${U.fmtTime(m.ts)}</td><td>${U.esc(m.descripcion)}</td><td>${U.esc(m.usuario)}</td><td class="num">${U.money(m.monto)}</td></tr>`).join('') || '<tr><td class="muted">Ninguna</td></tr>'}</table></div>
        <div class="panel"><h3>Salidas de efectivo</h3><table class="grid">${r.salidasLista.map(m => `<tr><td>${U.fmtTime(m.ts)}</td><td>${U.esc(m.descripcion)}</td><td>${U.esc(m.usuario)}</td><td class="num">${U.money(m.monto)}</td></tr>`).join('') || '<tr><td class="muted">Ninguna</td></tr>'}</table></div>
      </div>`;
  },

  async turno(box) {
    const t = Store.turno;
    if (!t) {
      box.innerHTML = `<p>No hay un turno abierto en <b>${U.esc(Remote.caja)}</b>. El turno se abre al hacer la primera venta.</p><button class="primary" data-open>Abrir turno ahora</button>`;
      box.querySelector('[data-open]').onclick = async () => {
        const f = await UI.prompt('Abrir turno', 'Dinero inicial en caja (fondo)', '0', 'number');
        if (f === null) return;
        await Store.abrirTurno(U.num(f)); App.tick(); Corte.render(Corte.el);
      };
      return;
    }
    box.innerHTML = '<p class="muted">Calculando…</p>';
    const r = await Store.resumenTurno(t);
    const titulo = `${U.esc(Remote.caja)} — Turno #${t.id}, abierto ${U.fmtDateTime(t.abierto)} por ${U.esc(t.usuarioAbre)}`;
    box.innerHTML = `<div class="toolbar"><button class="primary big" data-corte>Hacer corte de caja</button><button class="secondary" data-print>Imprimir estado actual</button><button class="secondary" data-ref>Actualizar</button></div>${Corte.vista(r, titulo)}`;
    box.querySelector('[data-ref]').onclick = () => Corte.render(Corte.el);
    box.querySelector('[data-print]').onclick = () => Print.html(Print.corteHTML('ESTADO DE CAJA (PARCIAL)', r, `<div>${U.esc(Remote.caja)} · Turno #${t.id}</div><div>Desde ${U.fmtDateTime(t.abierto)}</div>`));
    box.querySelector('[data-corte]').onclick = async () => {
      if (!await UI.autorizar('corte', 'hacer el corte de caja')) return;
      const x = await UI.form('Hacer corte de caja', [
        { name: 'contado', label: `Dinero contado en caja (debe haber ${U.money(r.efectivoEsperado)}). Déjelo vacío si no desea contarlo.`, type: 'number', step: 'any', autofocus: true, cls: 'cobro-input' },
        { name: 'notas', label: 'Notas', type: 'textarea' },
      ], { ok: 'Hacer corte', note: 'Al hacer el corte se cierra el turno de esta caja. Las siguientes ventas pertenecerán a un turno nuevo.' });
      if (!x) return;
      try {
        const c = await Store.cerrarTurno(x.contado, x.notas);
        App.tick();
        const dif = c.contado != null ? `<div>Contado: ${U.money(c.contado)}</div><div><b>Diferencia: ${U.money(c.diferencia)}</b> ${c.diferencia < 0 ? '(FALTANTE)' : c.diferencia > 0 ? '(SOBRANTE)' : ''}</div>` : '';
        Print.html(Print.corteHTML('CORTE DE CAJA', c.resumen, `<div>${U.esc(c.caja || Remote.caja)} · Turno #${c.id}</div><div>Del ${U.fmtDateTime(c.abierto)}</div><div>al ${U.fmtDateTime(c.cerrado)}</div><div>Cajero: ${U.esc(c.usuarioCierra)}</div>${dif}`));
        await UI.alert(`Corte realizado.\nDebe haber en caja: ${U.money(c.resumen.efectivoEsperado)}${c.contado != null ? `\nContado: ${U.money(c.contado)}\nDiferencia: ${U.money(c.diferencia)}` : ''}`, 'Corte de caja');
        if (Store.config.pedirFondo) {
          const f = await UI.prompt('Nuevo turno', 'Dinero inicial para el siguiente turno (fondo). Cancele si cierra el negocio.', '0', 'number');
          if (f !== null) { await Store.abrirTurno(U.num(f)); App.tick(); }
        }
        Corte.render(Corte.el);
      } catch (e) { UI.alert(e.message); }
    };
  },

  dia(box) {
    box.innerHTML = `<div class="row"><label style="max-width:200px">Fecha<input type="date" data-d value="${U.today()}"></label><button class="primary" data-go>Consultar</button><button class="secondary" data-print>Imprimir</button></div><div data-res style="margin-top:10px"></div>`;
    let r = null;
    const go = async () => {
      const d = box.querySelector('[data-d]').value || U.today();
      r = await Store.resumenPeriodo(U.startOfDay(d), U.endOfDay(d));
      box.querySelector('[data-res]').innerHTML = Corte.vista(r, `Corte del día ${U.fmtDate(U.startOfDay(d))} (todas las cajas y turnos)`);
    };
    box.querySelector('[data-go]').onclick = go;
    box.querySelector('[data-print]').onclick = () => { if (r) Print.html(Print.corteHTML('CORTE DEL DÍA', r, `<div>${U.fmtDate(U.startOfDay(box.querySelector('[data-d]').value))}</div>`)); };
    go();
  },

  async historial(box) {
    box.innerHTML = `<div class="row">${UI.rangoFechas('h', U.addDays(U.today(), -30), U.today())}<button class="primary" data-go>Consultar</button></div><div data-res style="margin-top:10px"></div>`;
    const go = async () => {
      const turnos = (await DB.range('turnos', 'abierto', U.startOfDay(box.querySelector('[data-h-from]').value), U.endOfDay(box.querySelector('[data-h-to]').value))).sort((a, b) => b.abierto - a.abierto);
      box.querySelector('[data-res]').innerHTML = `<div class="table-wrap" style="max-height:calc(100vh - 300px)"><table class="grid"><thead><tr><th>Turno</th><th>Caja</th><th>Abierto</th><th>Cerrado</th><th>Cajero</th><th class="num">Ventas</th><th class="num">Debía haber</th><th class="num">Contado</th><th class="num">Diferencia</th><th></th></tr></thead><tbody>${turnos.map(t => `<tr><td>#${t.id}</td><td>${U.esc(t.caja || '')}</td><td>${U.fmtDateTime(t.abierto)}</td><td>${t.cerrado ? U.fmtDateTime(t.cerrado) : '<span class="tag ok">Abierto</span>'}</td><td>${U.esc(t.usuarioCierra || t.usuarioAbre)}</td><td class="num">${t.resumen ? U.money(t.resumen.ventasNetas) : ''}</td><td class="num">${t.resumen ? U.money(t.resumen.efectivoEsperado) : ''}</td><td class="num">${t.contado != null ? U.money(t.contado) : ''}</td><td class="num ${t.diferencia < 0 ? 'bad' : ''}">${t.diferencia != null ? U.money(t.diferencia) : ''}</td><td>${t.resumen ? `<button class="ghost" data-v="${t.id}">Ver</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="10" class="muted center">Sin cortes</td></tr>'}</tbody></table></div>`;
      box.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
        const t = turnos.find(x => x.id === +b.dataset.v);
        const m = UI.modal({ title: `Corte turno #${t.id}`, size: 'xwide', body: Corte.vista(t.resumen, `${U.esc(t.caja || '')} · ${U.fmtDateTime(t.abierto)} a ${U.fmtDateTime(t.cerrado)}${t.notas ? ' · ' + U.esc(t.notas) : ''}`), footer: '<button class="primary" data-p>Reimprimir corte</button>' });
        m.q('[data-p]').onclick = () => Print.html(Print.corteHTML('CORTE DE CAJA (REIMPRESIÓN)', t.resumen, `<div>${U.esc(t.caja || '')} · Turno #${t.id}</div><div>Del ${U.fmtDateTime(t.abierto)} al ${U.fmtDateTime(t.cerrado)}</div>${t.contado != null ? `<div>Contado: ${U.money(t.contado)} · Diferencia: ${U.money(t.diferencia)}</div>` : ''}`));
      });
    };
    box.querySelector('[data-go]').onclick = go;
    go();
  },
};
