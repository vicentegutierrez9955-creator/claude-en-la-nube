// Prueba de los avisos de Tuerkit por WhatsApp (/api/publico/tuerkit y el botón Tuerkit del panel), con la API de
// Meta simulada: no se manda ningún mensaje real. Uso: npm run test:tuerkit
import { guardarCuenta, leerCuentas } from '../api/_lib/whatsapp.js';
import { cookieSesion } from '../api/_lib/panel.js';
const { default: router } = await import('../api/publico/[accion].js');
const { default: panelWsp } = await import('../api/panel/whatsapp.js');

const O = 'https://stpyme.cl';
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FALLA', m); if (!c) process.exitCode = 1; };

// ---------- Meta simulada ----------
const meta = { plantillas: [], enviados: [], fallaEnvio: null };
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, op = {}) => {
  const u = String(url);
  if (!u.startsWith('https://graph.facebook.com/')) return fetchReal(url, op);
  const cuerpo = op.body ? JSON.parse(op.body) : null;
  const res = (j, status = 200) => new Response(JSON.stringify(j), { status, headers: { 'content-type': 'application/json' } });
  if (u.includes('/message_templates') && (op.method || 'GET') === 'GET') return res({ data: meta.plantillas });
  if (u.includes('/message_templates')) { meta.plantillas.push({ name: cuerpo.name, language: cuerpo.language, status: 'PENDING', creada: cuerpo }); return res({ id: '99', status: 'PENDING', category: 'UTILITY' }); }
  if (u.endsWith('/messages')) {
    if (meta.fallaEnvio) return res({ error: { message: meta.fallaEnvio } }, 400);
    meta.enviados.push({ url: u, auth: op.headers.authorization, cuerpo });
    return res({ messages: [{ id: 'wamid.' + meta.enviados.length }] });
  }
  return res({});
};

await guardarCuenta({ waba: '111', phoneNumberId: '222', numero: '+56 9 5555 0001', nombre: 'Taller Gotuerca', token: 'token-del-taller', tipo: 'coexistencia', conectada: new Date().toISOString() });
await guardarCuenta({ waba: '333', phoneNumberId: '444', numero: '+56 9 5555 0002', nombre: 'Otro Taller', token: 'token-otro', tipo: 'nuevo', conectada: new Date().toISOString() });

process.env.PANEL_SECRET = 'secreto-local';
const cookie = cookieSesion('Vicente').split(';')[0];
const panel = (cuerpo) => panelWsp.fetch(new Request(O + '/api/panel/whatsapp', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(cuerpo) }));
// Igual que en Vercel: la ruta api/publico/[accion].js agrega ?accion=tuerkit.
const aviso = (cuerpo, clave) => router.fetch(new Request(O + '/api/publico/tuerkit?accion=tuerkit', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(clave ? { authorization: 'Bearer ' + clave } : {}) }, body: JSON.stringify(cuerpo),
}));
const datos = { telefono: '9 8765 4321', cliente: 'Juan', vehiculo: 'Toyota Yaris', patente: 'abcd12', estado: 'Listo para retirar' };

// ---------- Clave y plantillas desde el panel ----------
ok((await panelWsp.fetch(new Request(O + '/api/panel/whatsapp', { method: 'POST', body: JSON.stringify({ accion: 'tuerkit', waba: '111' }) }))).status === 401, 'el panel pide sesión');
let r = await panel({ accion: 'tuerkit', waba: '111' });
let j = await r.json();
ok(r.status === 200 && !j.clave && !j.tieneClave, 'sin clave todavía');
ok(meta.plantillas.map((p) => p.name).sort().join() === 'estado_vehiculo,estado_vehiculo_link' && meta.plantillas.every((p) => p.creada.category === 'UTILITY' && p.creada.language === 'es'), 'manda a Meta las 2 plantillas de utilidad');
ok(j.plantillas.every((p) => p.estado === 'PENDING'), 'muestra que están en revisión');
await panel({ accion: 'tuerkit', waba: '111' });
ok(meta.plantillas.length === 2, 'no las vuelve a crear si ya existen');
r = await panel({ accion: 'tuerkit', waba: '111', nueva: true });
j = await r.json();
const clave = j.clave;
ok(/^tk_[\w-]{30,}$/.test(clave || ''), 'crea la clave del taller');
const { cuentas } = await leerCuentas();
ok(cuentas['111'].tuerkit.hash && !JSON.stringify(cuentas['111']).includes(clave), 'guarda solo el hash de la clave');
const lista = await (await panel({ accion: 'cuentas' })).json();
ok(!JSON.stringify(lista).includes(cuentas['111'].tuerkit.hash) && lista.cuentas.find((c) => c.waba === '111').tuerkit, 'la lista de cuentas no muestra el hash');

