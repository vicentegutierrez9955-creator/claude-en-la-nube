/* Configuración: negocio, ticket, cajeros y permisos, opciones generales, red, respaldos */
'use strict';

const Configuracion = {
  el: null,
  tab: 'negocio',

  render(el) {
    Configuracion.el = el;
    const tabs = [['negocio', 'Datos del negocio'], ['basedatos', 'Base de datos'], ['ticket', 'Ticket e impresora'], ['cajeros', 'Cajeros y permisos'], ['general', 'Opciones generales'], ['red', 'Red y cajas'], ['respaldos', 'Respaldos']];
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

  /* ---------- Base de datos: agregar (importar) toda la información ---------- */
  async basedatos(box) {
    box.innerHTML = `<div style="max-width:980px">
      <h2 style="margin-top:0">Agregar base de datos</h2>
      <div class="panel" style="border:2px solid var(--brand);background:var(--brand-soft)">
        <h3 style="margin-top:0">Cargar la base de datos completa de eleventa</h3>
        <p>Pasa de una sola vez <b>todos los productos</b> (precios, existencias, mínimos y máximos), <b>los departamentos</b> y <b>los clientes con su crédito</b> desde el archivo de eleventa <b>PDVDATA.FDB</b>. El archivo de eleventa no se modifica.</p>
        <div class="toolbar">
          <button class="primary big" data-fdb-buscar>Buscar eleventa en la computadora principal</button>
          <label class="btn big" style="cursor:pointer">Elegir archivo PDVDATA.FDB…<input type="file" data-fdb-file accept=".fdb,.FDB" class="hidden"></label>
        </div>
        <p class="muted small">Si eleventa está instalado en la computadora principal, use "Buscar". Si el archivo está en otra computadora, cópielo con una memoria USB; normalmente está en <b>C:\\Program Files (x86)\\AbarrotesPDV\\db\\PDVDATA.FDB</b>. Cierre eleventa antes de cargarlo.</p>
      </div>
      <h3>O agregue archivos de Excel / CSV</h3>
      <div class="dropzone" data-drop>
        <p style="font-size:16px"><b>Arrastre aquí los archivos de su base de datos</b><br><span class="muted">Productos y clientes exportados de eleventa (Excel o CSV), o un respaldo de este programa (.json). Puede elegir varios archivos a la vez.</span></p>
        <label class="btn primary" style="display:inline-flex;cursor:pointer;background:var(--brand);color:#fff;border-color:var(--brand-dark)">Elegir archivos…<input type="file" data-files multiple accept=".xlsx,.xls,.csv,.txt,.ods,.json,.fdb" class="hidden"></label>
      </div>
      <div data-log style="margin:10px 0"></div>
      <div class="stats"><div class="stat"><div class="k">Productos</div><div class="v">${Store.productos.length}</div></div><div class="stat"><div class="k">Departamentos</div><div class="v">${Store.departamentos.length}</div></div><div class="stat"><div class="k">Clientes</div><div class="v">${Store.clientes.length}</div></div><div class="stat"><div class="k">Saldo por cobrar</div><div class="v">${U.money(U.sum(Store.clientes, c => c.saldo))}</div></div><div class="stat"><div class="k">Valor del inventario (costo)</div><div class="v">${U.money(U.sum(Store.productos.filter(p => p.usaInventario), p => Math.max(p.existencia, 0) * p.costo))}</div></div></div>
      <div class="grid2" style="align-items:start">
        <div class="panel"><h3>Cómo sacar los datos de eleventa</h3>
          <ol><li><b>Productos</b> (precios, existencias, departamentos): en eleventa entre a <b>F3 Productos → Exportar</b>, o a <b>F4 Inventario → Reporte de inventario → Exportar a Excel</b>.</li>
          <li><b>Clientes</b> (límite de crédito y lo que deben): en eleventa entre a <b>F2 Clientes → Exportar...</b>.</li>
          <li>Copie esos archivos con una memoria USB y arrástrelos al recuadro de arriba.</li></ol>
          <p class="muted small">Puede volver a cargarlos cuando quiera: lo que ya existe se actualiza y no se duplica.</p>
          <div class="toolbar"><button class="secondary" data-prod>Importar sólo productos</button><button class="secondary" data-cli>Importar sólo clientes</button><button class="secondary" data-plant>Plantilla de productos</button></div></div>
        <div class="panel"><h3>Copia completa de esta base de datos</h3>
          <p>Para pasar <b>todo</b> (productos, ventas, clientes, cortes y cajeros) a otra computadora con este programa, descargue una copia aquí y arrástrela al recuadro en la otra computadora.</p>
          <div class="toolbar"><button class="primary" data-down>Descargar copia completa</button><button class="secondary" data-xp>Exportar productos a Excel</button><button class="secondary" data-xc>Exportar clientes a Excel</button></div>
          <p class="muted small" data-ubic>Ubicación de los datos: cargando…</p></div>
      </div></div>`;
    const log = box.querySelector('[data-log]');
    const linea = (txt, cls = '') => log.insertAdjacentHTML('beforeend', `<p class="${cls}" style="margin:4px 0">${txt}</p>`);
    const procesar = async (files) => {
      log.innerHTML = '';
      for (const file of files) {
        const nombre = U.esc(file.name);
        const t = await Importar.tipoArchivo(file);
        if (t.tipo === 'productos') { linea(`📦 <b>${nombre}</b>: productos`); await Importar.abrir(file); }
        else if (t.tipo === 'clientes') { linea(`👥 <b>${nombre}</b>: clientes`); await Importar.clientes(file); }
        else if (t.tipo === 'respaldo') { linea(`💾 <b>${nombre}</b>: copia completa de este programa`); await Configuracion.restaurarRespaldo(t.dump); }
        else if (t.tipo === 'fdb') { linea(`🗄️ <b>${nombre}</b>: base de datos completa de eleventa`); await Configuracion.cargarEleventa(() => Configuracion.subirFdb(file)); }
        else linea(`⚠️ <b>${nombre}</b>: no se reconocieron columnas de productos ni de clientes. Ábralo con "Importar sólo productos" o "Importar sólo clientes" y elija las columnas a mano.`, 'warn');
      }
      const stats = box.querySelector('.stats');
      if (stats && App.current === 'configuracion') {
        const vals = [Store.productos.length, Store.departamentos.length, Store.clientes.length, U.money(U.sum(Store.clientes, c => c.saldo)), U.money(U.sum(Store.productos.filter(p => p.usaInventario), p => Math.max(p.existencia, 0) * p.costo))];
        stats.querySelectorAll('.v').forEach((v, i) => { v.textContent = vals[i]; });
      }
    };
    const drop = box.querySelector('[data-drop]');
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); procesar([...e.dataTransfer.files]); };
    box.querySelector('[data-files]').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; procesar(f); };
    box.querySelector('[data-fdb-buscar]').onclick = () => Configuracion.cargarEleventa(Configuracion.buscarFdb);
    box.querySelector('[data-fdb-file]').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) Configuracion.cargarEleventa(() => Configuracion.subirFdb(f)); };
    box.querySelector('[data-prod]').onclick = () => Importar.abrir();
    box.querySelector('[data-cli]').onclick = () => Importar.clientes();
    box.querySelector('[data-plant]').onclick = () => Importar.plantilla();
    box.querySelector('[data-down]').onclick = () => Configuracion.descargarRespaldo();
    box.querySelector('[data-xp]').onclick = () => Importar.exportar(Store.productos);
    box.querySelector('[data-xc]').onclick = () => U.exportXlsx('clientes.xlsx', Store.clientes.map(c => ({ Nombre: c.nombre, Telefono: c.telefono || '', Email: c.email || '', Direccion: c.direccion || '', RFC: c.rfc || '', 'Limite de credito': c.credito ? (c.limite > 0 ? c.limite : 'Sin limite') : 0, 'Saldo actual': c.saldo })), 'Clientes');
    try {
      const r = await Remote.get('/api/respaldos');
      const ult = r.archivos[0];
      box.querySelector('[data-ubic]').textContent = `Ubicación de los datos: ${r.carpeta.replace(/[\\/]respaldos$/, '')}${ult ? ` · Último respaldo automático: ${ult.nombre}` : ''}`;
    } catch (e) { box.querySelector('[data-ubic]').textContent = ''; }
  },

  /* ---------- Base completa de eleventa (PDVDATA.FDB) ---------- */
  esperando(texto) {
    const m = UI.modal({ title: 'Cargando base de datos', body: `<p data-t style="font-size:16px">${U.esc(texto)}</p><div style="height:10px;background:var(--line);border-radius:5px;overflow:hidden"><div data-bar style="height:100%;width:5%;background:var(--brand);transition:width .2s"></div></div><p class="muted small">No cierre el programa.</p>`, dismissable: false });
    m.q('[data-close]').classList.add('hidden');
    m.set = (t, pct) => { m.q('[data-t]').textContent = t; if (pct != null) m.q('[data-bar]').style.width = Math.max(5, Math.min(100, pct)) + '%'; };
    return m;
  },
  subirFdb(file, espera) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/eleventa/subir');
      xhr.setRequestHeader('X-Token', Remote.token || '');
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && espera) espera.set(`Enviando el archivo (${Math.round(e.loaded / 1048576)} de ${Math.round(e.total / 1048576)} MB)…`, e.loaded / e.total * 70); };
      xhr.upload.onload = () => { if (espera) espera.set('Leyendo productos, departamentos y clientes…', 85); };
      xhr.onload = () => {
        let body = null; try { body = JSON.parse(xhr.responseText); } catch (e) { /* sin JSON */ }
        if (xhr.status === 200) resolve(body); else reject(new Error((body && body.error) || `Error del servidor (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Se perdió la conexión con el servidor mientras se enviaba el archivo.'));
      xhr.send(file);
    });
  },
  async buscarFdb(espera) {
    espera.set('Buscando eleventa en la computadora principal…', 20);
    const { encontrados } = await Remote.get('/api/eleventa/buscar');
    if (!encontrados.length) throw new Error('No se encontró eleventa (PDVDATA.FDB) en la computadora principal.\n\nSi eleventa está en otra computadora, copie el archivo PDVDATA.FDB con una memoria USB (normalmente está en C:\\Program Files (x86)\\AbarrotesPDV\\db) y use "Elegir archivo PDVDATA.FDB…".');
    let ruta = encontrados[0].ruta;
    if (encontrados.length > 1) {
      espera.el.classList.add('hidden');
      const r = await UI.form('Se encontró más de una base de eleventa', [{ name: 'ruta', label: 'Elija cuál cargar', type: 'select', value: ruta, options: encontrados.sort((a, b) => b.modificado - a.modificado).map(x => ({ value: x.ruta, label: `${x.ruta} — ${(x.bytes / 1048576).toFixed(1)} MB — modificado ${U.fmtDateTime(x.modificado)}` })) }]);
      espera.el.classList.remove('hidden');
      if (!r) return null;
      ruta = r.ruta;
    }
    espera.set('Leyendo productos, departamentos y clientes…', 60);
    return Remote.post('/api/eleventa/leer-ruta', { ruta });
  },
  async cargarEleventa(obtener) {
    const espera = Configuracion.esperando('Preparando…');
    let data;
    try { data = await obtener(espera); }
    catch (e) { espera.close(); return UI.alert(e.message, 'No se pudo cargar la base de datos'); }
    espera.close();
    if (!data) return;
    await Configuracion.vistaPreviaEleventa(data);
    if (App.current === 'configuracion' && Configuracion.tab === 'basedatos') Configuracion.render(Configuracion.el);
  },
  vistaPreviaEleventa(data) {
    const { productos, clientes, resumen, avisos } = data;
    const nuevosP = productos.filter(p => !Store.findProducto(p.codigo)).length;
    const deuda = U.sum(clientes, c => c.saldo || 0);
    const valor = U.sum(productos.filter(p => p.usaInventario), p => Math.max(p.existencia || 0, 0) * p.costo);
    const m = UI.modal({
      title: 'Base de datos de eleventa encontrada', size: 'xwide',
      body: `<div class="stats"><div class="stat"><div class="k">Productos</div><div class="v">${productos.length}</div></div><div class="stat"><div class="k">Departamentos</div><div class="v">${data.departamentos.length}</div></div><div class="stat"><div class="k">Clientes</div><div class="v">${clientes.length}</div></div><div class="stat"><div class="k">Saldo por cobrar</div><div class="v">${U.money(deuda)}</div></div><div class="stat"><div class="k">Valor del inventario (costo)</div><div class="v">${U.money(valor)}</div></div></div>
        <p>${nuevosP} producto(s) nuevos y ${productos.length - nuevosP} que ya existen en este programa.${resumen.eliminados ? ` Se omiten ${resumen.eliminados} producto(s) que estaban eliminados en eleventa.` : ''}${resumen.ventasHistoricas ? ` El historial de ventas de eleventa (${resumen.ventasHistoricas} tickets) no se copia.` : ''}</p>
        ${avisos.length ? `<div class="panel" style="background:var(--warn-soft)">${avisos.map(a => `<p class="warn" style="margin:4px 0">⚠️ ${U.esc(a)}</p>`).join('')}</div>` : ''}
        <div class="grid2"><label>Si el producto o cliente ya existe<select data-exist><option value="actualizar">Actualizarlo con los datos de eleventa</option><option value="omitir">Dejarlo como está</option></select></label>
        <label>Existencias de eleventa<select data-sumar><option value="reemplazar">Reemplazan la existencia actual</option><option value="sumar">Se suman a la existencia actual</option></select></label></div>
        <div class="table-wrap" style="max-height:38vh"><table class="grid"><thead><tr><th>Código</th><th>Descripción</th><th>Departamento</th><th class="num">Costo</th><th class="num">Precio</th><th class="num">Mayoreo</th><th class="num">Existencia</th><th>Tipo</th></tr></thead><tbody>${productos.slice(0, 200).map(p => `<tr><td>${U.esc(p.codigo)}</td><td>${U.esc(p.descripcion)}</td><td>${U.esc(p.departamento || '')}</td><td class="num">${U.money(p.costo)}</td><td class="num">${U.money(p.precio)}</td><td class="num">${p.mayoreo ? U.money(p.mayoreo) : ''}</td><td class="num">${p.usaInventario ? U.qty(p.existencia || 0) : '—'}</td><td>${p.tipoVenta === 'G' ? 'Granel' : 'Unidad'}</td></tr>`).join('')}</tbody></table></div>
        ${productos.length > 200 ? `<p class="muted small">Se muestran 200 de ${productos.length} productos.</p>` : ''}
        <details><summary class="muted small">Detalles técnicos</summary><pre class="small" style="white-space:pre-wrap">${U.esc(JSON.stringify({ tablaProductos: resumen.tablaProductos, columnasProductos: resumen.columnasProductos, tablaClientes: resumen.tablaClientes, columnasClientes: resumen.columnasClientes, precio: resumen.precioUsado }, null, 1))}</pre></details>`,
      footer: `<button class="secondary" data-no>Cancelar</button><button class="primary big" data-ok>Cargar todo a este programa</button>`,
    });
    m.q('[data-no]').onclick = () => m.close(null);
    m.q('[data-ok]').onclick = async () => {
      const actualizar = m.q('[data-exist]').value === 'actualizar', sumar = m.q('[data-sumar]').value === 'sumar';
      m.close(true);
      const espera = Configuracion.esperando('Cargando productos…');
      try {
        espera.set(`Cargando ${productos.length} productos…`, 30);
        const rp = await Store.importarProductos(productos.map((p, i) => ({ ...p, _fila: i + 1 })), { actualizarExistentes: actualizar, sumarExistencia: sumar });
        espera.set(`Cargando ${clientes.length} clientes…`, 75);
        const rc = clientes.length ? await Store.importarClientes(clientes.map((c, i) => ({ ...c, _fila: i + 1 })), { actualizarExistentes: actualizar }) : { nuevos: 0, actualizados: 0, omitidos: 0, errores: [] };
        espera.close();
        const errores = [...rp.errores, ...rc.errores];
        await UI.alert(`¡Base de datos cargada!\n\nProductos nuevos: ${rp.nuevos}\nProductos actualizados: ${rp.actualizados}\nClientes nuevos: ${rc.nuevos}\nClientes actualizados: ${rc.actualizados}${errores.length ? `\n\nCon errores (${errores.length}):\n${errores.slice(0, 15).join('\n')}` : ''}`, 'Base de datos de eleventa');
      } catch (e) { espera.close(); UI.alert('Error al cargar: ' + e.message); }
    };
    return m.done;
  },

  async descargarRespaldo() {
    try { const dump = await Remote.get('/api/respaldo'); U.download(`respaldo-puntoventa-${U.today()}.json`, JSON.stringify(dump), 'application/json'); }
    catch (e) { UI.alert(e.message); }
  },
  async restaurarRespaldo(dump) {
    if (!dump || dump.app !== 'puntoventa' || !dump.data) return UI.alert('El archivo no es un respaldo válido.');
    const n = `${(dump.data.productos || []).length} productos, ${(dump.data.ventas || []).length} ventas, ${(dump.data.clientes || []).length} clientes`;
    if (!await UI.confirm(`¿Cargar la copia del ${dump.exportado ? U.fmtDateTime(Date.parse(dump.exportado)) : '?'} (${n})?\nToda la información actual será reemplazada en TODAS las cajas.`, { danger: true, ok: 'Cargar copia' })) return;
    try { await Remote.call('restaurar', [dump]); await UI.alert('Base de datos cargada. Vuelva a iniciar sesión.'); App.logout(); }
    catch (ex) { UI.alert(ex.message); }
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
    box.querySelector('[data-down]').onclick = () => Configuracion.descargarRespaldo();
    box.querySelector('[data-now]').onclick = async () => { try { const r = await Remote.post('/api/respaldos'); UI.toast('Respaldo creado: ' + r.archivo, 'ok'); lista(); } catch (e) { UI.alert(e.message); } };
    box.querySelector('[data-rest]').onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      let dump;
      try { dump = JSON.parse(await U.readFileAsText(file)); } catch (ex) { return UI.alert('El archivo no es un respaldo válido.'); }
      await Configuracion.restaurarRespaldo(dump);
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
