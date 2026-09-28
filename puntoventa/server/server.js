#!/usr/bin/env node
/*
 * Servidor del Punto de Venta.
 * Guarda la base de datos (SQLite) en la computadora principal y la comparte
 * por la red local (Wi-Fi o cable) con las demás cajas. No requiere internet.
 *
 *   node server/server.js            (puerto 8080)
 *   PORT=9000 node server/server.js  (otro puerto)
 */
'use strict';

process.removeAllListeners('warning');
process.on('warning', (w) => { if (w.name !== 'ExperimentalWarning') console.warn(w); });

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); }
catch (e) {
  console.error('\n  Esta versión de Node.js es muy antigua. Instale Node.js 22.13 o más reciente (https://nodejs.org).\n');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = process.env.PV_DATA_DIR ? path.resolve(process.env.PV_DATA_DIR) : path.join(ROOT, 'datos');
const BACKUP_DIR = path.join(DATA_DIR, 'respaldos');
const PORT = Number(process.env.PORT) || 8080;
const VERSION = '1.0.0';
fs.mkdirSync(BACKUP_DIR, { recursive: true });

/* ------------------------------------------------------------------ */
/* Base de datos SQLite                                                */
/* ------------------------------------------------------------------ */
const SCHEMA = {
  meta: [],
  usuarios: [],
  departamentos: [],
  productos: ['codigo'],
  clientes: [],
  promociones: [],
  ventas: ['ts', 'turnoId', 'clienteId'],
  movcaja: ['ts', 'turnoId'],
  movinv: ['ts', 'productoId'],
  movcredito: ['ts', 'clienteId'],
  turnos: ['abierto'],
};
const keyPathOf = (store) => (store === 'meta' ? 'key' : 'id');

const sql = new DatabaseSync(path.join(DATA_DIR, 'puntoventa.db'));
sql.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = OFF;');
for (const [store, idx] of Object.entries(SCHEMA)) {
  const cols = idx.map(c => `, "${c}" GENERATED ALWAYS AS (json_extract(data, '$.${c}')) VIRTUAL`).join('');
  sql.exec(`CREATE TABLE IF NOT EXISTS "${store}" (k PRIMARY KEY, data TEXT NOT NULL${cols})`);
  for (const c of idx) sql.exec(`CREATE INDEX IF NOT EXISTS "${store}_${c}" ON "${store}"("${c}")`);
}
const stmtCache = new Map();
const stmt = (q) => { if (!stmtCache.has(q)) stmtCache.set(q, sql.prepare(q)); return stmtCache.get(q); };
const checkStore = (s) => { if (!SCHEMA[s]) throw new Error('Tabla desconocida: ' + s); return s; };
const checkIndex = (s, i) => { if (!SCHEMA[checkStore(s)].includes(i)) throw new Error('Índice desconocido: ' + i); return i; };
const rows = (list) => list.map(r => JSON.parse(r.data));

/* Misma interfaz que usa store.js (all, get, byIndex, range, count, batch) */
const DB = {
  changes: null,
  async all(s) { return rows(stmt(`SELECT data FROM "${checkStore(s)}"`).all()); },
  async get(s, key) { const r = stmt(`SELECT data FROM "${checkStore(s)}" WHERE k = ?`).get(key); return r ? JSON.parse(r.data) : undefined; },
  async byIndex(s, i, v) { return rows(stmt(`SELECT data FROM "${checkStore(s)}" WHERE "${checkIndex(s, i)}" = ? ORDER BY k`).all(v)); },
  async range(s, i, from, to) { return rows(stmt(`SELECT data FROM "${checkStore(s)}" WHERE "${checkIndex(s, i)}" BETWEEN ? AND ? ORDER BY "${i}", k`).all(from, to)); },
  async count(s) { return stmt(`SELECT COUNT(*) AS n FROM "${checkStore(s)}"`).get().n; },
  async batch(ops) {
    if (!ops.length) return;
    sql.exec('BEGIN IMMEDIATE');
    try {
      for (const o of ops) {
        checkStore(o.store);
        if (o.op === 'put') stmt(`INSERT OR REPLACE INTO "${o.store}" (k, data) VALUES (?, ?)`).run(o.value[keyPathOf(o.store)], JSON.stringify(o.value));
        else if (o.op === 'delete') stmt(`DELETE FROM "${o.store}" WHERE k = ?`).run(o.key);
        else if (o.op === 'clear') stmt(`DELETE FROM "${o.store}"`).run();
      }
      sql.exec('COMMIT');
    } catch (e) {
      sql.exec('ROLLBACK');
      throw e;
    }
    if (DB.changes) DB.changes.push(...ops);
  },
  async put(s, v) { return DB.batch([{ store: s, op: 'put', value: v }]); },
  async del(s, k) { return DB.batch([{ store: s, op: 'delete', key: k }]); },
  async exportAll() {
    const out = { app: 'puntoventa', version: 1, exportado: new Date().toISOString(), data: {} };
    for (const s of Object.keys(SCHEMA)) out.data[s] = await DB.all(s);
    return out;
  },
  async importAll(dump) {
    if (!dump || dump.app !== 'puntoventa' || !dump.data) throw new Error('El archivo no es un respaldo válido de este programa.');
    const ops = [];
    for (const s of Object.keys(SCHEMA)) {
      ops.push({ store: s, op: 'clear' });
      for (const v of dump.data[s] || []) ops.push({ store: s, op: 'put', value: v });
    }
    await DB.batch(ops);
  },
  async wipe() { await DB.batch(Object.keys(SCHEMA).map(s => ({ store: s, op: 'clear' }))); },
};

/* ------------------------------------------------------------------ */
/* Reglas del negocio: se ejecuta el mismo store.js que usa la pantalla */
/* ------------------------------------------------------------------ */
const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, crypto: globalThis.crypto, TextEncoder, DB };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['js/util.js', 'js/store.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const Store = vm.runInContext('Store', ctx);
const U = vm.runInContext('U', ctx);
const DEFAULT_CONFIG = vm.runInContext('DEFAULT_CONFIG', ctx);

const openTurnos = new Map(); // caja -> turno abierto

async function loadAll() {
  Store.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  Store.seq = {};
  Store.tickets = null;
  await Store.load();
  openTurnos.clear();
  for (const t of await DB.all('turnos')) if (!t.cerrado) openTurnos.set(t.caja || 'Caja 1', t);
}

/* ------------------------------------------------------------------ */
/* Sesiones y permisos                                                 */
/* ------------------------------------------------------------------ */
const sessions = new Map(); // token -> { userId, overrides: Map(perm -> expira) }
const sanitizeUser = (u) => { if (!u) return u; const { password, ...rest } = u; return rest; };

function sessionFrom(req, url) {
  const token = req.headers['x-token'] || url.searchParams.get('token');
  const s = token && sessions.get(token);
  if (!s) return null;
  const user = Store.usuarios.find(u => u.id === s.userId && u.activo !== false);
  if (!user) { sessions.delete(token); return null; }
  s.user = user;
  return s;
}
function allowed(session, perm) {
  if (!perm) return true;
  const u = session.user;
  if (u.admin || (u.permisos && u.permisos[perm])) return true;
  const exp = session.overrides.get(perm);
  return !!(exp && exp > Date.now());
}

/* Métodos que las cajas pueden llamar, con el permiso requerido */
const METHODS = {
  registrarVenta: { perm: 'vender', check: (s, [, pago]) => (U.num(pago && pago.credito) > 0 ? 'creditos' : null) },
  devolver: { perm: 'cancelar' },
  movimientoCaja: { perm: 'entradasSalidas', check: (s, [tipo]) => { if (!['entrada', 'salida'].includes(tipo)) throw new Error('Tipo de movimiento inválido.'); return null; } },
  abrirTurno: { perm: null },
  cerrarTurno: { perm: 'corte' },
  abonar: { perm: 'creditos' },
  guardarCliente: { perm: 'clientes' },
  eliminarCliente: { perm: 'clientes' },
  guardarProducto: { perm: 'productos' },
  actualizarVarios: { perm: 'productos' },
  eliminarProducto: { perm: 'productos' },
  importarProductos: { perm: 'productos' },
  guardarPromocion: { perm: 'productos' },
  eliminarPromocion: { perm: 'productos' },
  guardarDepartamento: { perm: 'productos' },
  eliminarDepartamento: { perm: 'productos' },
  movimientoInventario: { perm: 'inventario' },
  guardarUsuario: { perm: 'configuracion' },
  eliminarUsuario: { perm: 'configuracion' },
  guardarConfig: {
    perm: 'configuracion',
    run: async ([config]) => { Store.config = Store.mergeConfig(config); await Store.saveConfig(); return true; },
  },
  guardarTickets: {
    perm: null,
    run: async ([tickets]) => { await DB.put('meta', { key: 'tickets:' + Store.caja, value: tickets }); return true; },
  },
  borrarTodo: {
    perm: 'configuracion', admin: true,
    run: async () => { await backup('antes-de-borrar'); DB.changes = null; await DB.wipe(); await loadAll(); return { reload: true }; },
  },
  restaurar: {
    perm: 'configuracion', admin: true,
    run: async ([dump]) => { await backup('antes-de-restaurar'); DB.changes = null; await DB.importAll(dump); await loadAll(); return { reload: true }; },
  },
};

/* Todas las operaciones que modifican datos se ejecutan en fila, una a la vez */
let queue = Promise.resolve();
function enqueue(fn) {
  const p = queue.then(fn, fn);
  queue = p.catch(() => {});
  return p;
}

const BROADCAST = new Set(['productos', 'departamentos', 'clientes', 'promociones', 'usuarios']);
function publicChanges(ops) {
  const out = [];
  for (const o of ops) {
    if (o.store === 'meta') { if (o.op === 'put' && o.value.key === 'config') out.push(o); continue; }
    if (o.op === 'clear' || !BROADCAST.has(o.store)) continue;
    out.push(o.store === 'usuarios' && o.op === 'put' ? { ...o, value: sanitizeUser(o.value) } : o);
  }
  return out;
}

async function rpc(session, method, args, caja) {
  const def = METHODS[method];
  if (!def) throw new Error('Operación desconocida: ' + method);
  if (!allowed(session, def.perm)) throw new Error('No tiene permiso para realizar esta operación.');
  if (def.admin && !session.user.admin) throw new Error('Sólo un administrador puede hacer esto.');
  if (def.check) { const extra = def.check(session, args); if (extra && !allowed(session, extra)) throw new Error('No tiene permiso para realizar esta operación.'); }
  return enqueue(async () => {
    Store.user = session.user;
    Store.caja = String(caja || 'Caja 1').slice(0, 60);
    Store.turno = openTurnos.get(Store.caja) || null;
    DB.changes = [];
    try {
      const result = def.run ? await def.run(args) : await Store[method](...args);
      const ops = DB.changes || [];
      for (const o of ops) {
        if (o.store === 'turnos' && o.op === 'put') {
          const t = o.value, c = t.caja || 'Caja 1';
          if (!t.cerrado) openTurnos.set(c, t); else if (openTurnos.get(c) && openTurnos.get(c).id === t.id) openTurnos.delete(c);
        }
      }
      const reload = !!(result && result.reload) || ops.length > 3000;
      const changes = reload ? [] : publicChanges(ops);
      if (reload) broadcast({ reload: true });
      else if (changes.length) broadcast({ changes });
      return { result: method === 'guardarUsuario' ? sanitizeUser(result) : result, changes, reload, turno: openTurnos.get(Store.caja) || null };
    } finally {
      DB.changes = null;
      Store.user = null;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Avisos en tiempo real a las cajas (Server-Sent Events)              */
/* ------------------------------------------------------------------ */
const listeners = new Set();
function broadcast(msg) {
  const data = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of listeners) res.write(data);
}
setInterval(() => { for (const res of listeners) res.write(': ping\n\n'); }, 25000);

/* ------------------------------------------------------------------ */
/* Respaldos automáticos                                               */
/* ------------------------------------------------------------------ */
async function backup(tag) {
  return enqueue(async () => {
    const dump = await DB.exportAll();
    const d = new Date();
    const name = tag ? `respaldo-${U.dateKey(d)}-${tag}-${d.getTime()}.json` : `respaldo-${U.dateKey(d)}.json`;
    fs.writeFileSync(path.join(BACKUP_DIR, name + '.tmp'), JSON.stringify(dump));
    fs.renameSync(path.join(BACKUP_DIR, name + '.tmp'), path.join(BACKUP_DIR, name));
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort();
    for (const f of files.slice(0, Math.max(0, files.length - 40))) fs.unlinkSync(path.join(BACKUP_DIR, f));
    return name;
  });
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.csv': 'text/csv; charset=utf-8' };
const PUBLIC_DIRS = ['index.html', 'icon.png', 'css', 'js', 'vendor', 'plantilla-productos.xlsx', 'plantilla-productos.csv'];

function send(req, res, status, body, type = 'application/json; charset=utf-8') {
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const headers = { 'Content-Type': type, 'Cache-Control': 'no-store' };
  if (buf.length > 20000 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) { buf = zlib.gzipSync(buf); headers['Content-Encoding'] = 'gzip'; }
  headers['Content-Length'] = buf.length;
  res.writeHead(status, headers);
  res.end(buf);
}
function readBody(req, limit = 300 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('Archivo demasiado grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(new Error('Datos inválidos')); } });
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  const p = url.pathname;
  if (p === '/api/info') {
    const onlyDefault = Store.usuarios.length === 1 && Store.usuarios[0].usuario === 'admin';
    const u0 = Store.usuarios[0];
    return send(req, res, 200, { nombre: Store.config.negocio.nombre, version: VERSION, primeraVez: onlyDefault && u0.password === await U.hash('') });
  }
  if (p === '/api/login' && req.method === 'POST') {
    const b = await readBody(req, 100000);
    const u = await enqueue(async () => { try { return await Store.login(b.usuario, b.password); } finally { Store.user = null; } });
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, { userId: u.id, overrides: new Map() });
    return send(req, res, 200, { token, user: sanitizeUser(u) });
  }

  const session = sessionFrom(req, url);
  if (!session) return send(req, res, 401, { error: 'Sesión no válida. Vuelva a iniciar sesión.' });

  if (p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(': conectado\n\n');
    listeners.add(res);
    req.on('close', () => listeners.delete(res));
    return;
  }
  if (p === '/api/logout' && req.method === 'POST') {
    sessions.delete(req.headers['x-token']);
    return send(req, res, 200, { ok: true });
  }
  if (p === '/api/bootstrap') {
    const caja = url.searchParams.get('caja') || 'Caja 1';
    const tickets = await DB.get('meta', 'tickets:' + caja);
    return send(req, res, 200, {
      config: Store.config, productos: Store.productos, departamentos: Store.departamentos, clientes: Store.clientes,
      promociones: Store.promociones, usuarios: Store.usuarios.map(sanitizeUser), turno: openTurnos.get(caja) || null,
      tickets: tickets ? tickets.value : null, user: sanitizeUser(session.user), cajas: [...openTurnos.keys()],
    });
  }
  if (p === '/api/autorizar' && req.method === 'POST') {
    const b = await readBody(req, 100000);
    const u = Store.usuarios.find(x => U.norm(x.usuario) === U.norm(b.usuario) && x.activo !== false);
    const ok = !!(u && u.password === await U.hash(b.password || '') && (u.admin || (u.permisos || {})[b.perm]));
    if (ok) session.overrides.set(b.perm, Date.now() + 3 * 60 * 1000);
    return send(req, res, 200, { ok });
  }
  if (p === '/api/rpc' && req.method === 'POST') {
    const b = await readBody(req);
    try {
      const out = await rpc(session, b.method, Array.isArray(b.args) ? b.args : [], b.caja);
      return send(req, res, 200, out);
    } catch (e) {
      return send(req, res, 400, { error: e.message || String(e) });
    }
  }
  if (p === '/api/db') {
    const q = url.searchParams, s = q.get('store'), op = q.get('op');
    if (!SCHEMA[s] || s === 'usuarios' || s === 'meta') return send(req, res, 403, { error: 'No permitido' });
    const val = (k) => { const v = q.get(k); const n = Number(v); return v !== null && v !== '' && !isNaN(n) ? n : v; };
    let data;
    if (op === 'all') data = await DB.all(s);
    else if (op === 'get') data = (await DB.get(s, val('key'))) ?? null;
    else if (op === 'byIndex') data = await DB.byIndex(s, q.get('index'), val('value'));
    else if (op === 'range') data = await DB.range(s, q.get('index'), val('from'), val('to'));
    else if (op === 'count') data = await DB.count(s);
    else return send(req, res, 400, { error: 'Operación inválida' });
    return send(req, res, 200, { data });
  }
  if (p === '/api/respaldo') {
    if (!allowed(session, 'configuracion')) return send(req, res, 403, { error: 'Sin permiso' });
    const dump = await enqueue(() => DB.exportAll());
    return send(req, res, 200, dump);
  }
  if (p === '/api/respaldos') {
    if (!allowed(session, 'configuracion')) return send(req, res, 403, { error: 'Sin permiso' });
    if (req.method === 'POST') return send(req, res, 200, { archivo: await backup('manual') });
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort().reverse();
    return send(req, res, 200, { carpeta: BACKUP_DIR, archivos: files.map(f => ({ nombre: f, bytes: fs.statSync(path.join(BACKUP_DIR, f)).size })) });
  }
  if (p === '/api/red') {
    return send(req, res, 200, { direcciones: lanAddresses().map(ip => `http://${ip}:${PORT}`), cajasConectadas: listeners.size, turnosAbiertos: [...openTurnos.values()] });
  }
  return send(req, res, 404, { error: 'No encontrado' });
}

function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'; } catch (e) { return send(req, res, 400, 'Dirección inválida', 'text/plain; charset=utf-8'); }
  const file = path.resolve(ROOT, rel);
  const top = path.relative(ROOT, file).split(path.sep)[0];
  if (!file.startsWith(ROOT + path.sep) || !PUBLIC_DIRS.includes(top)) return send(req, res, 404, 'No encontrado', 'text/plain; charset=utf-8');
  fs.readFile(file, (err, data) => {
    if (err) return send(req, res, 404, 'No encontrado', 'text/plain; charset=utf-8');
    send(req, res, 200, data, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    if (!res.headersSent) send(req, res, 400, { error: e.message || String(e) });
    else res.end();
  }
});

(async () => {
  await loadAll();
  await backup();
  setInterval(() => backup().catch(e => console.error('Error al respaldar:', e.message)), 6 * 3600 * 1000);
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') { console.log(`  El servidor ya está funcionando en el puerto ${PORT}.`); process.exit(0); }
    console.error(e); process.exit(1);
  });
  server.listen(PORT, '0.0.0.0', () => {
    const ips = lanAddresses();
    console.log('');
    console.log('  ==========================================================');
    console.log('   PUNTO DE VENTA - SERVIDOR ENCENDIDO  (no cierre esta ventana)');
    console.log('  ==========================================================');
    console.log(`   En esta computadora abra:   http://localhost:${PORT}`);
    for (const ip of ips) console.log(`   En las otras cajas abra:    http://${ip}:${PORT}`);
    console.log(`   Datos guardados en:         ${DATA_DIR}`);
    console.log('');
  });
})().catch((e) => { console.error(e); process.exit(1); });

const shutdown = () => { try { sql.close(); } catch (e) { /* ya cerrada */ } process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
