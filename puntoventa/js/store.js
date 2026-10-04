/* Estado en memoria + reglas del negocio (ventas, inventario, créditos, caja) */
'use strict';

const PERMISOS = [
  ['vender', 'Realizar ventas'],
  ['descuentos', 'Aplicar mayoreo, descuentos y cambiar precios'],
  ['cancelar', 'Devoluciones y cancelación de ventas'],
  ['entradasSalidas', 'Registrar entradas y salidas de efectivo'],
  ['clientes', 'Administrar clientes'],
  ['creditos', 'Vender a crédito y recibir abonos'],
  ['productos', 'Crear, modificar y eliminar productos'],
  ['inventario', 'Agregar y ajustar inventario'],
  ['reportes', 'Ver reportes y ganancias'],
  ['corte', 'Hacer corte de caja'],
  ['configuracion', 'Configuración del sistema y cajeros'],
];

const TIPOS_VENTA = { U: 'Unidad / Pieza', G: 'Granel (kg, lt, m)', P: 'Paquete / Kit' };

const DEFAULT_CONFIG = {
  negocio: { nombre: 'Mi Negocio', direccion: '', telefono: '', rfc: '' },
  moneda: '$',
  ticket: {
    encabezado: '', pie: '¡Gracias por su compra!', ancho: '80', logo: '',
    mostrarCajero: true, mostrarCliente: true, mostrarAhorro: true, imprimirAuto: true, copias: 1,
  },
  impuestos: { usar: false, porcentaje: 16, nombre: 'IVA' },
  mayoreoAutomatico: false,
  venderSinExistencia: true,
  pedirFondo: true,
  comisionTarjeta: 0,
  redondeo: false,
};

