/* Importar y exportar productos desde Excel / CSV (compatible con el archivo que exporta eleventa) */
'use strict';

const Importar = {
  CAMPOS: [
    { k: 'codigo', label: 'Código', req: true, alias: ['codigo', 'codigodebarras', 'codigobarras', 'code', 'barcode', 'clave', 'sku', 'cod', 'codigoproducto'] },
    { k: 'descripcion', label: 'Descripción', req: true, alias: ['descripcion', 'nombre', 'articulo', 'producto', 'nombredelproducto', 'desc', 'descripciondelproducto'] },
    { k: 'costo', label: 'Precio costo', alias: ['preciocosto', 'costo', 'costounitario', 'preciodecosto', 'preciodecompra', 'compra', 'pcosto', 'costoproducto'] },
    { k: 'precio', label: 'Precio venta', req: true, alias: ['precioventa', 'preciodeventa', 'precio', 'venta', 'pventa', 'preciopublico', 'pvp', 'preciounitario'] },
    { k: 'mayoreo', label: 'Precio mayoreo', alias: ['preciomayoreo', 'preciodemayoreo', 'mayoreo', 'pmayoreo', 'preciomayorista', 'preciomayor'] },
    { k: 'departamento', label: 'Departamento', alias: ['departamento', 'depto', 'dpto', 'categoria', 'familia', 'linea', 'rubro'] },
    { k: 'existencia', label: 'Existencia (cantidad en inventario)', alias: ['existencia', 'existencias', 'stock', 'cantidad', 'hay', 'inventario', 'cantidadeninventario', 'invactual', 'cantidadinventario', 'stockteoricoeleventa'] },
    { k: 'minimo', label: 'Inventario mínimo', alias: ['invminimo', 'minimo', 'inventariominimo', 'existenciaminima', 'stockminimo', 'min', 'invmin'] },
    { k: 'maximo', label: 'Inventario máximo', alias: ['invmaximo', 'maximo', 'inventariomaximo', 'existenciamaxima', 'stockmaximo', 'max', 'invmax'] },
    { k: 'tipoVenta', label: 'Tipo de venta (unidad / granel)', alias: ['tipodeventa', 'tipoventa', 'tipo', 'sevende', 'unidad', 'unidaddemedida', 'unidadmedida'] },
    { k: 'usaInventario', label: 'Usa inventario (Sí / No)', alias: ['usainventario', 'inventariable', 'controlinventario', 'usarinventario', 'manejainventario'] },
  ],
  HEADERS: ['Código', 'Descripción', 'Precio Costo', 'Precio Venta', 'Precio Mayoreo', 'Departamento', 'Existencia', 'Inv. Mínimo', 'Inv. Máximo', 'Tipo de Venta', 'Usa Inventario'],

  exportar(lista) {
    const rows = lista.map(p => ({
      'Código': p.codigo, 'Descripción': p.descripcion, 'Precio Costo': Store.costoProducto(p), 'Precio Venta': p.precio, 'Precio Mayoreo': p.mayoreo || '',
      'Departamento': p.departamento, 'Existencia': p.usaInventario ? p.existencia : '', 'Inv. Mínimo': p.usaInventario ? p.minimo : '', 'Inv. Máximo': p.usaInventario ? p.maximo : '',
      'Tipo de Venta': { U: 'U', G: 'G', P: 'P' }[p.tipoVenta], 'Usa Inventario': p.usaInventario ? 'Si' : 'No',
    }));
    const ws = XLSX.utils.json_to_sheet(rows, { header: Importar.HEADERS });
    ws['!cols'] = Importar.HEADERS.map(h => ({ wch: h === 'Descripción' ? 44 : h === 'Departamento' ? 22 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');
    XLSX.writeFile(wb, `productos-${U.today()}.xlsx`);
  },

  plantilla() {
    const ws = XLSX.utils.aoa_to_sheet([
      Importar.HEADERS,
      ['7501055300075', 'REFRESCO COLA 600 ML', 12.5, 18, 17, 'BEBIDAS', 24, 6, 48, 'U', 'Si'],
      ['7501000111206', 'GALLETAS MARÍAS 170 G', 9.8, 14, '', 'GALLETAS', 30, 10, 60, 'U', 'Si'],
      ['FRIJOL', 'FRIJOL NEGRO A GRANEL (KG)', 24, 34, 32, 'GRANOS', 50.5, 10, 100, 'G', 'Si'],
      ['BOLSA', 'BOLSA DE REGALO', 0, 5, '', 'VARIOS', '', '', '', 'U', 'No'],
    ]);
    ws['!cols'] = Importar.HEADERS.map(h => ({ wch: h === 'Descripción' ? 34 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Productos');
    XLSX.writeFile(wb, 'plantilla-productos.xlsx');
  },

  async leerArchivo(file) {
    const ext = file.name.toLowerCase().split('.').pop();
    if (ext === 'csv' || ext === 'txt') {
      const buf = await U.readFileAsArrayBuffer(file);
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1252').decode(buf); }
      text = text.replace(/^﻿/, '');
      const first = text.split(/\r?\n/)[0] || '';
      const sep = [';', '\t', '|', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
      return XLSX.read(text, { type: 'string', FS: sep, raw: true });
    }
    return XLSX.read(await U.readFileAsArrayBuffer(file), { type: 'array', cellDates: false });
  },

  detectarEncabezado(aoa, campos = Importar.CAMPOS) {
    let best = { row: 0, score: -1 };
    for (let r = 0; r < Math.min(aoa.length, 25); r++) {
      const keys = (aoa[r] || []).map(U.normKey);
      const score = campos.reduce((s, c) => s + (keys.some(k => c.alias.includes(k)) ? 1 : 0), 0);
      if (score > best.score) best = { row: r, score };
    }
    return best.row;
  },
  autoMapa(headers, campos = Importar.CAMPOS) {
    const keys = headers.map(U.normKey);
    const mapa = {};
    const usados = new Set();
    for (const c of campos) {
      for (const a of c.alias) {
        const i = keys.findIndex((k, idx) => k === a && !usados.has(idx));
        if (i > -1) { mapa[c.k] = i; usados.add(i); break; }
      }
    }
    return mapa;
  },

  tipo(v) {
    const s = U.norm(v);
    if (!s) return undefined;
    if (/^(g|granel|kg|kilo|kilos|gramos|gr|lt|litro|litros|m|metro|metros|a granel)$/.test(s) || s.startsWith('granel')) return 'G';
    if (/^(p|paquete|kit|combo)$/.test(s)) return 'P';
    return 'U';
  },
  bool(v) {
    const s = U.norm(v);
    if (s === '') return undefined;
    return ['si', 's', 'yes', 'y', '1', 'true', 'verdadero', 'x'].includes(s);
  },

  construirFilas(aoa, headerRow, mapa) {
    const out = [], errores = [];
    const cel = (row, k) => (mapa[k] === undefined || mapa[k] === '' ? undefined : row[mapa[k]]);
    for (let r = headerRow + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      if (!row.some(x => String(x ?? '').trim() !== '')) continue;
      let codigo = cel(row, 'codigo');
      if (typeof codigo === 'number') codigo = Number.isInteger(codigo) ? codigo.toFixed(0) : String(codigo);
      codigo = String(codigo ?? '').trim();
      const descripcion = String(cel(row, 'descripcion') ?? '').trim();
      const fila = r + 1;
      if (!codigo && !descripcion) continue;
      if (!codigo) { errores.push(`Fila ${fila}: falta el código`); continue; }
      if (!descripcion) { errores.push(`Fila ${fila}: falta la descripción (${codigo})`); continue; }
      const numero = (k) => {
        const v = cel(row, k);
        if (v === undefined || String(v).trim() === '') return undefined;
        const n = U.num(v, NaN);
        if (!isFinite(n)) { errores.push(`Fila ${fila}: valor no numérico en ${k} ("${v}")`); return undefined; }
        return n;
      };
      const p = { _fila: fila, codigo, descripcion, costo: numero('costo'), precio: numero('precio'), mayoreo: numero('mayoreo'), existencia: numero('existencia'), minimo: numero('minimo'), maximo: numero('maximo') };
      const dep = cel(row, 'departamento');
      if (mapa.departamento !== undefined && mapa.departamento !== '') p.departamento = String(dep ?? '').trim();
      const t = Importar.tipo(cel(row, 'tipoVenta'));
      if (t) p.tipoVenta = t;
      const ui = Importar.bool(cel(row, 'usaInventario'));
      if (ui !== undefined) p.usaInventario = ui;
      else if (p.existencia !== undefined && !Store.findProducto(codigo)) p.usaInventario = true;
      if (p.usaInventario === false) delete p.existencia;
      for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
      out.push(p);
    }
    return { filas: out, errores };
  },

  async abrir(archivo) {
    const m = UI.modal({
      title: 'Importar productos desde Excel o CSV', size: 'xwide',
      body: `<div class="dropzone" data-drop>
          <p><b>Arrastre aquí el archivo de productos</b> (Excel .xlsx / .xls o .csv)<br><span class="muted">Puede usar el archivo que exporta eleventa: Productos → Exportar, o Inventario → Reporte de inventario → Exportar a Excel.</span></p>
          <input type="file" data-file accept=".xlsx,.xls,.csv,.txt,.ods">
          <p><button class="link" data-plantilla>Descargar plantilla de ejemplo</button></p>
        </div>
        <div data-paso2 class="hidden">
          <div class="row"><label style="max-width:260px">Hoja<select data-hoja></select></label><label style="max-width:200px">Fila de encabezados<input type="number" min="1" data-hrow></label></div>
          <h3>Relacione cada dato con la columna de su archivo</h3>
          <div class="grid3 map-table" data-map></div>
          <div class="grid2" style="margin-top:10px">
            <label>Si el código ya existe en el catálogo<select data-exist><option value="actualizar">Actualizar el producto con los datos del archivo</option><option value="omitir">Dejarlo como está (omitir)</option></select></label>
            <label>Existencia del archivo<select data-sumar><option value="reemplazar">Reemplaza la existencia actual</option><option value="sumar">Se suma a la existencia actual</option></select></label>
          </div>
          <h3>Vista previa</h3><p data-resumen></p>
          <div class="table-wrap" style="max-height:30vh"><table class="grid"><thead><tr><th>Fila</th><th>Código</th><th>Descripción</th><th class="num">Costo</th><th class="num">Venta</th><th class="num">Mayoreo</th><th>Depto.</th><th class="num">Existencia</th><th>Tipo</th><th>Estado</th></tr></thead><tbody data-prev></tbody></table></div>
          <p class="error small" data-errs></p>
        </div>`,
      footer: `<button class="secondary" data-no>Cancelar</button><button class="primary" data-ok disabled>Importar productos</button>`,
    });
    let wb = null, aoa = [], headerRow = 0, headers = [], mapa = {}, filas = [];
    const drop = m.q('[data-drop]');
    const cargar = async (file) => {
      if (!file) return;
      try { wb = await Importar.leerArchivo(file); }
      catch (e) { return UI.alert('No se pudo leer el archivo: ' + e.message); }
      m.q('[data-hoja]').innerHTML = wb.SheetNames.map(n => `<option>${U.esc(n)}</option>`).join('');
      drop.querySelector('p').innerHTML = `<b>Archivo:</b> ${U.esc(file.name)}`;
      m.q('[data-paso2]').classList.remove('hidden');
      hoja();
    };
    const hoja = () => {
      const ws = wb.Sheets[m.q('[data-hoja]').value];
      aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
      headerRow = Importar.detectarEncabezado(aoa);
      m.q('[data-hrow]').value = headerRow + 1;
      encabezados();
    };
    const encabezados = () => {
      headers = (aoa[headerRow] || []).map((h, i) => String(h || `Columna ${i + 1}`));
      mapa = Importar.autoMapa(headers);
      m.q('[data-map]').innerHTML = Importar.CAMPOS.map(c => `<label>${U.esc(c.label)}${c.req ? ' *' : ''}<select data-k="${c.k}"><option value="">— No importar —</option>${headers.map((h, i) => `<option value="${i}" ${mapa[c.k] === i ? 'selected' : ''}>${U.esc(h)}</option>`).join('')}</select></label>`).join('');
      m.qa('[data-k]').forEach(s => s.onchange = () => { mapa[s.dataset.k] = s.value === '' ? undefined : +s.value; preview(); });
      preview();
    };
    const preview = () => {
      const res = Importar.construirFilas(aoa, headerRow, mapa);
      filas = res.filas;
      const faltan = Importar.CAMPOS.filter(c => c.req && (mapa[c.k] === undefined) && !(c.k === 'precio')).map(c => c.label);
      const vistos = new Map();
      const dups = [];
      for (const f of filas) { const k = f.codigo.toLowerCase(); if (vistos.has(k)) dups.push(`Filas ${vistos.get(k)} y ${f._fila}: código repetido ${f.codigo}`); else vistos.set(k, f._fila); }
      const nuevos = filas.filter(f => !Store.findProducto(f.codigo)).length;
      m.q('[data-resumen]').innerHTML = `<b>${filas.length}</b> producto(s) leídos: <b>${nuevos}</b> nuevos y <b>${filas.length - nuevos}</b> que ya existen.${mapa.precio === undefined ? ' <span class="warn">No se eligió la columna de precio de venta: los nuevos quedarán con precio $0.</span>' : ''}`;
      m.q('[data-prev]').innerHTML = filas.slice(0, 100).map(f => `<tr><td>${f._fila}</td><td>${U.esc(f.codigo)}</td><td>${U.esc(f.descripcion)}</td><td class="num">${f.costo ?? ''}</td><td class="num">${f.precio ?? ''}</td><td class="num">${f.mayoreo ?? ''}</td><td>${U.esc(f.departamento ?? '')}</td><td class="num">${f.existencia ?? ''}</td><td>${f.tipoVenta || ''}</td><td>${Store.findProducto(f.codigo) ? '<span class="tag warn">Existe</span>' : '<span class="tag ok">Nuevo</span>'}</td></tr>`).join('');
      const errs = [...(faltan.length ? [`Falta elegir: ${faltan.join(', ')}`] : []), ...dups, ...res.errores];
      m.q('[data-errs]').innerHTML = errs.slice(0, 30).map(U.esc).join('<br>') + (errs.length > 30 ? `<br>... y ${errs.length - 30} más` : '');
      m.q('[data-ok]').disabled = !filas.length || faltan.length > 0 || dups.length > 0;
      m.q('[data-ok]').textContent = `Importar ${filas.length} productos`;
    };
    m.q('[data-file]').onchange = (e) => cargar(e.target.files[0]);
    m.q('[data-plantilla]').onclick = () => Importar.plantilla();
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); cargar(e.dataTransfer.files[0]); };
    m.q('[data-hoja]').onchange = hoja;
    m.q('[data-hrow]').onchange = () => { headerRow = Math.max(0, (parseInt(m.q('[data-hrow]').value, 10) || 1) - 1); encabezados(); };
    m.q('[data-no]').onclick = () => m.close(null);
    m.q('[data-ok]').onclick = async () => {
      const btn = m.q('[data-ok]');
      btn.disabled = true; btn.textContent = 'Importando...';
      try {
        const r = await Store.importarProductos(filas, { actualizarExistentes: m.q('[data-exist]').value === 'actualizar', sumarExistencia: m.q('[data-sumar]').value === 'sumar' });
        await UI.alert(`Importación terminada.\n\nProductos nuevos: ${r.nuevos}\nProductos actualizados: ${r.actualizados}\nOmitidos: ${r.omitidos}${r.errores.length ? `\n\nCon errores (${r.errores.length}):\n${r.errores.slice(0, 15).join('\n')}` : ''}`, 'Importar productos');
        m.close(r);
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Importar productos';
        UI.alert('Error al importar: ' + e.message);
      }
    };
    if (archivo) cargar(archivo);
    return m.done;
  },

  /* ---------- Clientes (archivo "Exportar clientes" de eleventa) ---------- */
  CAMPOS_CLIENTES: [
    { k: 'nombre', label: 'Nombre', req: true, alias: ['nombre', 'cliente', 'nombrecliente', 'nombredelcliente', 'razonsocial', 'nombrecompleto'] },
    { k: 'telefono', label: 'Teléfono', alias: ['telefono', 'tel', 'telefonos', 'celular', 'movil', 'telefono1'] },
    { k: 'direccion', label: 'Dirección', alias: ['direccion', 'domicilio', 'calle', 'direccioncompleta'] },
    { k: 'email', label: 'Correo', alias: ['email', 'correo', 'correoelectronico', 'mail', 'emailfacturacion'] },
    { k: 'rfc', label: 'RFC / RUT', alias: ['rfc', 'rut', 'nit', 'cuit'] },
    { k: 'limite', label: 'Límite de crédito', alias: ['limitedecredito', 'limitecredito', 'limite', 'credito', 'creditomaximo'] },
    { k: 'saldo', label: 'Saldo actual (lo que debe)', alias: ['saldoactual', 'saldo', 'adeudo', 'debe', 'saldopendiente', 'deuda'] },
    { k: 'notas', label: 'Notas', alias: ['notas', 'observaciones', 'comentarios', 'nota'] },
  ],

  async clientes(archivo) {
    const C = Importar.CAMPOS_CLIENTES;
    const m = UI.modal({
      title: 'Importar clientes desde Excel o CSV', size: 'xwide',
      body: `<div class="dropzone" data-drop><p><b>Arrastre aquí el archivo de clientes</b><br><span class="muted">En eleventa: F2 Clientes → Exportar... (incluye límite de crédito y saldo actual).</span></p><input type="file" data-file accept=".xlsx,.xls,.csv,.txt,.ods"></div>
        <div data-paso2 class="hidden">
          <div class="row"><label style="max-width:260px">Hoja<select data-hoja></select></label><label style="max-width:200px">Fila de encabezados<input type="number" min="1" data-hrow></label>
          <label>Si el cliente ya existe (mismo nombre)<select data-exist><option value="actualizar">Actualizar sus datos y saldo</option><option value="omitir">Dejarlo como está</option></select></label></div>
          <h3>Relacione cada dato con la columna de su archivo</h3><div class="grid4 map-table" data-map></div>
          <h3>Vista previa</h3><p data-resumen></p>
          <div class="table-wrap" style="max-height:30vh"><table class="grid"><thead><tr><th>Fila</th><th>Nombre</th><th>Teléfono</th><th>Dirección</th><th class="num">Límite</th><th class="num">Saldo</th><th>Estado</th></tr></thead><tbody data-prev></tbody></table></div>
          <p class="error small" data-errs></p></div>`,
      footer: `<button class="secondary" data-no>Cancelar</button><button class="primary" data-ok disabled>Importar clientes</button>`,
    });
    let wb = null, aoa = [], headerRow = 0, mapa = {}, filas = [];
    const cel = (row, k) => (mapa[k] === undefined ? undefined : row[mapa[k]]);
    const construir = () => {
      const out = [], errs = [];
      for (let r = headerRow + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        if (!row.some(x => String(x ?? '').trim() !== '')) continue;
        const nombre = String(cel(row, 'nombre') ?? '').trim();
        if (!nombre) { errs.push(`Fila ${r + 1}: falta el nombre`); continue; }
        const f = { _fila: r + 1, nombre };
        for (const k of ['telefono', 'direccion', 'email', 'rfc', 'notas']) { const v = cel(row, k); if (v !== undefined && String(v).trim() !== '') f[k] = String(v).trim(); }
        const lim = cel(row, 'limite');
        if (lim !== undefined && String(lim).trim() !== '') {
          if (/sin\s*l[ií]mite|ilimitado/i.test(String(lim))) f.sinLimite = true;
          else { const n = U.num(lim, NaN); if (isFinite(n)) f.limite = n; else errs.push(`Fila ${r + 1}: límite no numérico ("${lim}")`); }
        }
        const sal = cel(row, 'saldo');
        if (sal !== undefined && String(sal).trim() !== '') { const n = U.num(sal, NaN); if (isFinite(n)) f.saldo = n; else errs.push(`Fila ${r + 1}: saldo no numérico ("${sal}")`); }
        out.push(f);
      }
      return { out, errs };
    };
    const preview = () => {
      const { out, errs } = construir();
      filas = out;
      const nuevos = filas.filter(f => !Store.clientes.some(c => U.norm(c.nombre) === U.norm(f.nombre))).length;
      const deuda = U.sum(filas, f => f.saldo || 0);
      m.q('[data-resumen]').innerHTML = `<b>${filas.length}</b> cliente(s): <b>${nuevos}</b> nuevos y <b>${filas.length - nuevos}</b> que ya existen. Saldo total por cobrar en el archivo: <b>${U.money(deuda)}</b>.`;
      m.q('[data-prev]').innerHTML = filas.slice(0, 100).map(f => `<tr><td>${f._fila}</td><td>${U.esc(f.nombre)}</td><td>${U.esc(f.telefono || '')}</td><td>${U.esc(f.direccion || '')}</td><td class="num">${f.sinLimite ? 'Sin límite' : f.limite ?? ''}</td><td class="num">${f.saldo ?? ''}</td><td>${Store.clientes.some(c => U.norm(c.nombre) === U.norm(f.nombre)) ? '<span class="tag warn">Existe</span>' : '<span class="tag ok">Nuevo</span>'}</td></tr>`).join('');
      const all = [...(mapa.nombre === undefined ? ['Falta elegir la columna Nombre'] : []), ...errs];
      m.q('[data-errs]').innerHTML = all.slice(0, 30).map(U.esc).join('<br>');
      m.q('[data-ok]').disabled = !filas.length || mapa.nombre === undefined;
      m.q('[data-ok]').textContent = `Importar ${filas.length} clientes`;
    };
    const encabezados = () => {
      const headers = (aoa[headerRow] || []).map((h, i) => String(h || `Columna ${i + 1}`));
      mapa = Importar.autoMapa(headers, C);
      m.q('[data-map]').innerHTML = C.map(c => `<label>${U.esc(c.label)}${c.req ? ' *' : ''}<select data-k="${c.k}"><option value="">— No importar —</option>${headers.map((h, i) => `<option value="${i}" ${mapa[c.k] === i ? 'selected' : ''}>${U.esc(h)}</option>`).join('')}</select></label>`).join('');
      m.qa('[data-k]').forEach(s => s.onchange = () => { mapa[s.dataset.k] = s.value === '' ? undefined : +s.value; preview(); });
      preview();
    };
    const hoja = () => {
      aoa = XLSX.utils.sheet_to_json(wb.Sheets[m.q('[data-hoja]').value], { header: 1, raw: true, defval: '' });
      headerRow = Importar.detectarEncabezado(aoa, C);
      m.q('[data-hrow]').value = headerRow + 1;
      encabezados();
    };
    const cargar = async (file) => {
      if (!file) return;
      try { wb = await Importar.leerArchivo(file); } catch (e) { return UI.alert('No se pudo leer el archivo: ' + e.message); }
      m.q('[data-hoja]').innerHTML = wb.SheetNames.map(n => `<option>${U.esc(n)}</option>`).join('');
      m.q('[data-drop] p').innerHTML = `<b>Archivo:</b> ${U.esc(file.name)}`;
      m.q('[data-paso2]').classList.remove('hidden');
      hoja();
    };
    const drop = m.q('[data-drop]');
    m.q('[data-file]').onchange = (e) => cargar(e.target.files[0]);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); cargar(e.dataTransfer.files[0]); };
    m.q('[data-hoja]').onchange = hoja;
    m.q('[data-hrow]').onchange = () => { headerRow = Math.max(0, (parseInt(m.q('[data-hrow]').value, 10) || 1) - 1); encabezados(); };
    m.q('[data-no]').onclick = () => m.close(null);
    m.q('[data-ok]').onclick = async () => {
      const btn = m.q('[data-ok]'); btn.disabled = true; btn.textContent = 'Importando...';
      try {
        const r = await Store.importarClientes(filas, { actualizarExistentes: m.q('[data-exist]').value === 'actualizar' });
        await UI.alert(`Importación de clientes terminada.\n\nNuevos: ${r.nuevos}\nActualizados: ${r.actualizados}\nOmitidos: ${r.omitidos}${r.errores.length ? `\n\nCon errores (${r.errores.length}):\n${r.errores.slice(0, 15).join('\n')}` : ''}`, 'Importar clientes');
        m.close(r);
      } catch (e) { btn.disabled = false; btn.textContent = 'Importar clientes'; UI.alert('Error al importar: ' + e.message); }
    };
    if (archivo) cargar(archivo);
    return m.done;
  },

  /* Reconoce qué contiene un archivo: productos, clientes, respaldo de este programa o la base interna de eleventa */
  async tipoArchivo(file) {
    const ext = file.name.toLowerCase().split('.').pop();
    if (['fdb', 'gdb', 'fbk'].includes(ext)) return { tipo: 'fdb' };
    if (ext === 'json') {
      try { const dump = JSON.parse(await U.readFileAsText(file)); if (dump && dump.app === 'puntoventa' && dump.data) return { tipo: 'respaldo', dump }; } catch (e) { /* no es JSON válido */ }
      return { tipo: 'desconocido' };
    }
    let wb;
    try { wb = await Importar.leerArchivo(file); } catch (e) { return { tipo: 'desconocido' }; }
    const puntaje = (campos) => {
      let mejor = 0;
      for (const n of wb.SheetNames) {
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }).slice(0, 25);
        for (const row of aoa) {
          const keys = (row || []).map(U.normKey);
          mejor = Math.max(mejor, campos.reduce((t, c) => t + (keys.some(k => c.alias.includes(k)) ? (c.req ? 2 : 1) : 0), 0));
        }
      }
      return mejor;
    };
    const p = puntaje(Importar.CAMPOS), c = puntaje(Importar.CAMPOS_CLIENTES);
    if (p < 3 && c < 3) return { tipo: 'desconocido' };
    return { tipo: p >= c ? 'productos' : 'clientes' };
  },
};
