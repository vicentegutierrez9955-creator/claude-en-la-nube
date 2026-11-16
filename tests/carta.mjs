// Prueba de las cartas con QR (/api/publico/carta), en memoria. Uso: npm run test:carta
import { leerDatos, cookieSesion } from '../api/_lib/panel.js';
const { default: api, limpiarCarta, localValido } = await import('../api/_lib/publico/carta.js');
const O = 'https://sitio.test';
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FALLA', m); if (!c) process.exitCode = 1; };
const post = (body, { origin = O, cookie } = {}) => api.fetch(new Request(O + '/api/publico/carta', {
  method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
}));
const ver = (local) => api.fetch(new Request(O + '/api/publico/carta?local=' + encodeURIComponent(local)));
const carta = (nombre = 'Picada Don Tito') => ({
  local: { nombre, frase: 'Casera', tel: '+56 9 1234 5678', logo: 'javascript:alert(1)' },
  diseno: { estilo: 'pizarra', color: '#e4572e', cols: 2, hoja: 'a4' },
  secciones: [{ id: 'x', titulo: 'Sándwiches', nota: '', items: [{ id: 'y', nombre: 'Barros Luco', desc: 'Carne y queso', precio: '7990', extra: 'no' }, { nombre: '', precio: '' }] }],
});
const pub = (extra = {}) => post({ accion: 'publicar', local: 'picada-don-tito', nombre: 'Tito', whatsapp: '9 8765 4321', carta: carta(), ...extra });

ok(localValido('picada-don-tito') && !localValido('Picada') && !localValido('ab') && !localValido('admin') && !localValido('a--b') && !localValido('-ab'), 'valida el link');
const c = limpiarCarta(carta());
ok(c && c.local.logo === '' && c.secciones[0].items.length === 1 && !('extra' in c.secciones[0].items[0]) && !('id' in c.secciones[0]), 'limpia la carta: sin logo inválido, sin campos extra ni platos vacíos');
ok(limpiarCarta({ local: { nombre: 'X' }, secciones: [] }) === null, 'rechaza carta sin platos');
ok((await ver('picada-don-tito')).status === 404, 'carta que no existe: 404');
ok((await post({ accion: 'publicar' }, { origin: 'https://otro.com' })).status === 403, 'rechaza otro sitio');
ok((await pub({ whatsapp: '1234' })).status === 400, 'pide WhatsApp válido');
ok((await pub({ local: 'admin' })).status === 400, 'rechaza links reservados');
let r = await pub({ web: 'http://spam' });
ok(r.status === 200 && (await ver('picada-don-tito')).status === 404, 'trampa para bots: no publica');
r = await pub();
const j = await r.json();
ok(r.status === 200 && j.clave && j.url === 'https://stpyme.cl/carta/picada-don-tito', 'publica y devuelve la clave de edición');
let v = await ver('picada-don-tito');
let vj = await v.json();
ok(v.status === 200 && vj.carta.local.nombre === 'Picada Don Tito' && !JSON.stringify(vj).includes('claveHash') && !JSON.stringify(vj).includes('87654321'), 'la carta pública no muestra la clave ni el WhatsApp del dueño');
ok(/s-maxage/.test(v.headers.get('cache-control')), 'la carta pública se guarda en caché unos segundos');
const p = (await leerDatos()).data.prospectos.find((x) => x.id === 'web-56987654321');
ok(p && p.estado === 'por contactar' && p.notas.includes('/carta/picada-don-tito') && p.creado[0].url.includes('/carta/'), 'deja al dueño como prospecto en el panel');
r = await pub({ whatsapp: '911111111' });
ok(r.status === 409, 'no deja tomar un link ocupado');
r = await post({ accion: 'actualizar', local: 'picada-don-tito', clave: 'mala', carta: carta('Otro') });
ok(r.status === 403, 'no actualiza sin la clave correcta');
r = await post({ accion: 'actualizar', local: 'picada-don-tito', clave: j.clave, carta: carta('Picada Don Tito 2') });
vj = await (await ver('picada-don-tito')).json();
ok(r.status === 200 && vj.carta.local.nombre === 'Picada Don Tito 2', 'actualiza con la clave (el mismo QR muestra la carta nueva)');
r = await post({ accion: 'reportar', local: 'picada-don-tito', motivo: 'Contenido falso' });
ok(r.status === 200, 'se puede reportar');
ok((await post({ accion: 'lista' })).status === 401, 'el panel pide sesión');
process.env.PANEL_SECRET = 'secreto-local';
const cookie = cookieSesion('Vicente').split(';')[0];
const lista = await (await post({ accion: 'lista' }, { cookie })).json();
ok(lista.cartas.length === 1 && lista.cartas[0].reportes === 1 && lista.cartas[0].negocio === 'Picada Don Tito 2', 'el panel lista las cartas con sus reportes');
r = await post({ accion: 'ocultar', local: 'picada-don-tito', oculta: true }, { cookie });
ok(r.status === 200 && (await ver('picada-don-tito')).status === 410, 'el panel puede pausar una carta');
ok((await post({ accion: 'actualizar', local: 'picada-don-tito', clave: j.clave, carta: carta() })).status === 403, 'una carta pausada no se puede editar');
await post({ accion: 'ocultar', local: 'picada-don-tito', oculta: false }, { cookie });
ok((await ver('picada-don-tito')).status === 200, 'y volver a mostrarla');
for (const n of ['dos', 'tres']) await pub({ local: 'local-' + n });
r = await pub({ local: 'local-cuatro' });
ok(r.status === 400, 'tope de 3 cartas por WhatsApp');
let ultimo;
for (let i = 0; i < 45; i++) ultimo = await pub({ local: 'local-n' + i, whatsapp: '95' + String(i).padStart(7, '0') });
ok(ultimo.status === 429, 'tope de cartas nuevas por día');
ok((await post({ accion: 'publicar', local: 'pesada', nombre: 'A', whatsapp: '922222222', carta: { ...carta(), relleno: 'x'.repeat(500000) } })).status === 413, 'rechaza cartas muy pesadas');
