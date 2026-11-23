// Prueba en el navegador de la tienda completa con Mercado Pago simulado: aviso de cookies, botón de compra,
// formulario, ida a Mercado Pago, vuelta a /gracias con el pago aprobado, descarga y la pestaña Tienda del panel.
// Sirve los archivos locales y la API en memoria (no cobra ni publica nada real).
// Uso: PANEL_STORE=memory node tests/tienda-navegador.mjs [carpeta-para-capturas]
import { createRequire } from 'node:module';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
process.env.PANEL_SECRET ||= 'secreto-local';
process.env.MP_ACCESS_TOKEN = 'TEST-token';
process.env.META_PIXEL_ID = '123';
const { default: publico } = await import('../api/publico/[accion].js');
const { default: datos } = await import('../api/panel/datos.js');
const { cookieSesion } = await import('../api/_lib/panel.js');
const RAIZ = new URL('..', import.meta.url).pathname;
const CAPTURAS = process.argv[2] || '';
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FALLA', m); if (!c) process.exitCode = 1; };

// Mercado Pago simulado
const prefs = {}, pagos = {}; let nPago = 5000;
const fetchReal = globalThis.fetch;
globalThis.fetch = async (u, o = {}) => {
  const url = String(u);
  if (url.startsWith('https://api.mercadopago.com/checkout/preferences')) {
    const b = JSON.parse(o.body); prefs[b.external_reference] = b;
    return new Response(JSON.stringify({ id: 'pref-' + b.external_reference, init_point: 'https://www.mercadopago.cl/checkout/v1/redirect?pref_id=' + b.external_reference }));
  }
  if (url.startsWith('https://api.mercadopago.com/v1/payments/')) {
    const id = url.split('/').pop(), ref = pagos[id];
    return new Response(JSON.stringify({ id, status: 'approved', external_reference: ref, transaction_amount: prefs[ref]?.items[0].unit_price, currency_id: 'CLP', payment_type_id: 'debit_card' }));
  }
  if (url.startsWith('https://graph.facebook.com/') || url.startsWith('https://api.resend.com/')) return new Response('{}');
  return fetchReal(u, o);
};
// El PDF del ebook (uno chico de prueba)
const subida = await publico.fetch(new Request('https://stpyme.cl/api/publico/tienda?op=archivo&producto=ebook-web-ia', { method: 'PUT', headers: { cookie: cookieSesion('Prueba').split(';')[0], 'content-type': 'application/pdf', origin: 'https://stpyme.cl' }, body: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2000, 32)]) }));
if (subida.status !== 200) throw new Error('No se pudo subir el PDF de prueba: ' + (await subida.text()));

const TIPOS = { js: 'text/javascript', css: 'text/css', html: 'text/html; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
async function servir(route) {
  const req = route.request();
  const u = new URL(req.url());
  if (u.pathname.startsWith('/api/')) {
    const h = u.pathname === '/api/panel/datos' ? datos : publico;
    const cuerpo = req.postDataBuffer();
    const r = await h.fetch(new Request(u, { method: req.method(), headers: req.headers(), body: cuerpo && req.method() !== 'GET' ? cuerpo : undefined }));
    return route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) });
  }
  let rel = u.pathname.slice(1) || 'stpyme/index.html';
  let f = join(RAIZ, rel);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  else if (!existsSync(f) && existsSync(f + '.html')) f += '.html';
  if (!existsSync(f)) return route.fulfill({ status: 404, body: 'no' });
  return route.fulfill({ status: 200, contentType: TIPOS[f.split('.').pop()] || 'application/octet-stream', body: readFileSync(f) });
}
// Página de pago de Mercado Pago simulada: aprueba y vuelve a la URL de éxito.
async function mercadoPago(route) {
  const ref = new URL(route.request().url()).searchParams.get('pref_id');
  const pago = String(++nPago); pagos[pago] = ref;
  const vuelta = prefs[ref].back_urls.success + `&collection_id=${pago}&payment_id=${pago}&status=approved&external_reference=${ref}`;
  return route.fulfill({ status: 200, contentType: 'text/html', body: `<p>Mercado Pago</p><script>setTimeout(()=>location.href=${JSON.stringify(vuelta)},200)</script>` });
}