// ---------- Avisos ----------
ok((await aviso(datos)).status === 401, 'sin clave: 401');
ok((await aviso(datos, 'tk_' + 'x'.repeat(40))).status === 401, 'clave inválida: 401');
ok((await router.fetch(new Request(O + '/api/publico/tuerkit'))).status === 405, 'GET no está permitido');
ok((await aviso({ ...datos, telefono: '123' }, clave)).status === 400, 'teléfono inválido: 400');
ok((await aviso({ ...datos, patente: '' }, clave)).status === 400, 'sin patente: 400');
ok((await aviso({ ...datos, link: 'http://inseguro.cl' }, clave)).status === 400, 'link sin https: 400');

r = await aviso({ ...datos, estado: 'Listo\npara   retirar' }, clave);
j = await r.json();
const env = meta.enviados.at(-1);
const params = env.cuerpo.template.components[0].parameters.map((p) => p.text);
ok(r.status === 200 && j.ok && j.plantilla === 'estado_vehiculo', 'manda el aviso con la plantilla sin link');
ok(env.url.endsWith('/222/messages') && env.auth === 'Bearer token-del-taller', 'sale desde el número y la cuenta del taller');
ok(env.cuerpo.to === '56987654321' && env.cuerpo.template.name === 'estado_vehiculo' && env.cuerpo.template.language.code === 'es', 'al celular del cliente con código de país');
ok(JSON.stringify(params) === JSON.stringify(['Juan', 'Taller Gotuerca', 'Toyota Yaris', 'ABCD12', 'Listo para retirar']), 'variables limpias (sin saltos de línea) y patente en mayúsculas');

r = await aviso({ ...datos, link: 'https://tuerkit.cl/auto/1', idEvento: 'orden-1-estado-3' }, clave);
j = await r.json();
ok(j.ok && j.plantilla === 'estado_vehiculo_link' && meta.enviados.at(-1).cuerpo.template.components[0].parameters.length === 6, 'con link usa la otra plantilla');
const antes = meta.enviados.length;
j = await (await aviso({ ...datos, link: 'https://tuerkit.cl/auto/1', idEvento: 'orden-1-estado-3' }, clave)).json();
ok(j.ok && j.repetido && meta.enviados.length === antes, 'con el mismo idEvento no lo manda dos veces');

meta.fallaEnvio = '(#132001) Template name does not exist in the translation';
r = await aviso({ ...datos, idEvento: 'falla-1' }, clave);
j = await r.json();
ok(r.status === 502 && /no está aprobada/.test(j.error), 'si Meta no tiene la plantilla aprobada, lo dice claro');
meta.fallaEnvio = null;
j = await (await aviso({ ...datos, idEvento: 'falla-1' }, clave)).json();
ok(j.ok && !j.repetido, 'un aviso que falló se puede reintentar con el mismo idEvento');

const pl = await (await aviso({ accion: 'plantillas' }, clave)).json();
ok(pl.plantillas.length === 2, 'Tuerkit puede consultar el estado de las plantillas');

const vista = await (await panel({ accion: 'tuerkit', waba: '111' })).json();
ok(vista.avisos.length >= 3 && vista.avisos.every((a) => !a.telefono.includes('8765')) && vista.avisos[0].telefono.endsWith('4321'), 'el panel muestra los últimos avisos con el teléfono tapado');

const vieja = clave;
const nueva = (await (await panel({ accion: 'tuerkit', waba: '111', nueva: true })).json()).clave;
ok((await aviso(datos, vieja)).status === 401 && (await aviso(datos, nueva)).status === 200, 'la clave nueva reemplaza a la anterior');
const otra = (await (await panel({ accion: 'tuerkit', waba: '333', nueva: true })).json()).clave;
await aviso(datos, otra);
ok(meta.enviados.at(-1).url.endsWith('/444/messages'), 'cada clave manda desde su propio taller');
