/* Configuración: negocio, ticket, cajeros y permisos, opciones generales, red, respaldos */
'use strict';

const Configuracion = {
  el: null,
  tab: 'negocio',

  render(el) {
    Configuracion.el = el;
    const tabs = [['negocio', 'Datos del negocio'], ['ticket', 'Ticket e impresora'], ['cajeros', 'Cajeros y permisos'], ['general', 'Opciones generales'], ['transferir', 'Transferir datos desde eleventa'], ['red', 'Red y cajas'], ['respaldos', 'Respaldos']];
    el.innerHTML = `<div class="panel"><div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${k === Configuracion.tab ? 'active' : ''}">${n}</button>`).join('')}</div><div data-body></div></div>`;
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { Configuracion.tab = b.dataset.tab; Configuracion.render(el); });
    Configuracion[Configuracion.tab](el.querySelector('[data-body]'));
  },
  focus() {},

  async guardar(msg = 'Configuración guardada') {
    try { await Store.saveConfig(); UI.toast(msg, 'ok'); }
    catch (e) { UI.alert(e.message); }
    document.getElementById('brand-name').textContent = Store.config.negocio.nombre;
  },

  negocio(box) {
    const n = Store.config.negocio;
    box.innerHTML = `<form data-f style="max-width:720px"><div class="grid2">
      <label>Nombre del negocio<input name="nombre" value="${U.esc(n.nombre)}" required></label>
      <label>Teléfono<input name="telefono" value="${U.esc(n.telefono)}"></label>
      <label style="grid-column:span 2">Dirección<input name="direccion" value="${U.esc(n.direccion)}"></label>
      <label>RFC / Identificación fiscal<input name="rfc" value="${U.esc(n.rfc)}"></label></div>
      <div class="toolbar" style="margin-top:12px"><button class="primary" type="submit">Guardar</button></div></form>`;
    box.querySelector('[data-f]').onsubmit = (e) => {
      e.preventDefault();
      const E = e.target.elements;
      Object.assign(Store.config.negocio, { nombre: E.nombre.value.trim(), telefono: E.telefono.value.trim(), direccion: E.direccion.value.trim(), rfc: E.rfc.value.trim() });
      Configuracion.guardar();
    };
  },

  ticket(box) {
    const t = Store.config.ticket;
    box.innerHTML = `<div class="grid2" style="align-items:start"><form data-f>
      <label>Encabezado (texto extra arriba del ticket)<textarea name="encabezado" rows="3">${U.esc(t.encabezado)}</textarea></label>
      <label>Pie de ticket<textarea name="pie" rows="3">${U.esc(t.pie)}</textarea></label>
      <div class="grid2"><label>Ancho del papel<select name="ancho"><option value="80" ${t.ancho === '80' ? 'selected' : ''}>80 mm</option><option value="58" ${t.ancho === '58' ? 'selected' : ''}>58 mm</option></select></label>
      <label>Copias por venta<input name="copias" type="number" min="1" max="5" value="${t.copias}"></label></div>
      <label class="check"><input type="checkbox" name="imprimirAuto" ${t.imprimirAuto ? 'checked' : ''}> Imprimir ticket al cobrar con Enter</label>
      <label class="check"><input type="checkbox" name="mostrarCajero" ${t.mostrarCajero ? 'checked' : ''}> Mostrar nombre del cajero</label>
      <label class="check"><input type="checkbox" name="mostrarCliente" ${t.mostrarCliente ? 'checked' : ''}> Mostrar nombre del cliente</label>
      <label class="check"><input type="checkbox" name="mostrarAhorro" ${t.mostrarAhorro ? 'checked' : ''}> Mostrar "Usted ahorró" cuando hay mayoreo o promociones</label>
      <label>Logotipo (imagen pequeña)<input type="file" accept="image/*" data-logo></label>
      ${t.logo ? '<button type="button" class="link" data-nologo>Quitar logotipo</button>' : ''}
      <div class="toolbar" style="margin-top:12px"><button class="primary" type="submit">Guardar</button><button class="secondary" type="button" data-test>Imprimir ticket de prueba</button></div>
      <p class="muted small">Para imprimir sin la ventana de impresión, abra el programa con el acceso directo "Caja" que crea el instalador (usa la impresora predeterminada de Windows). Configure su impresora de tickets como predeterminada.</p>
      </form><div class="panel"><h3>Vista previa</h3><div data-prev style="background:#fff;padding:10px;border:1px dashed #bbb;display:inline-block"></div></div></div>`;
    const f = box.querySelector('[data-f]');
    const muestra = () => ({ id: 123, ts: Date.now(), usuario: Store.user.nombre, clienteNombre: 'Cliente de ejemplo', items: [{ descripcion: 'REFRESCO COLA 600 ML', cantidad: 2, precio: 18, importe: 36, devuelto: 0 }, { descripcion: 'FRIJOL A GRANEL', cantidad: 1.25, precio: 34, importe: 42.5, tipoVenta: 'G', devuelto: 0, etiqueta: 'Mayoreo' }], total: 78.5, ahorro: 2.5, pagos: { efectivo: 78.5, tarjeta: 0, credito: 0 }, pagoCon: 100, cambio: 21.5, devoluciones: [], estado: 'ok' });
    const leer = () => {
      const E = f.elements;
      Object.assign(Store.config.ticket, { encabezado: E.encabezado.value, pie: E.pie.value, ancho: E.ancho.value, copias: Math.max(1, parseInt(E.copias.value, 10) || 1), imprimirAuto: E.imprimirAuto.checked, mostrarCajero: E.mostrarCajero.checked, mostrarCliente: E.mostrarCliente.checked, mostrarAhorro: E.mostrarAhorro.checked });
    };
    const prev = () => { leer(); box.querySelector('[data-prev]').innerHTML = Print.ticketHTML(muestra()); };
    f.oninput = prev; f.onchange = prev;
    f.onsubmit = (e) => { e.preventDefault(); leer(); Configuracion.guardar(); };
    box.querySelector('[data-test]').onclick = () => { leer(); Print.ticket(muestra()); };
    box.querySelector('[data-logo]').onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      if (file.size > 400 * 1024) return UI.alert('La imagen es muy grande. Use una de menos de 400 KB.');
      Store.config.ticket.logo = await U.readFileAsDataURL(file);
      prev();
    };
    const nl = box.querySelector('[data-nologo]');
    if (nl) nl.onclick = () => { Store.config.ticket.logo = ''; Configuracion.render(Configuracion.el); };
    prev();
  },

  cajeros(box) {
    box.innerHTML = `<div class="grid2" style="grid-template-columns:320px 1fr;align-items:start"><div><div class="toolbar"><button class="primary" data-n>+ Nuevo cajero</button></div><div class="table-wrap"><table class="grid"><thead><tr><th>Nombre</th><th>Usuario</th></tr></thead><tbody data-l></tbody></table></div></div><div data-form class="panel"><p class="muted">Seleccione un cajero para ver sus datos y permisos.</p></div></div>`;
    let sel = null;
    const draw = () => {
      box.querySelector('[data-l]').innerHTML = Store.usuarios.map(u => `<tr class="clickable ${sel && sel.id === u.id ? 'sel' : ''}" data-id="${u.id}"><td>${U.esc(u.nombre)} ${u.admin ? '<span class="tag">Admin</span>' : ''} ${u.activo === false ? '<span class="tag bad">Inactivo</span>' : ''}</td><td>${U.esc(u.usuario)}</td></tr>`).join('');
    };
    const form = (u) => {
      sel = u; draw();
      const nuevo = !u.id;
      const fb = box.querySelector('[data-form]');
      fb.innerHTML = `<form data-uf><h3>${nuevo ? 'Nuevo cajero' : 'Datos del cajero'}</h3><div class="grid2">
        <label>Nombre completo<input name="nombre" value="${U.esc(u.nombre || '')}" required></label>
        <label>Usuario (para entrar)<input name="usuario" value="${U.esc(u.usuario || '')}" required></label>
        <label>${nuevo ? 'Contraseña' : 'Nueva contraseña (vacío = no cambiar)'}<input name="password" type="password" autocomplete="new-password"></label>
        <label>Confirmar contraseña<input name="password2" type="password" autocomplete="new-password"></label></div>
        <label class="check"><input type="checkbox" name="activo" ${u.activo !== false ? 'checked' : ''}> Cajero activo (puede entrar)</label>
        <label class="check"><input type="checkbox" name="admin" ${u.admin ? 'checked' : ''}> Administrador (tiene todos los permisos)</label>
        <h3 style="margin-top:12px">Permisos</h3><div class="grid2" data-perms>${PERMISOS.map(([k, n]) => `<label class="check"><input type="checkbox" name="p_${k}" ${u.admin || (u.permisos || {})[k] ? 'checked' : ''}> ${U.esc(n)}</label>`).join('')}</div>
        <div class="toolbar" style="margin-top:12px"><button class="primary" type="submit">Guardar cajero y permisos</button>${nuevo ? '' : '<button class="danger" type="button" data-del>Eliminar cajero</button>'}</div><p class="error" data-err></p></form>`;
      const f = fb.querySelector('[data-uf]');
      const sync = () => f.querySelectorAll('[data-perms] input').forEach(i => { i.disabled = f.elements.admin.checked; if (f.elements.admin.checked) i.checked = true; });
      f.elements.admin.onchange = sync; sync();
      f.onsubmit = async (e) => {
        e.preventDefault();
        const E = f.elements;
        if (E.password.value !== E.password2.value) { f.querySelector('[data-err]').textContent = 'Las contraseñas no coinciden.'; return; }
        const permisos = {};
        for (const [k] of PERMISOS) permisos[k] = E['p_' + k].checked;
        try {
          const out = await Store.guardarUsuario({ id: u.id, nombre: E.nombre.value.trim(), usuario: E.usuario.value.trim(), admin: E.admin.checked, activo: E.activo.checked, permisos }, E.password.value || (nuevo ? '' : null));
          UI.toast('Cajero guardado', 'ok');
          if (Store.user.id === out.id) { Object.assign(Store.user, out); App.applyPermissions(); document.getElementById('user-name').textContent = out.nombre; }
          form(Store.usuarios.find(x => x.id === out.id) || out);
        } catch (ex) { f.querySelector('[data-err]').textContent = ex.message; }
      };
      const d = f.querySelector('[data-del]');
      if (d) d.onclick = async () => {
        if (!await UI.confirm(`¿Eliminar al cajero "${u.nombre}"? Sus ventas anteriores se conservan.`, { danger: true, ok: 'Eliminar' })) return;
        try { await Store.eliminarUsuario(u.id); sel = null; fb.innerHTML = '<p class="muted">Cajero eliminado.</p>'; draw(); } catch (ex) { UI.alert(ex.message); }
      };
    };
    box.querySelector('[data-l]').onclick = (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) form(Store.usuarios.find(u => u.id === +tr.dataset.id)); };
    box.querySelector('[data-n]').onclick = () => form({ permisos: { vender: true, clientes: true } });
    draw();
  },

  general(box) {
    const c = Store.config;
    box.innerHTML = `<form data-f style="max-width:720px">
      <div class="grid2"><label>Símbolo de moneda<input name="moneda" value="${U.esc(c.moneda)}" maxlength="4"></label>
      <label>Comisión de tarjeta (%) — sólo informativa<input name="comisionTarjeta" type="number" step="any" value="${c.comisionTarjeta}"></label></div>
      <h3 style="margin-top:14px">Impuestos</h3>
      <label class="check"><input type="checkbox" name="impUsar" ${c.impuestos.usar ? 'checked' : ''}> Desglosar impuesto en el ticket (los precios ya incluyen el impuesto)</label>
      <div class="grid2"><label>Nombre del impuesto<input name="impNombre" value="${U.esc(c.impuestos.nombre)}"></label><label>Porcentaje (%)<input name="impPct" type="number" step="any" value="${c.impuestos.porcentaje}"></label></div>
      <h3 style="margin-top:14px">Ventas</h3>
      <label class="check"><input type="checkbox" name="mayoreoAutomatico" ${c.mayoreoAutomatico ? 'checked' : ''}> Aplicar precio de mayoreo automáticamente cuando se alcanza la cantidad indicada en cada producto</label>
      <label class="check"><input type="checkbox" name="venderSinExistencia" ${c.venderSinExistencia ? 'checked' : ''}> Permitir vender productos sin existencia (el inventario puede quedar negativo)</label>
      <label class="check"><input type="checkbox" name="pedirFondo" ${c.pedirFondo ? 'checked' : ''}> Pedir dinero inicial (fondo de caja) al iniciar turno</label>
      <div class="toolbar" style="margin-top:12px"><button class="primary" type="submit">Guardar</button></div></form>`;
    box.querySelector('[data-f]').onsubmit = (e) => {
      e.preventDefault();
      const E = e.target.elements;
      c.moneda = E.moneda.value.trim() || '$';
      c.comisionTarjeta = U.num(E.comisionTarjeta.value);
      c.impuestos = { usar: E.impUsar.checked, nombre: E.impNombre.value.trim() || 'IVA', porcentaje: U.num(E.impPct.value) };
      c.mayoreoAutomatico = E.mayoreoAutomatico.checked;
      c.venderSinExistencia = E.venderSinExistencia.checked;
      c.pedirFondo = E.pedirFondo.checked;
      Configuracion.guardar();
    };
  },

  transferir(box) {
    const paso = (n, titulo, html, boton, data) => `<div class="panel"><h3>Paso ${n}. ${titulo}</h3>${html}${boton ? `<div class="toolbar" style="margin-top:8px"><button class="primary" data-${data}>${boton}</button></div>` : ''}</div>`;
    box.innerHTML = `<div style="max-width:900px">
      <p>Pase toda la información de eleventa a este programa en pocos minutos. No hace falta escribir los productos ni los clientes uno por uno.</p>
      <div class="stats"><div class="stat"><div class="k">Productos en este programa</div><div class="v">${Store.productos.length}</div></div><div class="stat"><div class="k">Departamentos</div><div class="v">${Store.departamentos.length}</div></div><div class="stat"><div class="k">Clientes</div><div class="v">${Store.clientes.length}</div></div><div class="stat"><div class="k">Saldo por cobrar</div><div class="v">${U.money(U.sum(Store.clientes, c => c.saldo))}</div></div></div>
      ${paso(1, 'Productos, precios, existencias y departamentos', `<ol><li>En eleventa entre a <b>F3 Productos</b> y presione <b>Exportar</b> (o <b>F4 Inventario → Reporte de inventario → Exportar a Excel</b>).</li><li>Guarde el archivo en una memoria USB o en el escritorio.</li><li>Aquí presione el botón y elija ese archivo. Los departamentos se crean solos.</li></ol>`, 'Importar productos', 'prod')}
      ${paso(2, 'Clientes y lo que deben (créditos)', `<ol><li>En eleventa entre a <b>F2 Clientes</b> y presione <b>Exportar...</b> (abajo a la izquierda).</li><li>Aquí presione el botón y elija ese archivo. Se cargan nombre, teléfono, dirección, límite de crédito y <b>saldo actual</b> de cada cliente.</li></ol>`, 'Importar clientes', 'cli')}
      ${paso(3, 'Revisar', `<ul><li>Revise algunas existencias en <b>F4 Inventario → Reporte de inventario</b>.</li><li>Revise el total por cobrar en <b>F2 Clientes → Reporte de saldos</b> y compárelo con el de eleventa.</li><li>Cree sus cajeros en <b>Configuración → Cajeros y permisos</b> y ajuste el ticket.</li></ul>`)}
      ${paso(4, 'Pasar datos de este programa a otra computadora', `<p>Para mover <b>todo</b> (productos, ventas, clientes, cortes y cajeros) de una instalación de este programa a otra, use <b>Respaldos → Descargar respaldo</b> en la computadora vieja y <b>Restaurar desde archivo</b> en la nueva.</p>`, 'Ir a Respaldos', 'resp')}
      <p class="muted small">Puede repetir los pasos 1 y 2 las veces que quiera: los productos y clientes que ya existen se actualizan, no se duplican.</p></div>`;
    const refrescar = () => { if (App.current === 'configuracion' && Configuracion.tab === 'transferir') Configuracion.render(Configuracion.el); };
    box.querySelector('[data-prod]').onclick = async () => { await Importar.abrir(); refrescar(); };
    box.querySelector('[data-cli]').onclick = async () => { await Importar.clientes(); refrescar(); };
    box.querySelector('[data-resp]').onclick = () => { Configuracion.tab = 'respaldos'; Configuracion.render(Configuracion.el); };
  },

  async red(box) {
    box.innerHTML = `<p class="muted">Cargando…</p>`;
    let info;
    try { info = await Remote.get('/api/red'); } catch (e) { box.innerHTML = `<p class="bad">${U.esc(e.message)}</p>`; return; }
    box.innerHTML = `<div style="max-width:820px">
      <h3>Conectar otras computadoras (cajas)</h3>
      <ol><li>Conecte la otra computadora a la <b>misma red Wi-Fi</b> (o cable) que esta. No se necesita internet.</li>
      <li>En la otra computadora abra el navegador (Chrome o Edge) y escriba una de estas direcciones:</li></ol>
      <div class="panel">${info.direcciones.map(d => `<div style="font-size:20px;font-weight:700;font-family:monospace">${U.esc(d)}</div>`).join('') || '<p class="bad">Esta computadora no está conectada a ninguna red.</p>'}</div>
      <ol start="3"><li>Escriba el nombre de esa caja (ej. "Caja 2") y entre con su usuario.</li><li>Para más comodidad, instale el programa también en esa computadora y elija la opción <b>"Caja conectada a otro servidor"</b>.</li></ol>
      <p class="muted small">Si no conecta: permita el programa en el Firewall de Windows (redes privadas) y verifique que ambas computadoras estén en la misma red. Recomendamos fijar la IP del servidor en su módem para que no cambie.</p>
      <h3>Esta computadora</h3>
      <form data-f class="row"><label style="max-width:320px">Nombre de esta caja<input name="caja" value="${U.esc(Remote.caja)}" required></label><button class="secondary" type="submit">Cambiar nombre</button></form>
      <h3 style="margin-top:14px">Cajas con turno abierto</h3>
      <table class="grid"><thead><tr><th>Caja</th><th>Turno</th><th>Abierto</th><th>Por</th></tr></thead><tbody>${info.turnosAbiertos.map(t => `<tr><td>${U.esc(t.caja)}</td><td>#${t.id}</td><td>${U.fmtDateTime(t.abierto)}</td><td>${U.esc(t.usuarioAbre)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted center">Ninguna</td></tr>'}</tbody></table>
      <p class="muted">Pantallas conectadas ahora: ${info.cajasConectadas}</p></div>`;
    box.querySelector('[data-f]').onsubmit = async (e) => {
      e.preventDefault();
      const n = e.target.elements.caja.value.trim();
      if (!n || n === Remote.caja) return;
      if (Store.turno && !await UI.confirm(`Esta caja tiene un turno abierto (#${Store.turno.id}). Si cambia el nombre, ese turno quedará con el nombre anterior hasta hacer su corte. ¿Continuar?`)) return;
      Remote.caja = n; Store.caja = n;
      await Remote.bootstrap();
      App.tick();
      UI.toast('Nombre de caja cambiado', 'ok');
      Configuracion.render(Configuracion.el);
    };
  },

  async respaldos(box) {
    box.innerHTML = `<div style="max-width:820px">
      <h3>Respaldo de la información</h3>
      <p>El servidor guarda un respaldo automático al iniciar y cada 6 horas (se conservan los últimos 40). También puede descargar un respaldo a una memoria USB.</p>
      <div class="toolbar"><button class="primary" data-down>Descargar respaldo ahora</button><button class="secondary" data-now>Crear respaldo en el servidor</button><label class="btn">Restaurar desde archivo…<input type="file" accept=".json" data-rest class="hidden"></label></div>
      <div data-list><p class="muted">Cargando…</p></div>
      <h3 style="margin-top:20px" class="bad">Zona peligrosa</h3>
      <p>Borra todos los productos, ventas, clientes y cajeros (se crea un respaldo antes). Úselo sólo para empezar de cero.</p>
      <button class="danger" data-wipe>Borrar toda la información</button></div>`;
    const lista = async () => {
      try {
        const r = await Remote.get('/api/respaldos');
        box.querySelector('[data-list]').innerHTML = `<p class="muted small">Carpeta en el servidor: ${U.esc(r.carpeta)}</p><div class="table-wrap" style="max-height:30vh"><table class="grid"><thead><tr><th>Archivo</th><th class="num">Tamaño</th></tr></thead><tbody>${r.archivos.map(a => `<tr><td>${U.esc(a.nombre)}</td><td class="num">${(a.bytes / 1024).toFixed(0)} KB</td></tr>`).join('')}</tbody></table></div>`;
      } catch (e) { box.querySelector('[data-list]').innerHTML = `<p class="bad">${U.esc(e.message)}</p>`; }
    };
    box.querySelector('[data-down]').onclick = async () => {
      try { const dump = await Remote.get('/api/respaldo'); U.download(`respaldo-puntoventa-${U.today()}.json`, JSON.stringify(dump), 'application/json'); }
      catch (e) { UI.alert(e.message); }
    };
    box.querySelector('[data-now]').onclick = async () => { try { const r = await Remote.post('/api/respaldos'); UI.toast('Respaldo creado: ' + r.archivo, 'ok'); lista(); } catch (e) { UI.alert(e.message); } };
    box.querySelector('[data-rest]').onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      let dump;
      try { dump = JSON.parse(await U.readFileAsText(file)); } catch (ex) { return UI.alert('El archivo no es un respaldo válido.'); }
      const n = dump && dump.data ? `${(dump.data.productos || []).length} productos, ${(dump.data.ventas || []).length} ventas, ${(dump.data.clientes || []).length} clientes` : '';
      if (!await UI.confirm(`¿Restaurar el respaldo del ${dump.exportado ? U.fmtDateTime(Date.parse(dump.exportado)) : '?'} (${n})?\nToda la información actual será reemplazada en TODAS las cajas.`, { danger: true, ok: 'Restaurar' })) return;
      try { await Remote.call('restaurar', [dump]); await UI.alert('Respaldo restaurado. Vuelva a iniciar sesión.'); App.logout(); }
      catch (ex) { UI.alert(ex.message); }
    };
    box.querySelector('[data-wipe]').onclick = async () => {
      if (!await UI.confirm('¿Borrar TODA la información? Esta acción afecta a todas las cajas.', { danger: true, ok: 'Sí, borrar todo' })) return;
      const t = await UI.prompt('Confirmación', 'Escriba BORRAR para confirmar', '');
      if (t !== 'BORRAR') return UI.toast('Cancelado');
      try { await Remote.call('borrarTodo', []); await UI.alert('Información borrada. Entre con usuario "admin" sin contraseña.'); App.logout(); }
      catch (ex) { UI.alert(ex.message); }
    };
    lista();
  },
};
