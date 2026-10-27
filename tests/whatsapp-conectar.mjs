// Prueba del registro insertado ("Conectar WhatsApp"), en memoria y sin llamar a Meta. Uso: node tests/whatsapp-conectar.mjs
import { createHmac } from 'node:crypto';
Object.assign(process.env, { PANEL_STORE: 'memory', PANEL_SECRET: 'local', WHATSAPP_APP_SECRET: 'secreto', WHATSAPP_TOKEN: 'tk-stpyme', WHATSAPP_PHONE_NUMBER_ID: '111', PANEL_API_TOKEN: 'api' });
const llamadas = [];
globalThis.fetch = async (u, o = {}) => {
  const url = new URL(String(u));
  const ruta = url.pathname.replace(/^\/v[\d.]+\//, '');
  llamadas.push({ ruta, metodo: o.method || 'GET', auth: o.headers?.authorization, cuerpo: o.body ? JSON.parse(o.body) : null, q: url.searchParams });
  const r = (x) => new Response(JSON.stringify(x));
  if (ruta === 'oauth/access_token') return url.searchParams.get('code') === 'bueno' ? r({ access_token: 'tk-negocio' }) : new Response(JSON.stringify({ error: { message: 'código inválido' } }), { status: 400 });
  if (ruta === 'debug_token') return r({ data: { granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: ['2222222222222222'] }] } });
  if (ruta.endsWith('/phone_numbers')) return r({ data: [{ id: '333' }] });
  if (ruta.endsWith('/subscribed_apps') || ruta.endsWith('/register')) return r({ success: true });
  if (ruta.endsWith('/messages')) return r({ messages: [{ id: 'wamid.X' }] });
  return r({ display_phone_number: '+56 9 1111 2222', verified_name: 'Taller Prueba' });
};
const { cookieSesion } = await import('../api/_lib/panel.js');
const { default: panel } = await import('../api/panel/whatsapp.js');
const { default: hook } = await import('../api/whatsapp/webhook.js');
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FALLA', m); if (!c) process.exitCode = 1; };
const H = 'https://sitio.test';
const cookie = cookieSesion('Vicente').split(';')[0];
const post = (cuerpo, conSesion = true) => panel.fetch(new Request(H + '/api/panel/whatsapp', { method: 'POST', body: JSON.stringify(cuerpo), headers: { 'content-type': 'application/json', ...(conSesion ? { cookie } : {}) } }));

ok((await post({ accion: 'conectar', code: 'bueno' }, false)).status === 401, 'sin sesión no conecta');
ok((await panel.fetch(new Request(H + '/api/panel/whatsapp?t=api&accion=conectar&code=bueno'))).status === 405, 'con el token de Claude no conecta (solo desde el panel)');
let r = await post({ accion: 'conectar', code: 'malo' });
ok(r.status === 502 && (await r.json()).error.includes('código inválido'), 'informa si Meta rechaza el código');

llamadas.length = 0;
r = await post({ accion: 'conectar', code: 'bueno', waba: '1234567890123456', telefono: '444', tipo: 'nuevo' });
let j = await r.json();
const canje = llamadas.find((l) => l.ruta === 'oauth/access_token');
ok(r.status === 200 && j.ok && j.numero === '+56 9 1111 2222' && j.suscrita && j.registrado === true, 'número nuevo: canjea, suscribe la app y registra el número');
ok(canje.q.get('client_id') === '2621913031556176' && canje.q.get('client_secret') === 'secreto', 'canjea con el ID y la clave de la app');
ok(llamadas.find((l) => l.ruta === '1234567890123456/subscribed_apps')?.auth === 'Bearer tk-negocio', 'suscribe con el token del negocio');
ok(/^\d{6}$/.test(llamadas.find((l) => l.ruta === '444/register')?.cuerpo?.pin || ''), 'registra con un PIN de 6 dígitos');
ok(!JSON.stringify(j).includes('tk-negocio'), 'la respuesta no incluye el token');

llamadas.length = 0;
r = await post({ accion: 'conectar', code: 'bueno', tipo: 'coexistencia' });
j = await r.json();
ok(j.ok && j.waba === '2222222222222222' && j.telefono === '333', 'sin IDs del navegador, los saca de los permisos y de la cuenta');
ok(!llamadas.some((l) => l.ruta.endsWith('/register')) && j.registrado === null, 'coexistencia: no registra el número (ya está en WhatsApp Business)');

