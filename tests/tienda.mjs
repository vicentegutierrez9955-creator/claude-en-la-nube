// Prueba de la tienda con Mercado Pago simulado: orden → pago aprobado (webhook) → descarga → métricas del panel.
// Uso: npm run test:tienda
import assert from 'node:assert/strict';
process.env.PANEL_SECRET ||= 'secreto-local';
process.env.MP_ACCESS_TOKEN = 'TEST-token';
process.env.META_PIXEL_ID = '123'; process.env.META_CAPI_TOKEN = 'capi';
const { default: rutas } = await import('../api/publico/[accion].js');
const { cookieSesion } = await import('../api/_lib/panel.js');

let pagoMonto = 5000, ultimaOrden = null; const llamadas = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = async (u, o = {}) => {
  const url = String(u);
  llamadas.push(url);
  if (url.startsWith('https://api.mercadopago.com/checkout/preferences')) {
    const b = JSON.parse(o.body); ultimaOrden = b.external_reference;
    assert.equal(b.items[0].unit_price, 5000); assert.equal(b.items[0].currency_id, 'CLP');
    return new Response(JSON.stringify({ id: 'pref-1', init_point: 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=pref-1' }));
  }
  if (url.startsWith('https://api.mercadopago.com/v1/payments/')) return new Response(JSON.stringify({ id: 999, status: 'approved', external_reference: ultimaOrden, transaction_amount: pagoMonto, currency_id: 'CLP', payment_type_id: 'credit_card' }));
  if (url.startsWith('https://graph.facebook.com/') || url.startsWith('https://api.resend.com/')) return new Response('{}');
  return fetchReal(u, o);
};
const B = 'https://stpyme.cl/api/publico/tienda';
const pedir = (q, op = {}) => rutas.fetch(new Request(B + q, op));
const post = (q, body) => pedir(q, { method: 'POST', headers: { origin: 'https://stpyme.cl', 'content-type': 'application/json' }, body: JSON.stringify(body) });

// config
const cfg = await (await pedir('?op=config')).json();
assert.equal(cfg.meta, '123'); assert.equal(cfg.productos['ebook-web-ia'].precio > 0, true);
// eventos
assert.equal((await post('?op=evento', { producto: 'ebook-web-ia', pasos: ['vista', 'comprar', 'hackeo'], canal: 'meta', disp: 'movil' })).status, 200);
assert.equal((await pedir('?op=evento', { method: 'POST', headers: { origin: 'https://otro.cl' }, body: '{}' })).status, 403);
// orden con datos malos
assert.equal((await post('?op=orden', { producto: 'ebook-web-ia', nombre: 'Ana', email: 'malo' })).status, 400);
// orden ok
const r1 = await (await post('?op=orden', { producto: 'ebook-web-ia', nombre: 'Ana Pérez', email: 'ana@correo.cl', canal: 'meta', disp: 'movil', consentimiento: true, fbp: 'fb.1.1.1' })).json();
assert.ok(r1.url.includes('mercadopago')); const id = r1.orden;
// estado sin clave
assert.equal((await pedir(`?op=estado&orden=${id}&t=mala`)).status, 404);
// la clave correcta se saca del back_url que se mandó a MP: se recalcula igual que el servidor
const { createHmac } = await import('node:crypto');
const t = createHmac('sha256', process.env.PANEL_SECRET).update('orden:' + id).digest('base64url').slice(0, 24);
let e = await (await pedir(`?op=estado&orden=${id}&t=${t}`)).json();
assert.equal(e.estado, 'pendiente'); assert.equal(e.descarga, null);
assert.equal((await pedir(`?op=descarga&orden=${id}&t=${t}`)).status, 402);
// webhook de MP
assert.equal((await post('?op=webhook', { type: 'payment', data: { id: '999' } })).status, 200);
e = await (await pedir(`?op=estado&orden=${id}&t=${t}`)).json();
assert.equal(e.estado, 'pagado'); assert.ok(e.descarga);
assert.ok(llamadas.some((u) => u.startsWith('https://graph.facebook.com/v21.0/123/events')), 'manda la compra a Meta');
// webhook repetido no cuenta dos veces
await post('?op=webhook', { type: 'payment', data: { id: '999' } });
// descarga sin archivo subido
assert.equal((await pedir(`?op=descarga&orden=${id}&t=${t}`)).status, 503);
// subir archivo desde el panel
const cookie = cookieSesion('Vicente').split(';')[0];
assert.equal((await pedir('?op=archivo&producto=ebook-web-ia', { method: 'PUT', headers: { 'content-type': 'application/pdf' }, body: Buffer.from('%PDF-1.4 ' + 'x'.repeat(2000)) })).status, 401);
assert.equal((await pedir('?op=archivo&producto=ebook-web-ia', { method: 'PUT', headers: { 'content-type': 'application/pdf', cookie }, body: Buffer.from('%PDF-1.4 ' + 'x'.repeat(2000)) })).status, 200);
const d = await pedir(`?op=descarga&orden=${id}&t=${t}`);
assert.equal(d.status, 200); assert.equal(d.headers.get('content-type'), 'application/pdf');
// orden abandonada (pago bajo el precio queda "revisar")
const r2 = await (await post('?op=orden', { producto: 'ebook-web-ia', nombre: 'Luis', email: 'luis@correo.cl', canal: 'google', disp: 'escritorio' })).json();
pagoMonto = 100; await post('?op=webhook', { type: 'payment', data: { id: '1000' } });
// métricas
const m = await (await pedir('?op=panel', { headers: { cookie } })).json();
const suma = (paso) => m.pasos.filter((x) => x.paso === paso).reduce((s, x) => s + x.n, 0);
assert.equal(suma('vista'), 1); assert.equal(suma('comprar'), 1); assert.equal(suma('pago'), 2); assert.equal(suma('compra'), 1);
assert.equal(m.ordenes.length, 2); assert.equal(m.ordenes.find((o) => o.id === r2.orden).estado, 'revisar');
assert.ok(!('ip' in m.ordenes[0]), 'no muestra la IP en el panel');
assert.equal(m.archivos['ebook-web-ia'], true);
console.log('tienda: todo bien ✔');