const b = await chromium.launch();
for (const [nombre, opciones] of [['celular', { ...devices['iPhone 13'], deviceScaleFactor: 1 }], ['computador', { viewport: { width: 1280, height: 900 } }]]) {
  const ctx = await b.newContext(opciones);
  await ctx.route('https://stpyme.cl/**', servir);
  await ctx.route('https://www.mercadopago.cl/**', mercadoPago);
  await ctx.route(/connect\.facebook\.net|googletagmanager|clarity\.ms|fonts\.(googleapis|gstatic)|images\.unsplash/, (r) => r.fulfill({ status: 200, body: '' }));
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));

  await p.goto('https://stpyme.cl/ebook?utm_source=instagram', { waitUntil: 'networkidle' });
  ok(await p.isVisible('.stp-cookies'), `${nombre}: aparece el aviso de cookies`);
  if (CAPTURAS) await p.screenshot({ path: `${CAPTURAS}/ebook-cookies-${nombre}.png` });
  await p.click('.stp-cookies .stp-btn.si');
  ok(!(await p.isVisible('.stp-cookies')), `${nombre}: al aceptar, el aviso se va`);

  await p.locator('a.pagar').first().click();
  ok(await p.evaluate(() => document.querySelector('.stp-dlg')?.open), `${nombre}: el botón abre el formulario de compra`);
  ok(/\$\s?5\.000/.test(await p.textContent('#stp-precio')), `${nombre}: el formulario muestra el precio`);
  await p.click('.stp-ir');
  ok(/nombre/.test(await p.textContent('.stp-err')), `${nombre}: sin nombre pide el nombre`);
  await p.fill('.stp-dlg input[name=nombre]', 'Camila Rojas');
  await p.fill('.stp-dlg input[name=email]', 'camila@correo.cl');
  await p.fill('.stp-dlg input[name=telefono]', '9 1234 5678');
  if (CAPTURAS) await p.screenshot({ path: `${CAPTURAS}/ebook-formulario-${nombre}.png` });
  await Promise.all([p.waitForURL(/stpyme\.cl\/gracias/, { timeout: 15000 }).catch(async (e) => { console.log('url', p.url(), 'error:', await p.textContent('.stp-err').catch(() => '?'), await p.evaluate(() => [...document.querySelectorAll('.stp-dlg')].map((d) => d.open + ':' + d.querySelector('[name=email]').value + ':' + d.querySelector('[name=nombre]').value))); throw e; }), p.click('.stp-ir')]);
  await p.waitForSelector('#accion a.btn', { timeout: 15000 });
  ok(/Listo, Camila/.test(await p.textContent('#titulo')), `${nombre}: /gracias confirma el pago`);
  const link = await p.getAttribute('#accion a.btn', 'href');
  const d = await p.evaluate((l) => fetch(l).then(async (r) => [r.status, (await r.text()).slice(0, 4)]), link);
  ok(d[0] === 200 && d[1] === '%PDF', `${nombre}: el link descarga el PDF (${d})`);
  if (CAPTURAS) await p.screenshot({ path: `${CAPTURAS}/gracias-${nombre}.png` });

  // Pago fallido: vuelve al ebook con aviso
  await p.goto('https://stpyme.cl/ebook?pago=fallido#comprar', { waitUntil: 'networkidle' });
  ok((await p.locator('.stp-aviso-pago').count()) === 1, `${nombre}: con pago fallido sale un aviso (una vez)`);

  // Panel
  const [n, v] = cookieSesion('Prueba').split(';')[0].split('=');
  await ctx.addCookies([{ name: n, value: v, domain: 'stpyme.cl', path: '/', secure: true, httpOnly: true }]);
  await p.goto('https://stpyme.cl/panel/', { waitUntil: 'networkidle' });
  await p.click('.tab[data-tab="tienda"]');
  await p.waitForSelector('#tienda .kpis', { timeout: 10000 });
  const kpis = await p.textContent('#tienda .kpis');
  ok(/Compras\s*[1-9]/.test(kpis) && /\$\s?[1-9]/.test(kpis), `${nombre}: el panel muestra las ventas (${kpis.replace(/\s+/g, ' ').trim()})`);
  ok(/Camila Rojas/.test(await p.textContent('#tienda')), `${nombre}: la venta aparece en la lista`);
  ok(/Instagram/.test(await p.textContent('#tienda')), `${nombre}: el canal sale de utm_source`);
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  ok(ancho <= 0, `${nombre}: el panel no se desborda a lo ancho (${ancho}px)`);
  if (CAPTURAS) await p.screenshot({ path: `${CAPTURAS}/panel-tienda-${nombre}.png`, fullPage: true });
  ok(!errores.length, `${nombre}: sin errores de JavaScript ${errores.join(' | ')}`);
  await ctx.close();
}
await b.close();
console.log(process.exitCode ? 'tienda en el navegador: hay fallas' : 'tienda en el navegador: todo bien ✔');