r = await panel.fetch(new Request(H + '/api/panel/whatsapp?t=api&accion=cuentas'));
j = await r.json();
ok(j.cuentas.length === 2 && j.cuentas.every((c) => !c.token && !c.pin) && j.cuentas[0].por === 'Vicente', 'lista las cuentas sin tokens ni PIN');

llamadas.length = 0;
r = await post({ accion: 'probar', waba: '2222222222222222', para: '56962333569', plantilla: 'hello_world' });
const envio = llamadas.find((l) => l.ruta.endsWith('/messages'));
ok(r.status === 200 && envio.ruta === '333/messages' && envio.auth === 'Bearer tk-negocio' && envio.cuerpo.template.name === 'hello_world', 'la prueba sale desde el número conectado con su token');
ok((await post({ accion: 'probar', waba: '999', para: '56962333569', plantilla: 'hello_world' })).status === 404, 'no envía desde una cuenta no conectada');

// Un mensaje al número del cliente se registra pero no recibe respuestas automáticas de STPyme.
llamadas.length = 0;
const b = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: '333' }, contacts: [], messages: [{ id: 'c1', from: '56962333569', timestamp: '1792400000', type: 'text', text: { body: 'hola' } }] } }] }] });
await hook.fetch(new Request(H + '/api/whatsapp/webhook', { method: 'POST', body: b, headers: { 'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'secreto').update(b).digest('hex') } }));
ok(!llamadas.some((l) => l.ruta.endsWith('/messages')), 'webhook: no responde automáticamente en la línea de un cliente');
const est = await (await panel.fetch(new Request(H + '/api/panel/whatsapp?t=api&accion=estado'))).json();
ok(est.mensajes.some((m) => m.id === 'c1' && m.linea === '333'), 'webhook: registra el mensaje con su línea');

// Invitaciones: el panel crea un link y el negocio conecta desde la página pública, una sola vez.
const { default: publico } = await import('../api/publico/[accion].js');
r = await post({ accion: 'invitar', negocio: 'TTM Service' });
j = await r.json();
const inv = new URL(j.link).searchParams.get('i');
ok(r.status === 200 && j.link.startsWith('https://stpyme.cl/conectar-whatsapp?i=') && inv.length >= 20, 'el panel crea un link de invitación');
ok((await panel.fetch(new Request(H + '/api/panel/whatsapp?t=api&accion=invitar&negocio=X'))).status === 405, 'con el token de Claude no crea invitaciones');
r = await publico.fetch(new Request(H + '/api/publico/whatsapp?i=' + inv));
ok(r.status === 200 && (await r.json()).negocio === 'TTM Service', 'la página pública muestra el negocio de la invitación');
ok((await publico.fetch(new Request(H + '/api/publico/whatsapp?i=inventado-no-existe-123456'))).status === 404, 'rechaza una invitación inventada');
const pub = (b, origin = H) => publico.fetch(new Request(H + '/api/publico/whatsapp', { method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) } }));
ok((await pub({ i: inv, code: 'bueno', tipo: 'coexistencia' }, 'https://otro.sitio')).status === 403, 'no acepta conexiones desde otro sitio');
r = await pub({ i: inv, code: 'bueno', waba: '5555555555555555', telefono: '666', tipo: 'coexistencia' });
j = await r.json();
ok(r.status === 200 && j.ok && !JSON.stringify(j).includes('tk-negocio'), 'el negocio conecta con su link (sin ver el token)');
ok((await pub({ i: inv, code: 'bueno', tipo: 'coexistencia' })).status === 404, 'el link no sirve dos veces');
const cs = (await (await panel.fetch(new Request(H + '/api/panel/whatsapp?t=api&accion=cuentas'))).json()).cuentas;
ok(cs.some((c) => c.waba === '5555555555555555' && c.negocio === 'TTM Service'), 'la cuenta queda guardada con el nombre del negocio');
r = await post({ accion: 'invitaciones' });
j = await r.json();
ok(j.invitaciones[0].usada?.waba === '5555555555555555' && j.invitaciones[0].link === null, 'el panel ve la invitación como usada');
