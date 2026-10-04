/*
 * Lectura de la base de datos completa de eleventa (PDVDATA.FDB, Firebird 2.5).
 *
 * Se trabaja sobre una COPIA del archivo: se enciende un Firebird propio (incluido con el programa,
 * sólo escucha en 127.0.0.1) y se leen productos, departamentos y clientes. El archivo original
 * de eleventa nunca se modifica.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const Firebird = require('./vendor/node-firebird');

const PUERTO = Number(process.env.PV_FIREBIRD_PORT) || 30550;
const USUARIO = 'SYSDBA', CLAVE = 'masterkey';

/* Dónde suele estar PDVDATA.FDB en Windows */
function rutasTipicas() {
  if (process.platform !== 'win32') return [];
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pd = process.env.ProgramData || 'C:\\ProgramData';
  const pub = process.env.PUBLIC || 'C:\\Users\\Public';
  const out = [];
  for (const base of [pf86, pf, 'C:\\', pd, path.join(pub, 'Documents')]) {
    for (const dir of ['AbarrotesPDV', 'AbarrotesMultiCaja', 'eleventa', 'EleventaPV', 'Eleventa']) out.push(path.join(base, dir, 'db', 'PDVDATA.FDB'), path.join(base, dir, 'PDVDATA.FDB'));
  }
  // barrido de un nivel: <Program Files>\*\db\PDVDATA.FDB
  for (const base of [pf86, pf, 'C:\\']) {
    try { for (const d of fs.readdirSync(base)) out.push(path.join(base, d, 'db', 'PDVDATA.FDB')); } catch (e) { /* sin acceso */ }
  }
  return [...new Set(out)];
}
function buscar() {
  const encontrados = [];
  for (const r of rutasTipicas()) {
    try { const st = fs.statSync(r); if (st.isFile()) encontrados.push({ ruta: r, bytes: st.size, modificado: st.mtimeMs }); } catch (e) { /* no existe */ }
  }
  return encontrados;
}

/* ---------------- Motor Firebird propio ---------------- */
const EXE = process.platform === 'win32' ? 'fbserver.exe' : 'fbserver';
/* Firebird viene con el programa (carpeta "firebird"). Se copia una vez a la carpeta de datos porque
   necesita poder escribir en sus archivos (security2.fdb, firebird.log) y "Archivos de programa" no lo permite. */
