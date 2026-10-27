// Prueba del bot de WhatsApp de los negocios y de su panel (/mi-whatsapp), en memoria y sin llamar a Meta ni a DeepSeek.
// Uso: node tests/bot.mjs
import { createHmac } from 'node:crypto';
Object.assign(process.env, { PANEL_STORE: 'memory', PANEL_SECRET: 'local', WHATSAPP_APP_SECRET: 'secreto', WHATSAPP_TOKEN: 'tk-stpyme', WHATSAPP_PHONE_NUMBER_ID: '111', BOT_ESPERA_MS: '0' });
delete process.env.DEEPSEEK_API_KEY;
const llamadas = [];
let respuestaIA = 'Hola, la atención podológica cuesta $18.000.';
globalThis.fetch = async (u, o = {}) => {
  const url = new URL(String(u));
  const cuerpo = o.body ? JSON.parse(o.body) : null;
  if (url.hostname === 'api.deepseek.com') {
    llamadas.push({ ia: true, auth: o.headers?.authorization, cuerpo });
    return new Response(JSON.stringify({ choices: [{ message: { content: respuestaIA } }], usage: { total_tokens: 900 } }));
  }
  const ruta = url.pathname.replace(/^\/v[\d.]+\//, '');
  llamadas.push({ ruta, metodo: o.method || 'GET', auth: o.headers?.authorization, cuerpo });
  const r = (x) => new Response(JSON.stringify(x));
  if (ruta.endsWith('/messages')) return r({ messages: [{ id: `wamid.${llamadas.length}` }] });
  if (ruta.endsWith('/message_templates')) return o.method === 'POST' ? r({ id: 'pl1', status: 'PENDING', category: 'UTILITY' }) : r({ data: [{ name: 'hello_world', status: 'APPROVED', category: 'UTILITY', language: 'en_US' }] });
  return r({});
};
const { cookieSesion } = await import('../api/_lib/panel.js');
const { guardarCuenta } = await import('../api/_lib/whatsapp.js');
const { cambiarChats, leerChats } = await import('../api/_lib/bot.js');
const { default: panel } = await import('../api/panel/whatsapp.js');
const { default: hook } = await import('../api/whatsapp/webhook.js');
const { default: publico } = await import('../api/publico/[accion].js');
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FALLA', m); if (!c) process.exitCode = 1; };
const H = 'https://sitio.test';
const cookie = cookieSesion('Vicente').split(';')[0];
const post = (cuerpo) => panel.fetch(new Request(H + '/api/panel/whatsapp', { method: 'POST', body: JSON.stringify(cuerpo), headers: { 'content-type': 'application/json', cookie } }));
let n = 0;
const aviso = (valor) => {
  const b = JSON.stringify({ entry: [{ changes: [{ value: { metadata: { phone_number_id: '888' }, contacts: [{ wa_id: '56911112222', profile: { name: 'Ana' } }], ...valor } }] }] });
  return hook.fetch(new Request(H + '/api/whatsapp/webhook', { method: 'POST', body: b, headers: { 'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'secreto').update(b).digest('hex') } }));
};
const msg = (texto, de = '56911112222', haceSeg = 0) => ({ id: `in${++n}`, from: de, timestamp: String(Math.floor(Date.now() / 1000) - haceSeg), type: 'text', text: { body: texto } });
const enviados = () => llamadas.filter((l) => l.ruta?.endsWith('/messages'));
const ias = () => llamadas.filter((l) => l.ia);

await guardarCuenta({ waba: '777', phoneNumberId: '888', token: 'tk-negocio', negocio: 'Podología Carmen', numero: '+56 9 3333 4444', tipo: 'coexistencia' });

// Bot apagado: el mensaje se guarda en los chats del negocio y nadie responde.
await aviso({ messages: [msg('hola, cuánto cuesta la atención?', '56911112222', 3600)] });
let { doc } = await leerChats('777');
ok(doc.chats['56911112222']?.mensajes.length === 1 && doc.chats['56911112222'].nombre === 'Ana', 'guarda el mensaje del cliente en los chats del negocio');
ok(!enviados().length, 'con el bot apagado no responde');

// El equipo crea el link del panel del cliente.
let r = await post({ accion: 'acceso', waba: '777' });
let j = await r.json();
const k = new URL(j.link).hash.match(/k=([\w-]+)/)?.[1];
ok(r.status === 200 && j.link.startsWith('https://stpyme.cl/mi-whatsapp#k=') && k.length >= 24, 'el panel crea el link del panel del cliente (clave después de #)');
ok((await (await post({ accion: 'acceso', waba: '777' })).json()).link === j.link, 'el link se mantiene si no se pide uno nuevo');
const cs = (await (await post({ accion: 'cuentas' })).json()).cuentas;
ok(cs[0].panelCliente === true && !JSON.stringify(cs).includes(k) && !JSON.stringify(cs).includes('tk-negocio'), 'la lista de cuentas no muestra la clave ni el token');

const cli = (b, origin = H) => publico.fetch(new Request(H + '/api/publico/cliente', { method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) } }));
ok((await cli({ k: 'x'.repeat(32), accion: 'datos' })).status === 401, 'panel del cliente: rechaza una clave inventada');
ok((await cli({ k, accion: 'datos' }, 'https://otro.sitio')).status === 403, 'panel del cliente: no acepta pedidos de otro sitio');
r = await cli({ k, accion: 'datos' });
j = await r.json();
ok(r.status === 200 && j.negocio === 'Podología Carmen' && j.chats[0].numero === '56911112222' && j.chats[0].noLeidos === 1 && !JSON.stringify(j).includes('tk-negocio'), 'panel del cliente: ve sus chats (sin el token)');

// Configura y prende el bot.
r = await cli({ k, accion: 'guardar', config: { activo: true, negocio: 'Podología Carmen', servicios: 'Atención podológica: $18.000', respuestas: [{ palabras: 'horario, a que hora', respuesta: 'Atendemos de lunes a viernes de 9 a 19 h.' }, { palabras: '', respuesta: 'vacía' }], topeTokensMes: 5, inventado: 'x' } });
j = await r.json();
ok(r.status === 200 && j.config.activo && j.config.respuestas.length === 1 && j.config.topeTokensMes === 100000 && !('inventado' in j.config), 'guarda la configuración limpia (campos conocidos, tope mínimo)');

// Respuesta fija: sin IA.
llamadas.length = 0;
await aviso({ messages: [msg('A qué hora atienden?')] });
ok(enviados().length === 1 && enviados()[0].ruta === '888/messages' && enviados()[0].auth === 'Bearer tk-negocio' && enviados()[0].cuerpo.text.body.startsWith('Atendemos'), 'respuesta fija desde el número del negocio, sin IA');
ok(!ias().length, 'la respuesta fija no llama a DeepSeek');

// "ok", "gracias", stickers: no responde.
llamadas.length = 0;
await aviso({ messages: [msg('ok gracias!')] });
await aviso({ messages: [{ id: `in${++n}`, from: '56911112222', timestamp: String(Math.floor(Date.now() / 1000)), type: 'sticker', sticker: {} }] });
ok(!enviados().length && !ias().length, 'no responde "ok gracias" ni stickers');

// Sin la clave de DeepSeek: pasa el chat a una persona con el mensaje de derivar.
llamadas.length = 0;
await aviso({ messages: [msg('tienen hora para mañana?', '56955556666')] });
({ doc } = await leerChats('777'));
ok(enviados()[0]?.cuerpo.text.body.startsWith('Gracias por escribir') && doc.chats['56955556666'].derivado, 'sin DEEPSEEK_API_KEY deriva a una persona (no deja al cliente sin respuesta)');

// Con DeepSeek: responde con IA, sin datos personales en lo que se manda.
process.env.DEEPSEEK_API_KEY = 'sk-prueba';
llamadas.length = 0;
await aviso({ messages: [msg('Hola, mi correo es ana@mail.cl y mi fono +56 9 8765 4321, cuánto cuesta la atención?', '56977778888'), msg('y atienden niños?', '56977778888')] });
const ia = ias()[0];
ok(ias().length === 1 && enviados().length === 1, 'dos mensajes seguidos: una sola llamada a la IA y una sola respuesta');
ok(ia?.auth === 'Bearer sk-prueba' && ia.cuerpo.messages[0].role === 'system' && ia.cuerpo.messages[0].content.includes('$18.000'), 'la IA recibe lo que sabe el bot');
const textoIA = JSON.stringify(ia?.cuerpo.messages.slice(1));
ok(!textoIA.includes('ana@mail.cl') && !textoIA.includes('8765') && textoIA.includes('[correo]'), 'no manda correos ni teléfonos a la IA');
({ doc } = await leerChats('777'));
ok(doc.chats['56977778888'].mensajes.at(-1).por === 'bot' && doc.uso.tokens === 900 && doc.uso.respuestas === 1, 'guarda la respuesta del bot y el uso del mes');

// Si el bot preguntó algo, un "sí" se responde.
respuestaIA = '¿Te reservo para mañana a las 10?';
await aviso({ messages: [msg('tienen hora mañana?', '56966667777')] });
respuestaIA = 'Listo, quedaste para mañana a las 10.';
llamadas.length = 0;
await aviso({ messages: [msg('sí', '56966667777')] });
ok(ias().length === 1 && enviados().length === 1, 'después de una pregunta del bot, un "sí" sí se responde');

// Dos avisos casi al mismo tiempo para el mismo chat: responde solo el del último mensaje.
process.env.BOT_ESPERA_MS = '80';
llamadas.length = 0;
await Promise.all([aviso({ messages: [msg('otra pregunta', '56900001111')] }), new Promise((s) => setTimeout(s, 20)).then(() => aviso({ messages: [msg('y otra más', '56900001111')] }))]);
ok(ias().length === 1 && enviados().length === 1, 'mensajes en avisos seguidos: una sola respuesta');
process.env.BOT_ESPERA_MS = '0';

// El dueño responde desde su app (coexistencia): el bot se pausa en ese chat.
llamadas.length = 0;
await aviso({ message_echoes: [{ id: `eco${++n}`, from: '56933334444', to: '56977778888', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Hola Ana, soy Carmen' } }] });
await aviso({ messages: [msg('ah gracias Carmen, y el precio?', '56977778888')] });
({ doc } = await leerChats('777'));
ok(doc.chats['56977778888'].mensajes.some((m) => m.por === 'dueño') && !enviados().length, 'si el dueño responde desde su celular, el bot no se mete en ese chat');

// La IA pide derivar.
respuestaIA = '[DERIVAR] Una persona del equipo te responderá pronto.';
llamadas.length = 0;
await aviso({ messages: [msg('quiero hacer un reclamo', '56922223333')] });
({ doc } = await leerChats('777'));
ok(enviados()[0]?.cuerpo.text.body === 'Una persona del equipo te responderá pronto.' && doc.chats['56922223333'].derivado && doc.chats['56922223333'].pausadoHasta, 'si la IA deriva: avisa al cliente, marca el chat y pausa el bot');
respuestaIA = 'Claro, te ayudo.';

// Tope de uso del mes: deja de usar IA.
await cambiarChats('777', (d) => { d.uso.tokens = 100000; });
llamadas.length = 0;
await aviso({ messages: [msg('una consulta', '56944445555')] });
ok(!ias().length && enviados()[0]?.cuerpo.text.body.startsWith('Gracias por escribir'), 'al llegar al tope del mes no llama a la IA y deriva');
await cambiarChats('777', (d) => { d.uso.tokens = 0; });

// Panel del cliente: leer, responder, pausar, simular.
r = await cli({ k, accion: 'chat', numero: '56922223333' });
j = await r.json();
ok(r.status === 200 && j.mensajes.length === 2 && j.derivado && j.ventana, 'abre un chat con sus mensajes');
llamadas.length = 0;
r = await cli({ k, accion: 'responder', numero: '56922223333', texto: 'Hola, soy Carmen, ¿qué pasó?' });
({ doc } = await leerChats('777'));
ok(r.status === 200 && enviados()[0]?.ruta === '888/messages' && doc.chats['56922223333'].mensajes.at(-1).por === 'dueño' && !doc.chats['56922223333'].derivado, 'responde desde el panel con el número del negocio');
await cambiarChats('777', (d) => { for (const m of d.chats['56911112222'].mensajes) m.fecha = '2026-01-01T00:00:00.000Z'; });
ok((await cli({ k, accion: 'responder', numero: '56911112222', texto: 'hola' })).status === 409, 'fuera de las 24 h no deja responder con texto libre');
r = await cli({ k, accion: 'pausar', numero: '56922223333', horas: 0 });
({ doc } = await leerChats('777'));
ok(r.status === 200 && !doc.chats['56922223333'].pausadoHasta, 'reactiva el bot en un chat');
llamadas.length = 0;
r = await cli({ k, accion: 'simular', config: { servicios: 'Uña encarnada: $25.000' }, mensajes: [{ por: 'cliente', texto: 'cuánto cuesta la uña encarnada?' }] });
j = await r.json();
ok(r.status === 200 && j.texto === 'Claro, te ayudo.' && !enviados().length && ias()[0].cuerpo.messages[0].content.includes('$25.000'), 'el simulador usa la configuración sin guardar y no envía nada');
r = await cli({ k, accion: 'simular', mensajes: [{ por: 'cliente', texto: 'horario?' }] });
ok((await r.json()).nota?.includes('sin IA'), 'el simulador muestra las respuestas fijas');

// Plantillas (para la revisión de Meta y los avisos fuera de las 24 h).
llamadas.length = 0;
r = await post({ accion: 'crearPlantilla', waba: '777', nombre: 'Confirmación Hora', categoria: 'UTILITY', cuerpo: 'Hola {{1}}, tu hora es el {{2}}.', ejemplos: 'Ana, martes a las 10:00' });
j = await r.json();
const pl = llamadas.find((l) => l.ruta === '777/message_templates');
ok(r.status === 200 && j.nombre === 'confirmacion_hora' && pl.auth === 'Bearer tk-negocio' && pl.cuerpo.components[0].example.body_text[0][1] === 'martes a las 10:00', 'crea una plantilla con nombre válido y ejemplos de las variables');
r = await post({ accion: 'plantillas', waba: '777' });
ok((await r.json()).plantillas[0].name === 'hello_world', 'lista las plantillas de la cuenta');
ok((await panel.fetch(new Request(H + '/api/panel/whatsapp?t=x&accion=acceso&waba=777'))).status === 401, 'sin sesión no crea links del panel del cliente');
