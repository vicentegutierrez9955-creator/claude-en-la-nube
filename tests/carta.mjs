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
// ---------- Cartas subidas en PDF o fotos ----------
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6]);
const subir = (local, clave, n, total, cuerpo = JPG, tipo = 'image/jpeg', origin = O) => api.fetch(new Request(`${O}/api/publico/carta?accion=pagina&local=${local}&n=${n}&total=${total}&w=1200&h=1700`, {
  method: 'POST', headers: { 'content-type': tipo, 'x-clave': clave, ...(origin ? { origin } : {}) }, body: cuerpo,
}));
const img = (local, n) => api.fetch(new Request(`${O}/api/publico/carta?local=${local}&img=${n}`));
r = await post({ accion: 'publicar', local: 'cafe-subido', nombre: 'Rosa', whatsapp: '933333333', carta: { tipo: 'archivo', local: { nombre: 'Café Subido', tel: '9 1111 2222' } } });
const ja = await r.json();
ok(r.status === 200 && ja.clave, 'publica una carta subida (solo datos del local)');
ok((await subir('cafe-subido', 'mala', 0, 2)).status === 403, 'no sube páginas sin la clave');
ok((await subir('cafe-subido', ja.clave, 0, 2, new Uint8Array([60, 104, 116, 109, 108, 62]), 'image/jpeg')).status === 400, 'rechaza archivos que no son imágenes');
ok((await subir('cafe-subido', ja.clave, 0, 2, JPG, 'text/html')).status === 400, 'rechaza tipos que no son imagen');
ok((await subir('cafe-subido', ja.clave, 0, 11)).status === 400, 'máximo 10 páginas');
ok((await subir('cafe-subido', ja.clave, 0, 2, JPG, 'image/jpeg', 'https://otro.com')).status === 403, 'no sube desde otro sitio');
ok((await subir('cafe-subido', ja.clave, 0, 2)).status === 200 && (await subir('cafe-subido', ja.clave, 1, 2)).status === 200, 'sube 2 páginas');
// En Vercel la ruta api/publico/[accion].js agrega ?accion=carta a la URL: la subida tiene que funcionar igual.
const { default: router } = await import('../api/publico/[accion].js');
const comoVercel = (orden) => router.fetch(new Request(`${O}/api/publico/carta?${orden}&local=cafe-subido&n=1&total=2&w=1200&h=1700`, {
  method: 'POST', headers: { 'content-type': 'image/jpeg', 'x-clave': ja.clave, origin: O }, body: JPG,
}));
ok((await comoVercel('accion=carta&accion=pagina')).status === 200 && (await comoVercel('accion=pagina&accion=carta')).status === 200 && (await comoVercel('accion=carta')).status === 200, 'sube páginas aunque Vercel agregue ?accion=carta');
ok((await router.fetch(new Request(`${O}/api/publico/carta?accion=carta`, { method: 'POST', headers: { 'content-type': 'application/json', origin: O }, body: JSON.stringify({ accion: 'reportar', local: 'cafe-subido', motivo: 'prueba' }) }))).status === 200, 'las acciones en JSON siguen pasando por el router');
vj = await (await ver('cafe-subido')).json();
ok(vj.carta.tipo === 'archivo' && vj.carta.paginas.length === 2 && vj.carta.paginas[0].url.includes('img=0') && vj.carta.paginas[0].w === 1200 && !JSON.stringify(vj).includes('cartas/'), 'la carta pública trae los links de las páginas, sin rutas internas');
let ri = await img('cafe-subido', 1);
ok(ri.status === 200 && ri.headers.get('content-type') === 'image/jpeg' && (await ri.arrayBuffer()).byteLength === JPG.length, 'entrega la imagen de cada página');
ok((await img('cafe-subido', 5)).status === 404, 'página que no existe: 404');
r = await post({ accion: 'actualizar', local: 'cafe-subido', clave: ja.clave, carta: { tipo: 'archivo', local: { nombre: 'Café Subido 2' } } });
vj = await (await ver('cafe-subido')).json();
ok(r.status === 200 && vj.carta.local.nombre === 'Café Subido 2' && vj.carta.paginas.length === 2, 'actualiza los datos del local sin perder las páginas');
ok((await subir('cafe-subido', ja.clave, 0, 1)).status === 200 && (await (await ver('cafe-subido')).json()).carta.paginas.length === 1, 'al subir menos páginas, quedan solo las nuevas');
ok((await subir('picada-don-tito', j.clave, 0, 1)).status === 400, 'no sube páginas a una carta hecha con la herramienta');
await post({ accion: 'ocultar', local: 'cafe-subido', oculta: true }, { cookie });
ok((await img('cafe-subido', 0)).status === 404, 'una carta pausada no muestra sus imágenes');

for (const n of ['dos', 'tres']) await pub({ local: 'local-' + n });
r = await pub({ local: 'local-cuatro' });
ok(r.status === 400, 'tope de 3 cartas por WhatsApp');
let ultimo;
for (let i = 0; i < 45; i++) ultimo = await pub({ local: 'local-n' + i, whatsapp: '95' + String(i).padStart(7, '0') });
ok(ultimo.status === 429, 'tope de cartas nuevas por día');
ok((await post({ accion: 'publicar', local: 'pesada', nombre: 'A', whatsapp: '922222222', carta: { ...carta(), relleno: 'x'.repeat(500000) } })).status === 413, 'rechaza cartas muy pesadas');