function carpetaFirebird(root, dataDir) {
  const candidatos = [process.env.PV_FIREBIRD_DIR, path.resolve(root, '..', 'firebird'), path.resolve(root, 'firebird')].filter(Boolean);
  const origen = candidatos.find(c => fs.existsSync(path.join(c, 'bin', EXE)));
  if (!origen) throw new Error('No se encontró el componente para leer bases de eleventa (Firebird). Reinstale el programa con el instalador más reciente.');
  const destino = path.join(dataDir, 'firebird-motor');
  const marca = path.join(destino, '.origen');
  const firma = origen + '|' + fs.statSync(path.join(origen, 'bin', EXE)).mtimeMs + '|' + fs.statSync(path.join(origen, 'firebird.conf')).mtimeMs;
  let actual = null;
  try { actual = fs.readFileSync(marca, 'utf8'); } catch (e) { /* no copiado aún */ }
  if (actual !== firma) {
    fs.rmSync(destino, { recursive: true, force: true });
    fs.cpSync(origen, destino, { recursive: true });
    fs.writeFileSync(marca, firma);
  }
  return { dir: destino, exe: path.join(destino, 'bin', EXE) };
}
function puertoAbierto(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port }, () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.setTimeout(800, () => { s.destroy(); resolve(false); });
  });
}
async function encenderFirebird(root, dataDir, tmp) {
  if (await puertoAbierto(PUERTO)) return null; // ya hay uno encendido (de una lectura anterior)
  const { dir, exe } = carpetaFirebird(root, dataDir);
  const env = { ...process.env, FIREBIRD: dir, FIREBIRD_LOCK: tmp, FIREBIRD_TMP: tmp };
  if (process.platform !== 'win32') env.LD_LIBRARY_PATH = [path.join(dir, 'lib'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
  const args = process.platform === 'win32' ? ['-a'] : []; // el puerto (sólo 127.0.0.1) va en firebird.conf
  const proc = spawn(exe, args, { env, cwd: path.join(dir, 'bin'), stdio: 'ignore', windowsHide: true, detached: false });
  let salio = null;
  proc.on('exit', (c) => { salio = c; });
  for (let i = 0; i < 60; i++) {
    if (await puertoAbierto(PUERTO)) return proc;
    if (salio !== null) break;
    await new Promise(r => setTimeout(r, 250));
  }
  try { proc.kill(); } catch (e) { /* ya terminó */ }
  throw new Error('No se pudo encender el lector de bases de eleventa (Firebird).');
}

/* ---------------- Consultas ---------------- */
function conectar(archivo) {
  return new Promise((resolve, reject) => {
    Firebird.attach({ host: '127.0.0.1', port: PUERTO, database: archivo, user: USUARIO, password: CLAVE, encoding: 'UTF8', lowercase_keys: false }, (err, db) => {
      if (err) reject(traducirError(err)); else resolve(db);
    });
  });
}
function consulta(db, sql, params = []) {
  return new Promise((resolve, reject) => db.query(sql, params, (err, rows) => (err ? reject(traducirError(err)) : resolve(rows || []))));
}
function traducirError(err) {
  const m = String(err && err.message || err);
  if (/unsupported on-disk structure|ODS/i.test(m)) return new Error('Esta base de eleventa es de una versión de Firebird más nueva que la incluida. Exporte los productos y clientes a Excel desde eleventa y cárguelos en este mismo apartado.');
  if (/not a valid database|file .* is not a valid/i.test(m)) return new Error('El archivo no es una base de datos de eleventa válida (PDVDATA.FDB).');
  if (/lock|being used|in use/i.test(m)) return new Error('El archivo está siendo usado. Cierre eleventa e intente de nuevo.');
  return new Error('No se pudo leer la base de eleventa: ' + m);
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function columna(cols, alias) {
  for (const a of alias) { const c = cols.find(x => norm(x) === norm(a)); if (c) return c; }
  return null;
}
function tabla(tablas, nombres, contiene) {
  for (const n of nombres) { const t = tablas.find(x => norm(x) === norm(n)); if (t) return t; }
  return contiene ? tablas.find(x => norm(x).includes(contiene)) || null : null;
}
/* Columna de borrado: fecha (vacía = activo) o marca 't'/'f' */
const estaEliminado = (v) => {
  if (v === null || v === undefined || v === '') return false;
  if (typeof v === 'string' && v.trim().length <= 1) return verdadero(v);
  if (typeof v === 'number') return v !== 0;
  return true;
};
const verdadero = (v) => ['T', 'S', '1', 'TRUE', 'SI', 'Y'].includes(String(v ?? '').trim().toUpperCase());
const numero = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());
const q = (c) => `"${c.replace(/"/g, '""')}"`;

async function extraer(db) {
  const avisos = [];
  const tablas = (await consulta(db, 'SELECT TRIM(RDB$RELATION_NAME) AS T FROM RDB$RELATIONS WHERE COALESCE(RDB$SYSTEM_FLAG, 0) = 0 AND RDB$VIEW_BLR IS NULL')).map(r => r.T);
  const columnasDe = async (t) => (await consulta(db, 'SELECT TRIM(RDB$FIELD_NAME) AS C FROM RDB$RELATION_FIELDS WHERE RDB$RELATION_NAME = ? ORDER BY RDB$FIELD_POSITION', [t])).map(r => r.C);

  /* Departamentos */
  const deptos = new Map();
  const tDep = tabla(tablas, ['DEPARTAMENTOS', 'DEPARTAMENTO'], 'DEPARTAMENT');
  if (tDep) {
    const cols = await columnasDe(tDep);
    const cId = columna(cols, ['ID', 'ID_DEPARTAMENTO', 'CLAVE']), cNom = columna(cols, ['NOMBRE', 'DESCRIPCION', 'DEPARTAMENTO']);
    if (cId && cNom) for (const r of await consulta(db, `SELECT ${q(cId)} AS I, ${q(cNom)} AS N FROM ${q(tDep)}`)) deptos.set(String(r.I), texto(r.N));
  }

  /* Productos */
  const tProd = tabla(tablas, ['PRODUCTOS', 'PRODUCTO', 'ARTICULOS'], 'PRODUCT');
  if (!tProd) throw new Error('No se encontró la tabla de productos en la base de eleventa.');
  const pc = await columnasDe(tProd);
  const P = {
    codigo: columna(pc, ['CODIGO', 'CODIGO_BARRAS', 'CLAVE', 'CODIGOBARRAS']),
    descripcion: columna(pc, ['DESCRIPCION', 'NOMBRE', 'ARTICULO']),
    costo: columna(pc, ['PCOSTO', 'PRECIO_COSTO', 'COSTO', 'PRECIOCOSTO']),
    precioFinal: columna(pc, ['PFINAL', 'PRECIO_FINAL']),
    precio: columna(pc, ['PVENTA', 'PRECIO_VENTA', 'PRECIO', 'PRECIOVENTA']),
    mayoreo: columna(pc, ['MAYOREO', 'PMAYOREO', 'PRECIO_MAYOREO', 'PRECIOMAYOREO']),
    existencia: columna(pc, ['DINVENTARIO', 'EXISTENCIA', 'INVENTARIO', 'CANTIDAD', 'STOCK']),
    minimo: columna(pc, ['DINVMINIMO', 'INVMINIMO', 'INV_MINIMO', 'MINIMO', 'DINV_MINIMO']),
    maximo: columna(pc, ['DINVMAXIMO', 'INVMAXIMO', 'INV_MAXIMO', 'MAXIMO', 'DINV_MAXIMO']),
    tipo: columna(pc, ['TVENTA', 'TIPO_VENTA', 'TIPOVENTA', 'SEVENDE']),
    usaInventario: columna(pc, ['USA_INVENTARIO', 'USAINVENTARIO', 'INVENTARIABLE']),
    dept: columna(pc, ['DEPT', 'DEPARTAMENTO_ID', 'ID_DEPARTAMENTO', 'DEPARTAMENTO', 'DEPTO']),
    eliminado: columna(pc, ['ELIMINADO_EN', 'ELIMINADO', 'BORRADO', 'BAJA']),
  };
  if (!P.codigo || !P.descripcion) throw new Error('La tabla de productos no tiene las columnas de código y descripción esperadas.');
  if (!P.precioFinal && !P.precio) avisos.push('No se encontró la columna de precio de venta; los productos quedarán con precio $0.');
  const usadas = Object.entries(P).filter(([, c]) => c);
  const filas = await consulta(db, `SELECT ${usadas.map(([k, c]) => `${q(c)} AS ${q(k)}`).join(', ')} FROM ${q(tProd)}`);
  const productos = [];
  let eliminados = 0, sinCodigo = 0;
  const vistos = new Set();
  for (const r of filas) {
    if (P.eliminado && estaEliminado(r.eliminado)) { eliminados++; continue; }
    const codigo = texto(r.codigo);
    if (!codigo) { sinCodigo++; continue; }
    const key = codigo.toLowerCase();
    if (vistos.has(key)) continue;
    vistos.add(key);
    const tipoTxt = texto(r.tipo).toUpperCase();
    const p = {
      codigo,
      descripcion: texto(r.descripcion) || codigo,
      costo: numero(r.costo),
      precio: numero(P.precioFinal && numero(r.precioFinal) > 0 ? r.precioFinal : r.precio),
      tipoVenta: tipoTxt.startsWith('G') ? 'G' : 'U',
    };
    if (P.mayoreo) p.mayoreo = numero(r.mayoreo);
    if (P.dept) p.departamento = deptos.get(String(r.dept)) || (typeof r.dept === 'string' && !/^\d+$/.test(r.dept) ? texto(r.dept) : '');
    const usa = P.usaInventario ? verdadero(r.usaInventario) : true;
    p.usaInventario = usa;
    if (usa) {
      if (P.existencia) p.existencia = numero(r.existencia);
      if (P.minimo) p.minimo = numero(r.minimo);
      if (P.maximo) p.maximo = numero(r.maximo);
    }
    productos.push(p);
  }
  if (sinCodigo) avisos.push(`${sinCodigo} producto(s) sin código no se cargarán.`);

  /* Clientes */
  const clientes = [];
  let clientesEliminados = 0;
  const tCli = tabla(tablas, ['CLIENTES', 'CLIENTE'], 'CLIENTE');
  const C = {};
  if (tCli) {
    const cc = await columnasDe(tCli);
    Object.assign(C, {
      nombre: columna(cc, ['NOMBRE', 'NOMBRE_COMPLETO', 'RAZON_SOCIAL', 'CLIENTE']),
      direccion: columna(cc, ['DIRECCION', 'DOMICILIO', 'CALLE']),
      telefono: columna(cc, ['TELEFONO', 'TELEFONOS', 'TEL', 'CELULAR']),
      email: columna(cc, ['CORREO', 'EMAIL', 'CORREO_ELECTRONICO', 'MAIL']),
      rfc: columna(cc, ['RFC', 'RUT', 'NIT']),
      limite: columna(cc, ['LIMITE_CREDITO', 'LIMITECREDITO', 'LIMITE', 'CREDITO_LIMITE', 'LIMITE_DE_CREDITO']),
      saldo: columna(cc, ['SALDO', 'SALDO_ACTUAL', 'SALDOACTUAL', 'ADEUDO', 'DEUDA']),
      ilimitado: columna(cc, ['CREDITO_ILIMITADO', 'SIN_LIMITE', 'ILIMITADO', 'LIMITE_ILIMITADO']),
      tieneCredito: columna(cc, ['TIENE_CREDITO', 'CREDITO', 'USA_CREDITO']),
      eliminado: columna(cc, ['ELIMINADO_EN', 'ELIMINADO', 'BORRADO', 'BAJA']),
    });
    if (C.nombre) {
      const usC = Object.entries(C).filter(([, c]) => c);
      for (const r of await consulta(db, `SELECT ${usC.map(([k, c]) => `${q(c)} AS ${q(k)}`).join(', ')} FROM ${q(tCli)}`)) {
        if (C.eliminado && estaEliminado(r.eliminado)) { clientesEliminados++; continue; }
        const nombre = texto(r.nombre);
        if (!nombre) continue;
        const c = { nombre };
        for (const k of ['direccion', 'telefono', 'email', 'rfc']) if (C[k] && texto(r[k])) c[k] = texto(r[k]);
        if (C.limite) c.limite = numero(r.limite);
        if (C.ilimitado && verdadero(r.ilimitado)) c.sinLimite = true;
        if (C.saldo) c.saldo = numero(r.saldo);
        clientes.push(c);
      }
      if (!C.saldo) avisos.push('No se encontró el saldo de los clientes en la base; se cargan sin deuda. Si tiene clientes con crédito, cargue también el Excel de F2 Clientes → Exportar de eleventa.');
    }
  } else avisos.push('No se encontró la tabla de clientes.');

  const ventas = tablas.includes('VENTATICKETS') ? (await consulta(db, 'SELECT COUNT(*) AS N FROM VENTATICKETS'))[0].N : null;
  return {
    productos, clientes, departamentos: [...new Set(productos.map(p => p.departamento).filter(Boolean))],
    resumen: {
      tablaProductos: tProd, tablaClientes: tCli, eliminados, clientesEliminados, ventasHistoricas: ventas,
      columnasProductos: Object.fromEntries(usadas), columnasClientes: Object.fromEntries(Object.entries(C).filter(([, c]) => c)),
      precioUsado: P.precioFinal ? 'PFINAL (precio final)' : P.precio || null,
    },
    avisos,
  };
}

/* Lee una base de eleventa. origen: ruta del archivo .FDB (se copia antes de abrirlo). */
let ocupado = false;
async function leer(origen, { root, dataDir }) {
  if (ocupado) throw new Error('Ya se está leyendo una base de datos. Espere a que termine.');
  ocupado = true;
  const tmp = path.join(dataDir, 'tmp-eleventa');
  fs.mkdirSync(tmp, { recursive: true });
  const copia = path.join(tmp, `PDVDATA-${Date.now()}.FDB`);
  let proc = null, db = null;
  try {
    const cabecera = Buffer.alloc(32);
    const fd = fs.openSync(origen, 'r'); fs.readSync(fd, cabecera, 0, 32, 0); fs.closeSync(fd);
    if (cabecera[0] !== 1) throw new Error('El archivo no es una base de datos de eleventa (PDVDATA.FDB).');
    fs.copyFileSync(origen, copia);
    proc = await encenderFirebird(root, dataDir, tmp);
    db = await conectar(copia);
    return await extraer(db);
  } finally {
    if (db) await new Promise(r => db.detach(() => r()));
    if (proc) { try { proc.kill(); } catch (e) { /* ya terminó */ } await new Promise(r => setTimeout(r, 300)); }
    for (let i = 0; i < 10; i++) { try { fs.rmSync(copia, { force: true }); break; } catch (e) { await new Promise(r => setTimeout(r, 300)); } }
    ocupado = false;
  }
}

module.exports = { buscar, leer, rutasTipicas };