const Store = {
  config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
  usuarios: [],
  departamentos: [],
  productos: [],
  byId: new Map(),
  byCodigo: new Map(),
  clientes: [],
  promociones: [],
  seq: {},
  turno: null,
  user: null,
  caja: 'Caja 1',
  tickets: null,

  async load() {
    const meta = await DB.all('meta');
    for (const m of meta) {
      if (m.key === 'config') Store.config = Store.mergeConfig(m.value);
      else if (m.key.startsWith('seq:')) Store.seq[m.key.slice(4)] = m.value;
      else if (m.key === 'tickets') Store.tickets = m.value;
    }
    Store.usuarios = await DB.all('usuarios');
    Store.departamentos = (await DB.all('departamentos')).sort((a, b) => a.nombre.localeCompare(b.nombre));
    Store.productos = await DB.all('productos');
    Store.reindex();
    Store.clientes = (await DB.all('clientes')).sort((a, b) => a.nombre.localeCompare(b.nombre));
    Store.promociones = await DB.all('promociones');
    const turnos = await DB.all('turnos');
    Store.turno = turnos.find(t => !t.cerrado) || null;

    if (!Store.usuarios.length) {
      const admin = { id: Store.nextId('usuarios'), nombre: 'Administrador', usuario: 'admin', password: await U.hash(''), admin: true, permisos: {}, activo: true };
      await DB.batch([{ store: 'usuarios', op: 'put', value: admin }, Store.seqOp('usuarios'), { store: 'meta', op: 'put', value: { key: 'config', value: Store.config } }]);
      Store.usuarios.push(admin);
    }
  },

  mergeConfig(v) {
    const base = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    for (const k of Object.keys(v || {})) {
      if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) Object.assign(base[k], v[k]);
      else base[k] = v[k];
    }
    return base;
  },
  async saveConfig() { await DB.put('meta', { key: 'config', value: Store.config }); },

  reindex() {
    Store.byId = new Map(Store.productos.map(p => [p.id, p]));
    Store.byCodigo = new Map(Store.productos.map(p => [String(p.codigo).toLowerCase(), p]));
  },

  nextId(store) {
    Store.seq[store] = (Store.seq[store] || 0) + 1;
    return Store.seq[store];
  },
  seqOp(store) { return { store: 'meta', op: 'put', value: { key: 'seq:' + store, value: Store.seq[store] || 0 } }; },

  can(perm) {
    if (!Store.user) return false;
    return !!(Store.user.admin || (Store.user.permisos && Store.user.permisos[perm]));
  },

  saveTickets: U.debounce(() => { DB.put('meta', { key: 'tickets', value: Store.tickets }).catch(console.error); }, 300),

  /* ---------------- Productos ---------------- */
  findProducto(codigo) { return Store.byCodigo.get(String(codigo).trim().toLowerCase()); },

  buscarProductos(texto, limit = 200) {
    const q = U.norm(texto);
    if (!q) return Store.productos.slice().sort((a, b) => a.descripcion.localeCompare(b.descripcion)).slice(0, limit);
    const words = q.split(/\s+/);
    const out = [];
    for (const p of Store.productos) {
      const hay = U.norm(p.codigo + ' ' + p.descripcion + ' ' + (p.departamento || ''));
      if (words.every(w => hay.includes(w))) out.push(p);
    }
    out.sort((a, b) => {
      const ae = U.norm(a.codigo) === q ? 0 : 1, be = U.norm(b.codigo) === q ? 0 : 1;
      return ae - be || a.descripcion.localeCompare(b.descripcion);
    });
    return out.slice(0, limit);
  },

  normalizarProducto(p) {
    const tipo = ['U', 'G', 'P'].includes(p.tipoVenta) ? p.tipoVenta : 'U';
    return {
      id: p.id,
      codigo: String(p.codigo ?? '').trim(),
      descripcion: String(p.descripcion ?? '').trim(),
      tipoVenta: tipo,
      costo: U.round2(U.num(p.costo)),
      precio: U.round2(U.num(p.precio)),
      mayoreo: U.round2(U.num(p.mayoreo)),
      mayoreoDesde: U.num(p.mayoreoDesde),
      departamento: String(p.departamento ?? '').trim(),
      usaInventario: p.usaInventario !== false && tipo !== 'P',
      existencia: U.round3(U.num(p.existencia)),
      minimo: U.round3(U.num(p.minimo)),
      maximo: U.round3(U.num(p.maximo)),
      componentes: tipo === 'P' ? (p.componentes || []).filter(c => c.id && U.num(c.cantidad) > 0).map(c => ({ id: c.id, cantidad: U.num(c.cantidad) })) : [],
      impuesto: p.impuesto !== false,
      creado: p.creado || Date.now(),
      modificado: Date.now(),
    };
  },

  validarProducto(p, originalId) {
    if (!p.codigo) throw new Error('El código es obligatorio.');
    if (!p.descripcion) throw new Error('La descripción es obligatoria.');
    const dup = Store.findProducto(p.codigo);
    if (dup && dup.id !== originalId) throw new Error(`Ya existe un producto con el código "${p.codigo}": ${dup.descripcion}`);
    if (p.precio < 0 || p.costo < 0 || p.mayoreo < 0) throw new Error('Los precios no pueden ser negativos.');
    if (p.tipoVenta === 'P' && !p.componentes.length) throw new Error('Un paquete debe tener al menos un producto.');
    if (p.componentes.some(c => c.id === originalId)) throw new Error('Un paquete no puede contenerse a sí mismo.');
  },

  async guardarProducto(input) {
    const orig = input.id ? Store.byId.get(input.id) : null;
    const p = Store.normalizarProducto({ ...orig, ...input });
    Store.validarProducto(p, orig ? orig.id : null);
    const ops = [];
    if (!orig) {
      p.id = Store.nextId('productos');
      ops.push(Store.seqOp('productos'));
      if (p.usaInventario && p.existencia) ops.push(...Store._movInvOps(p, 'alta', p.existencia, 0, 'Alta de producto'));
    } else {
      p.existencia = orig.existencia; // la existencia sólo cambia por movimientos de inventario
      p.creado = orig.creado;
      const cambios = [['costo', 'Costo'], ['precio', 'Precio'], ['mayoreo', 'Mayoreo']].filter(([k]) => orig[k] !== p[k]).map(([k, n]) => `${n}: ${U.money(orig[k])} → ${U.money(p[k])}`);
      if (cambios.length) ops.push(...Store._movInvOps(p, 'precio', 0, p.existencia, cambios.join(', ')));
    }
    Store.ensureDepartamentoOps(p.departamento, ops);
    ops.push({ store: 'productos', op: 'put', value: p });
    await DB.batch(ops);
    if (orig) Object.keys(orig).forEach(k => delete orig[k]);
    if (orig) Object.assign(orig, p); else Store.productos.push(p);
    Store.reindex();
    return orig || p;
  },

  /* Modifica varios productos a la vez; fn(copia) cambia la copia */
  ACCIONES_VARIOS: {
    departamento: (c, v) => { c.departamento = String(v || '').trim(); },
    aumentarPrecio: (c, v) => { c.precio = U.round2(c.precio * (1 + U.num(v) / 100)); },
    disminuirPrecio: (c, v) => { c.precio = U.round2(c.precio * (1 - U.num(v) / 100)); },
    ganancia: (c, v) => { if (c.costo > 0) c.precio = U.round2(c.costo * (1 + U.num(v) / 100)); },
    precio: (c, v) => { c.precio = U.round2(U.num(v)); },
    aumentarCosto: (c, v) => { c.costo = U.round2(c.costo * (1 + U.num(v) / 100)); },
    mayoreoPct: (c, v) => { c.mayoreo = U.num(v) > 0 ? U.round2(c.precio * (1 - U.num(v) / 100)) : 0; },
    usaInventario: (c, v) => { c.usaInventario = v === true || v === 'si' || v === 'true'; },
    minimo: (c, v) => { c.minimo = U.num(v); },
    maximo: (c, v) => { c.maximo = U.num(v); },
    tipoVenta: (c, v) => { if (v === 'U' || v === 'G') c.tipoVenta = v; },
  },

  /* Modifica varios productos a la vez con una de las ACCIONES_VARIOS */
  async actualizarVarios(ids, accion, valor) {
    const fn = Store.ACCIONES_VARIOS[accion];
    if (!fn) throw new Error('Acción no válida.');
    const ops = [], nuevos = [];
    for (const id of ids) {
      const orig = Store.byId.get(id);
      if (!orig) continue;
      if (orig.tipoVenta === 'P' && accion === 'tipoVenta') continue;
      const c = { ...orig };
      fn(c, valor);
      const p = Store.normalizarProducto(c);
      p.id = orig.id; p.creado = orig.creado; p.existencia = orig.existencia;
      if (orig.tipoVenta === 'P') p.componentes = orig.componentes;
      const cambios = [['costo', 'Costo'], ['precio', 'Precio'], ['mayoreo', 'Mayoreo']].filter(([k]) => orig[k] !== p[k]).map(([k, n]) => `${n}: ${U.money(orig[k])} → ${U.money(p[k])}`);
      if (cambios.length) ops.push(...Store._movInvOps(p, 'precio', 0, p.existencia, cambios.join(', ') + ' (actualización masiva)'));
      Store.ensureDepartamentoOps(p.departamento, ops);
      ops.push({ store: 'productos', op: 'put', value: p });
      nuevos.push([orig, p]);
    }
    await DB.batch(ops);
    for (const [orig, p] of nuevos) { Object.keys(orig).forEach(k => delete orig[k]); Object.assign(orig, p); }
    Store.reindex();
    return nuevos.length;
  },

  async eliminarProducto(id) {
    const usado = Store.productos.find(p => p.componentes && p.componentes.some(c => c.id === id));
    if (usado) throw new Error(`No se puede eliminar: forma parte del paquete "${usado.descripcion}".`);
    await DB.batch([{ store: 'productos', op: 'delete', key: id }, ...Store.promociones.filter(x => x.productoId === id).map(x => ({ store: 'promociones', op: 'delete', key: x.id }))]);
    Store.productos = Store.productos.filter(p => p.id !== id);
    Store.promociones = Store.promociones.filter(x => x.productoId !== id);
    Store.reindex();
  },

  async guardarDepartamento(id, nombre) {
    nombre = String(nombre || '').trim();
    if (!nombre) throw new Error('Escriba el nombre del departamento.');
    const dup = Store.departamentos.find(d => U.norm(d.nombre) === U.norm(nombre) && d.id !== id);
    if (dup) throw new Error('Ya existe ese departamento.');
    const ops = [];
    if (!id) {
      const d = { id: Store.nextId('departamentos'), nombre };
      ops.push({ store: 'departamentos', op: 'put', value: d }, Store.seqOp('departamentos'));
      await DB.batch(ops);
      Store.departamentos.push(d);
    } else {
      const d = Store.departamentos.find(x => x.id === id);
      const anterior = d.nombre;
      const afectados = Store.productos.filter(p => p.departamento === anterior).map(p => ({ ...p, departamento: nombre }));
      ops.push({ store: 'departamentos', op: 'put', value: { ...d, nombre } }, ...afectados.map(p => ({ store: 'productos', op: 'put', value: p })));
      await DB.batch(ops);
      d.nombre = nombre;
      for (const p of afectados) Store.byId.get(p.id).departamento = nombre;
    }
    Store.departamentos.sort((a, b) => a.nombre.localeCompare(b.nombre));
  },
  async eliminarDepartamento(id) {
    const d = Store.departamentos.find(x => x.id === id);
    if (!d) return;
    const afectados = Store.productos.filter(p => p.departamento === d.nombre).map(p => ({ ...p, departamento: '' }));
    await DB.batch([{ store: 'departamentos', op: 'delete', key: id }, ...afectados.map(p => ({ store: 'productos', op: 'put', value: p }))]);
    for (const p of afectados) Store.byId.get(p.id).departamento = '';
    Store.departamentos = Store.departamentos.filter(x => x.id !== id);
  },

  ensureDepartamentoOps(nombre, ops) {
    if (!nombre) return;
    if (Store.departamentos.some(d => U.norm(d.nombre) === U.norm(nombre))) return;
    const d = { id: Store.nextId('departamentos'), nombre };
    Store.departamentos.push(d);
    Store.departamentos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    ops.push({ store: 'departamentos', op: 'put', value: d }, Store.seqOp('departamentos'));
  },

  _movInvOps(p, tipo, cantidad, antes, nota, ref) {
    const m = {
      id: Store.nextId('movinv'), ts: Date.now(), productoId: p.id, codigo: p.codigo, descripcion: p.descripcion,
      tipo, cantidad: U.round3(cantidad), antes: U.round3(antes), despues: U.round3(antes + cantidad),
      costo: p.costo, nota: nota || '', ref: ref || null, usuario: Store.user ? Store.user.nombre : '',
    };
    return [{ store: 'movinv', op: 'put', value: m }, Store.seqOp('movinv')];
  },

  /* Cambia existencias (en memoria sobre copias) y acumula operaciones */
  _stockChange(ops, touched, prodId, delta, tipo, nota, ref) {
    const base = Store.byId.get(prodId);
    if (!base) return;
    if (base.tipoVenta === 'P') {
      for (const c of base.componentes) Store._stockChange(ops, touched, c.id, delta * c.cantidad, tipo, nota ? `${nota} (paquete ${base.codigo})` : `Paquete ${base.codigo}`, ref);
      return;
    }
    if (!base.usaInventario) return;
    const p = touched.get(prodId) || { ...base };
    touched.set(prodId, p);
    const antes = p.existencia;
    p.existencia = U.round3(p.existencia + delta);
    ops.push(...Store._movInvOps(p, tipo, delta, antes, nota, ref));
  },
  _commitTouched(ops, touched) {
    for (const p of touched.values()) ops.push({ store: 'productos', op: 'put', value: p });
  },
  _applyTouched(touched) {
    for (const p of touched.values()) Object.assign(Store.byId.get(p.id), p);
  },

  async movimientoInventario(prodId, delta, tipo, nota, cambios) {
    const ops = [], touched = new Map();
    Store._stockChange(ops, touched, prodId, delta, tipo, nota);
    if (cambios) {
      const p = touched.get(prodId) || { ...Store.byId.get(prodId) };
      const txt = [['costo', 'Costo'], ['precio', 'Precio'], ['mayoreo', 'Mayoreo']].filter(([k]) => cambios[k] !== undefined && cambios[k] !== p[k]).map(([k, n]) => `${n}: ${U.money(p[k])} → ${U.money(cambios[k])}`);
      Object.assign(p, cambios, { modificado: Date.now() });
      if (txt.length) ops.push(...Store._movInvOps(p, 'precio', 0, p.existencia, txt.join(', ')));
      touched.set(prodId, p);
    }
    Store._commitTouched(ops, touched);
    await DB.batch(ops);
    Store._applyTouched(touched);
  },

  /* Merma: producto que se pierde (vencido, dañado, robo, consumo interno...). Descuenta inventario y guarda el costo perdido. */
  MOTIVOS_MERMA: ['Vencido / caducado', 'Dañado / roto', 'Robo / faltante', 'Consumo interno', 'Degustación / muestra', 'Mal estado / descompuesto', 'Otro'],
  async registrarMerma(prodId, cantidad, motivo, nota) {
    const p = Store.byId.get(prodId);
    const q = U.round3(U.num(cantidad));
    if (!p) throw new Error('Producto no encontrado.');
    if (!(q > 0)) throw new Error('Indique una cantidad mayor a cero.');
    if (p.tipoVenta !== 'P' && !p.usaInventario) throw new Error(`"${p.descripcion}" no utiliza inventario.`);
    motivo = Store.MOTIVOS_MERMA.includes(motivo) ? motivo : 'Otro';
    const ops = [], touched = new Map();
    Store._stockChange(ops, touched, prodId, -q, 'merma', motivo + (nota ? ' - ' + nota : ''));
    let costo = 0;
    for (const o of ops) if (o.store === 'movinv') { o.value.motivo = motivo; o.value.costoTotal = U.round2(-o.value.cantidad * o.value.costo); costo += o.value.costoTotal; }
    Store._commitTouched(ops, touched);
    await DB.batch(ops);
    Store._applyTouched(touched);
    return { costo: U.round2(costo), existencia: p.tipoVenta === 'P' ? null : Store.byId.get(prodId).existencia };
  },

  /* Importación masiva: filas ya normalizadas */
  async importarProductos(rows, { actualizarExistentes = true, sumarExistencia = false } = {}) {
    const ops = [];
    let nuevos = 0, actualizados = 0, omitidos = 0;
    const errores = [];
    const vistos = new Set();
    for (const [i, r] of rows.entries()) {
      try {
        const key = String(r.codigo).trim().toLowerCase();
        if (vistos.has(key)) throw new Error(`código repetido en el archivo (${r.codigo})`);
        vistos.add(key);
        const orig = Store.findProducto(r.codigo);
        if (orig && !actualizarExistentes) { omitidos++; continue; }
        const merged = { ...(orig || {}) };
        for (const [k, v] of Object.entries(r)) if (v !== undefined && v !== '') merged[k] = v;
        if (orig && r.departamento === undefined) merged.departamento = orig.departamento;
        const p = Store.normalizarProducto(merged);
        if (p.tipoVenta === 'P' && !p.componentes.length) { p.tipoVenta = 'U'; p.usaInventario = true; }
        if (!p.codigo) throw new Error('sin código');
        if (!p.descripcion) throw new Error('sin descripción');
        Store.ensureDepartamentoOps(p.departamento, ops);
        if (orig) {
          p.id = orig.id; p.creado = orig.creado;
          const nueva = r.existencia === undefined || r.existencia === '' ? orig.existencia : (sumarExistencia ? orig.existencia + U.num(r.existencia) : U.num(r.existencia));
          p.existencia = U.round3(nueva);
          if (p.usaInventario && p.existencia !== orig.existencia) ops.push(...Store._movInvOps(p, 'importacion', p.existencia - orig.existencia, orig.existencia, 'Importación desde archivo'));
          Object.keys(orig).forEach(k => delete orig[k]);
          Object.assign(orig, p);
          actualizados++;
        } else {
          p.id = Store.nextId('productos');
          if (p.usaInventario && p.existencia) ops.push(...Store._movInvOps(p, 'importacion', p.existencia, 0, 'Importación desde archivo'));
          Store.productos.push(p);
          Store.byCodigo.set(key, p);
          nuevos++;
        }
        ops.push({ store: 'productos', op: 'put', value: orig || p });
      } catch (e) {
        errores.push(`Fila ${r._fila || i + 2}: ${e.message}`);
      }
    }
    ops.push(Store.seqOp('productos'));
    await DB.batch(ops);
    Store.reindex();
    return { nuevos, actualizados, omitidos, errores };
  },

  /* ---------------- Promociones ---------------- */
  promocionesDe(prodId) {
    const hoy = U.today();
    return Store.promociones.filter(x => x.productoId === prodId && x.activa !== false && (!x.desde || x.desde <= hoy) && (!x.hasta_f || x.hasta_f >= hoy));
  },
  async guardarPromocion(x) {
    const ops = [];
    if (!x.id) { x.id = Store.nextId('promociones'); ops.push(Store.seqOp('promociones')); Store.promociones.push(x); }
    else Object.assign(Store.promociones.find(y => y.id === x.id), x);
    ops.push({ store: 'promociones', op: 'put', value: x });
    await DB.batch(ops);
  },
  async eliminarPromocion(id) {
    await DB.del('promociones', id);
    Store.promociones = Store.promociones.filter(x => x.id !== id);
  },

  /* Calcula precio unitario e importe de una línea del ticket */
  calcularLinea(l) {
    const p = l.productoId ? Store.byId.get(l.productoId) : null;
    const q = U.num(l.cantidad);
    let unit = l.precioNormal, etiqueta = '';
    let importe;
    if (l.precioManual != null) { unit = l.precioManual; etiqueta = 'Precio especial'; }
    else if (p && p.mayoreo > 0 && (l.mayoreo || (Store.config.mayoreoAutomatico && p.mayoreoDesde > 0 && q >= p.mayoreoDesde))) { unit = p.mayoreo; etiqueta = 'Mayoreo'; }
    else if (p) {
      for (const pr of Store.promocionesDe(p.id)) {
        if (pr.tipo === 'pct') { const u = U.round2(l.precioNormal * (1 - pr.valor / 100)); if (u < unit) { unit = u; etiqueta = pr.nombre || `Promoción -${pr.valor}%`; } }
        if (pr.tipo === 'rango' && q >= pr.cantidad && (!pr.hasta || q <= pr.hasta) && pr.valor < unit) { unit = pr.valor; etiqueta = pr.nombre || `Promoción ${U.qty(pr.cantidad)}${pr.hasta ? ' a ' + U.qty(pr.hasta) : ' o más'}`; }
      }
      for (const pr of Store.promocionesDe(p.id)) {
        if (pr.tipo === 'nx' && pr.cantidad > 0 && q >= pr.cantidad) {
          const grupos = Math.floor(q / pr.cantidad);
          const imp = U.round2(grupos * pr.valor + (q - grupos * pr.cantidad) * unit);
          if (importe === undefined || imp < importe) { importe = imp; etiqueta = pr.nombre || `${pr.cantidad} por ${U.money(pr.valor)}`; }
        }
      }
    }
    if (importe === undefined) importe = U.round2(q * unit);
    if (l.descuentoPct) { importe = U.round2(importe * (1 - l.descuentoPct / 100)); etiqueta = (etiqueta ? etiqueta + ' + ' : '') + `Desc. ${U.pct(l.descuentoPct)}`; }
    l.importe = importe;
    l.precio = q ? U.round2(importe / q) : unit;
    l.etiqueta = etiqueta;
    l.ahorro = U.round2(q * l.precioNormal - importe);
    return l;
  },

  /* ---------------- Turnos y caja ---------------- */
  async abrirTurno(fondo) {
    const t = { id: Store.nextId('turnos'), caja: Store.caja || 'Caja 1', abierto: Date.now(), cerrado: null, usuarioAbre: Store.user.nombre, fondo: U.round2(U.num(fondo)) };
    await DB.batch([{ store: 'turnos', op: 'put', value: t }, Store.seqOp('turnos')]);
    Store.turno = t;
    return t;
  },
  async asegurarTurno() {
    if (!Store.turno) await Store.abrirTurno(0);
    return Store.turno;
  },

  async movimientoCaja(tipo, monto, descripcion, extra) {
    await Store.asegurarTurno();
    const m = { id: Store.nextId('movcaja'), ts: Date.now(), turnoId: Store.turno.id, tipo, monto: U.round2(monto), forma: 'efectivo', descripcion: descripcion || '', usuario: Store.user.nombre, ...extra };
    await DB.batch([{ store: 'movcaja', op: 'put', value: m }, Store.seqOp('movcaja')]);
    return m;
  },

  /* ---------------- Ventas ---------------- */
  async registrarVenta(ticket, pago) {
    await Store.asegurarTurno();
    const items = ticket.items.map(l => Store.calcularLinea({ ...l }));
    if (!items.length) throw new Error('El ticket está vacío.');
    const total = U.round2(U.sum(items, l => l.importe));
    const efectivo = U.round2(U.num(pago.efectivo)), tarjeta = U.round2(U.num(pago.tarjeta)), vales = U.round2(U.num(pago.vales)), credito = U.round2(U.num(pago.credito));
    if ([efectivo, tarjeta, vales, credito].some(x => x < 0)) throw new Error('Los montos de pago no pueden ser negativos.');
    if (Math.abs(efectivo + tarjeta + vales + credito - total) > 0.005) throw new Error('El pago no coincide con el total.');
    let cliente = null;
    if (credito > 0) {
      cliente = Store.clientes.find(c => c.id === ticket.clienteId);
      if (!cliente) throw new Error('Seleccione un cliente para vender a crédito.');
      if (!cliente.credito) throw new Error('Este cliente no tiene crédito autorizado.');
      if (cliente.limite > 0 && cliente.saldo + credito > cliente.limite + 0.005) throw new Error(`El crédito excede el límite del cliente (${U.money(cliente.limite)}). Saldo actual: ${U.money(cliente.saldo)}.`);
    } else if (ticket.clienteId) cliente = Store.clientes.find(c => c.id === ticket.clienteId) || null;

    const ops = [], touched = new Map();
    const id = Store.nextId('ventas');
    ops.push(Store.seqOp('ventas'));
    let costoTotal = 0;
    const lineas = items.map(l => {
      const p = l.productoId ? Store.byId.get(l.productoId) : null;
      const costo = p ? Store.costoProducto(p) : 0;
      costoTotal += costo * U.num(l.cantidad);
      return {
        productoId: l.productoId || null, codigo: l.codigo || '', descripcion: l.descripcion, cantidad: U.round3(U.num(l.cantidad)),
        precioNormal: l.precioNormal, precio: l.precio, importe: l.importe, costo: U.round2(costo), departamento: p ? p.departamento : (l.departamento || ''),
        tipoVenta: p ? p.tipoVenta : 'U', etiqueta: l.etiqueta || '', comun: !p, devuelto: 0,
      };
    });
    for (const l of lineas) if (l.productoId) Store._stockChange(ops, touched, l.productoId, -l.cantidad, 'venta', `Venta #${id}`, id);
    if (!Store.config.venderSinExistencia) {
      for (const p of touched.values()) if (p.existencia < -0.0001) throw new Error(`No hay suficiente existencia de "${p.descripcion}".`);
    }
    Store._commitTouched(ops, touched);

    const venta = {
      id, ts: Date.now(), turnoId: Store.turno.id, caja: Store.turno.caja || Store.caja, usuario: Store.user.nombre, usuarioId: Store.user.id,
      clienteId: cliente ? cliente.id : null, clienteNombre: cliente ? cliente.nombre : '',
      items: lineas, total, costo: U.round2(costoTotal), ganancia: U.round2(total - costoTotal),
      ahorro: U.round2(U.sum(items, l => l.ahorro || 0)),
      pagos: { efectivo, tarjeta, vales, credito }, pagoCon: U.round2(U.num(pago.pagoCon) || efectivo), cambio: U.round2(U.num(pago.cambio)),
      referencia: pago.referencia || '', notas: ticket.notas || '',
      creditoPendiente: credito, estado: 'ok', devoluciones: [],
    };
    ops.push({ store: 'ventas', op: 'put', value: venta });
    let clienteNuevo = null;
    if (credito > 0) {
      clienteNuevo = { ...cliente, saldo: U.round2(cliente.saldo + credito) };
      ops.push({ store: 'clientes', op: 'put', value: clienteNuevo });
      ops.push({ store: 'movcredito', op: 'put', value: { id: Store.nextId('movcredito'), ts: venta.ts, clienteId: cliente.id, tipo: 'cargo', monto: credito, ventaId: id, nota: `Venta #${id}`, usuario: Store.user.nombre, saldo: clienteNuevo.saldo } }, Store.seqOp('movcredito'));
    }
    await DB.batch(ops);
    Store._applyTouched(touched);
    if (clienteNuevo) Object.assign(cliente, clienteNuevo);
    return venta;
  },

  costoProducto(p) {
    if (p.tipoVenta !== 'P') return p.costo;
    if (p.costo) return p.costo;
    return U.round2(U.sum(p.componentes, c => { const x = Store.byId.get(c.id); return x ? Store.costoProducto(x) * c.cantidad : 0; }));
  },

  ventasDe(from, to) { return DB.range('ventas', 'ts', from, to); },

  /* Devolución parcial o total. lineas: [{ idx, cantidad }] */
  async devolver(ventaId, lineas, motivo, cancelar = false) {
    await Store.asegurarTurno();
    const venta = await DB.get('ventas', ventaId);
    if (!venta) throw new Error('Venta no encontrada.');
    if (venta.estado === 'cancelada') throw new Error('La venta ya está cancelada.');
    const ops = [], touched = new Map();
    let monto = 0, costo = 0;
    const detalle = [];
    for (const { idx, cantidad } of lineas) {
      const l = venta.items[idx];
      const q = U.round3(Math.min(U.num(cantidad), l.cantidad - l.devuelto));
      if (q <= 0) continue;
      l.devuelto = U.round3(l.devuelto + q);
      const imp = U.round2(l.importe * q / l.cantidad);
      monto += imp; costo += l.costo * q;
      detalle.push({ idx, descripcion: l.descripcion, cantidad: q, importe: imp, costo: U.round2(l.costo * q), departamento: l.departamento });
      if (l.productoId && Store.byId.get(l.productoId)) Store._stockChange(ops, touched, l.productoId, q, cancelar ? 'cancelacion' : 'devolucion', `${cancelar ? 'Cancelación' : 'Devolución'} venta #${ventaId}`, ventaId);
    }
    if (!detalle.length) throw new Error('No hay artículos para devolver.');
    monto = U.round2(monto);
    // Primero se descuenta del crédito pendiente, el resto se regresa en efectivo
    const aCredito = U.round2(Math.min(venta.creditoPendiente || 0, monto));
    const aEfectivo = U.round2(monto - aCredito);
    venta.creditoPendiente = U.round2((venta.creditoPendiente || 0) - aCredito);
    const dev = { ts: Date.now(), turnoId: Store.turno.id, usuario: Store.user.nombre, monto, efectivo: aEfectivo, credito: aCredito, items: detalle, motivo: motivo || '' };
    venta.devoluciones.push(dev);
    if (cancelar || venta.items.every(l => l.devuelto >= l.cantidad)) venta.estado = cancelar ? 'cancelada' : 'devuelta';
    ops.push({ store: 'ventas', op: 'put', value: venta });
    ops.push({ store: 'movcaja', op: 'put', value: { id: Store.nextId('movcaja'), ts: dev.ts, turnoId: Store.turno.id, tipo: 'devolucion', monto, efectivo: aEfectivo, credito: aCredito, costo: U.round2(costo), items: detalle, ventaId, descripcion: `${cancelar ? 'Cancelación' : 'Devolución'} venta #${ventaId}${motivo ? ' - ' + motivo : ''}`, usuario: Store.user.nombre } }, Store.seqOp('movcaja'));
    let cliNuevo = null, cli = null;
    if (aCredito > 0 && venta.clienteId) {
      cli = Store.clientes.find(c => c.id === venta.clienteId);
      if (cli) {
        cliNuevo = { ...cli, saldo: U.round2(cli.saldo - aCredito) };
        ops.push({ store: 'clientes', op: 'put', value: cliNuevo });
        ops.push({ store: 'movcredito', op: 'put', value: { id: Store.nextId('movcredito'), ts: dev.ts, clienteId: cli.id, tipo: 'devolucion', monto: aCredito, ventaId, nota: `Devolución venta #${ventaId}`, usuario: Store.user.nombre, saldo: cliNuevo.saldo } }, Store.seqOp('movcredito'));
      }
    }
    Store._commitTouched(ops, touched);
    await DB.batch(ops);
    Store._applyTouched(touched);
    if (cliNuevo) Object.assign(cli, cliNuevo);
    return { venta, dev };
  },

  /* ---------------- Clientes y créditos ---------------- */
  async guardarCliente(c) {
    if (!String(c.nombre || '').trim()) throw new Error('El nombre del cliente es obligatorio.');
    const ops = [];
    let orig = c.id ? Store.clientes.find(x => x.id === c.id) : null;
    const v = { ...orig, ...c, nombre: c.nombre.trim(), limite: U.round2(U.num(c.limite)), credito: !!c.credito, saldo: orig ? orig.saldo : 0 };
    if (!orig) { v.id = Store.nextId('clientes'); v.creado = Date.now(); ops.push(Store.seqOp('clientes')); }
    ops.push({ store: 'clientes', op: 'put', value: v });
    await DB.batch(ops);
    if (orig) Object.assign(orig, v); else Store.clientes.push(v);
    Store.clientes.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return orig || v;
  },
  async eliminarCliente(id) {
    const c = Store.clientes.find(x => x.id === id);
    if (c && Math.abs(c.saldo) > 0.005) throw new Error('No se puede eliminar un cliente con saldo pendiente.');
    await DB.del('clientes', id);
    Store.clientes = Store.clientes.filter(x => x.id !== id);
  },

  /* Importación masiva de clientes (por ejemplo, el archivo que exporta eleventa).
     filas: [{ nombre, telefono, direccion, email, rfc, limite, sinLimite, saldo, notas }] */
  async importarClientes(rows, { actualizarExistentes = true } = {}) {
    const ops = [];
    let nuevos = 0, actualizados = 0, omitidos = 0;
    const errores = [], vistos = new Set(), cambiados = [];
    const ts = Date.now();
    for (const [i, r] of rows.entries()) {
      const nombre = String(r.nombre || '').trim();
      if (!nombre) { errores.push(`Fila ${r._fila || i + 2}: falta el nombre`); continue; }
      const key = U.norm(nombre);
      if (vistos.has(key)) { errores.push(`Fila ${r._fila || i + 2}: cliente repetido en el archivo (${nombre})`); continue; }
      vistos.add(key);
      const orig = Store.clientes.find(c => U.norm(c.nombre) === key);
      if (orig && !actualizarExistentes) { omitidos++; continue; }
      const v = { ...(orig || { id: Store.nextId('clientes'), creado: ts, saldo: 0, credito: false, limite: 0 }), nombre };
      for (const k of ['telefono', 'direccion', 'email', 'rfc', 'notas']) if (r[k] !== undefined && String(r[k]).trim() !== '') v[k] = String(r[k]).trim();
      if (r.limite !== undefined) { v.limite = U.round2(Math.max(0, U.num(r.limite))); if (v.limite > 0) v.credito = true; }
      if (r.sinLimite) { v.credito = true; v.limite = 0; }
      if (r.saldo !== undefined) {
        const nuevo = U.round2(U.num(r.saldo));
        const diff = U.round2(nuevo - (orig ? orig.saldo : 0));
        if (nuevo > 0) v.credito = true;
        if (Math.abs(diff) > 0.005) {
          v.saldo = nuevo;
          ops.push({ store: 'movcredito', op: 'put', value: { id: Store.nextId('movcredito'), ts, clienteId: v.id, tipo: diff > 0 ? 'cargo' : 'ajuste', monto: Math.abs(diff), ventaId: null, nota: orig ? 'Ajuste de saldo (transferencia de datos)' : 'Saldo inicial (transferido de eleventa)', usuario: Store.user ? Store.user.nombre : '', saldo: nuevo } });
        }
      }
      ops.push({ store: 'clientes', op: 'put', value: v });
      cambiados.push([orig, v]);
      if (orig) actualizados++; else nuevos++;
    }
    ops.push(Store.seqOp('clientes'), Store.seqOp('movcredito'));
    await DB.batch(ops);
    for (const [orig, v] of cambiados) { if (orig) Object.assign(orig, v); else Store.clientes.push(v); }
    Store.clientes.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return { nuevos, actualizados, omitidos, errores };
  },

  /* Abono: si ventaId se indica, se aplica a ese ticket; si no, a los más antiguos */
  async abonar(clienteId, monto, forma, ventaId, nota) {
    await Store.asegurarTurno();
    const cli = Store.clientes.find(c => c.id === clienteId);
    monto = U.round2(U.num(monto));
    if (!cli) throw new Error('Cliente no encontrado.');
    if (monto <= 0) throw new Error('Indique un monto válido.');
    if (monto > cli.saldo + 0.005) throw new Error(`El abono excede el saldo del cliente (${U.money(cli.saldo)}).`);
    const ventas = (await DB.byIndex('ventas', 'clienteId', clienteId)).filter(v => v.creditoPendiente > 0.005).sort((a, b) => a.ts - b.ts);
    const ops = [];
    let resto = monto;
    const orden = ventaId ? [...ventas.filter(v => v.id === ventaId), ...ventas.filter(v => v.id !== ventaId)] : ventas;
    const aplicado = [];
    for (const v of orden) {
      if (resto <= 0.005) break;
      const a = U.round2(Math.min(resto, v.creditoPendiente));
      v.creditoPendiente = U.round2(v.creditoPendiente - a);
      resto = U.round2(resto - a);
      aplicado.push({ ventaId: v.id, monto: a });
      ops.push({ store: 'ventas', op: 'put', value: v });
    }
    const cliNuevo = { ...cli, saldo: U.round2(cli.saldo - monto), ultimoAbono: Date.now() };
    const ts = Date.now();
    ops.push({ store: 'clientes', op: 'put', value: cliNuevo });
    ops.push({ store: 'movcredito', op: 'put', value: { id: Store.nextId('movcredito'), ts, clienteId, tipo: 'abono', monto, forma, aplicado, nota: nota || '', usuario: Store.user.nombre, saldo: cliNuevo.saldo } }, Store.seqOp('movcredito'));
    ops.push({ store: 'movcaja', op: 'put', value: { id: Store.nextId('movcaja'), ts, turnoId: Store.turno.id, tipo: 'abono', monto, forma, clienteId, descripcion: `Abono de ${cli.nombre}${nota ? ' - ' + nota : ''}`, usuario: Store.user.nombre } }, Store.seqOp('movcaja'));
    await DB.batch(ops);
    Object.assign(cli, cliNuevo);
    return { cliente: cli, aplicado };
  },

  /* ---------------- Corte ---------------- */
  async resumenTurno(turno) {
    const ventas = await DB.byIndex('ventas', 'turnoId', turno.id);
    const movs = await DB.byIndex('movcaja', 'turnoId', turno.id);
    return Store.resumen(ventas, movs, turno.fondo || 0);
  },
  async resumenPeriodo(from, to) {
    const ventas = await DB.range('ventas', 'ts', from, to);
    const movs = await DB.range('movcaja', 'ts', from, to);
    const turnos = (await DB.range('turnos', 'abierto', from, to));
    return Store.resumen(ventas, movs, U.sum(turnos, t => t.fondo || 0));
  },
  resumen(ventas, movs, fondo) {
    const r = {
      fondo, numVentas: ventas.length,
      ventasEfectivo: 0, ventasTarjeta: 0, ventasVales: 0, ventasCredito: 0, ventasTotal: 0,
      abonosEfectivo: 0, abonosTarjeta: 0, entradas: 0, salidas: 0,
      devolucionesEfectivo: 0, devolucionesCredito: 0, devolucionesTotal: 0,
      ganancia: 0, costo: 0, departamentos: {}, entradasLista: [], salidasLista: [], canceladas: 0,
    };
    const dep = (n) => (r.departamentos[n || 'Sin departamento'] ||= { ventas: 0, ganancia: 0 });
    for (const v of ventas) {
      r.ventasEfectivo += v.pagos.efectivo; r.ventasTarjeta += v.pagos.tarjeta; r.ventasVales += v.pagos.vales || 0; r.ventasCredito += v.pagos.credito;
      r.ventasTotal += v.total; r.costo += v.costo;
      if (v.estado === 'cancelada') r.canceladas++;
      for (const l of v.items) { const d = dep(l.departamento); d.ventas += l.importe; d.ganancia += l.importe - l.costo * l.cantidad; }
    }
    for (const m of movs) {
      if (m.tipo === 'entrada') { r.entradas += m.monto; r.entradasLista.push(m); }
      else if (m.tipo === 'salida') { r.salidas += m.monto; r.salidasLista.push(m); }
      else if (m.tipo === 'abono') { if (m.forma === 'tarjeta') r.abonosTarjeta += m.monto; else r.abonosEfectivo += m.monto; }
      else if (m.tipo === 'devolucion') {
        r.devolucionesEfectivo += m.efectivo; r.devolucionesCredito += m.credito; r.devolucionesTotal += m.monto; r.costo -= m.costo;
        for (const it of m.items || []) { const d = dep(it.departamento); d.ventas -= it.importe; d.ganancia -= it.importe - it.costo; }
      }
    }
    r.ventasNetas = r.ventasTotal - r.devolucionesTotal;
    r.ganancia = r.ventasNetas - r.costo;
    r.efectivoEsperado = r.fondo + r.ventasEfectivo + r.abonosEfectivo + r.entradas - r.salidas - r.devolucionesEfectivo;
    for (const k of Object.keys(r)) if (typeof r[k] === 'number') r[k] = U.round2(r[k]);
    for (const d of Object.values(r.departamentos)) { d.ventas = U.round2(d.ventas); d.ganancia = U.round2(d.ganancia); }
    return r;
  },
  async cerrarTurno(contado, notas) {
    const t = Store.turno;
    if (!t) throw new Error('No hay un turno abierto.');
    const res = await Store.resumenTurno(t);
    const cerrado = { ...t, cerrado: Date.now(), usuarioCierra: Store.user.nombre, resumen: res, contado: contado === '' || contado == null ? null : U.round2(U.num(contado)), notas: notas || '' };
    if (cerrado.contado != null) cerrado.diferencia = U.round2(cerrado.contado - res.efectivoEsperado);
    await DB.put('turnos', cerrado);
    Store.turno = null;
    return cerrado;
  },

  /* ---------------- Usuarios ---------------- */
  async guardarUsuario(u, password) {
    if (!String(u.nombre || '').trim() || !String(u.usuario || '').trim()) throw new Error('Nombre y usuario son obligatorios.');
    const dup = Store.usuarios.find(x => U.norm(x.usuario) === U.norm(u.usuario) && x.id !== u.id);
    if (dup) throw new Error('Ya existe un cajero con ese usuario.');
    const orig = u.id ? Store.usuarios.find(x => x.id === u.id) : null;
    const v = { ...orig, ...u };
    if (password !== undefined && password !== null) v.password = await U.hash(password);
    const ops = [];
    if (!orig) { v.id = Store.nextId('usuarios'); ops.push(Store.seqOp('usuarios')); if (!v.password) v.password = await U.hash(''); }
    if (orig && orig.admin && !v.admin && Store.usuarios.filter(x => x.admin && x.activo !== false).length <= 1) throw new Error('Debe existir al menos un administrador.');
    ops.push({ store: 'usuarios', op: 'put', value: v });
    await DB.batch(ops);
    if (orig) Object.assign(orig, v); else Store.usuarios.push(v);
    return orig || v;
  },
  async eliminarUsuario(id) {
    const u = Store.usuarios.find(x => x.id === id);
    if (u.admin && Store.usuarios.filter(x => x.admin).length <= 1) throw new Error('No puede eliminar al único administrador.');
    if (Store.user && Store.user.id === id) throw new Error('No puede eliminar al usuario con el que inició sesión.');
    await DB.del('usuarios', id);
    Store.usuarios = Store.usuarios.filter(x => x.id !== id);
  },
  async login(usuario, password) {
    const u = Store.usuarios.find(x => U.norm(x.usuario) === U.norm(usuario) && x.activo !== false);
    const vacia = await U.hash('');
    // Primera vez: el administrador sin contraseña también entra si escribe "admin"
    const ok = u && (u.password === await U.hash(password || '') || (u.admin && u.password === vacia && U.norm(password) === 'admin'));
    if (!ok) throw new Error(u ? 'La contraseña no es correcta.' : `No existe el usuario "${String(usuario).trim()}".`);
    Store.user = u;
    return u;
  },
};
