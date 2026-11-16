// Prueba en el navegador del flujo completo de la carta: diseñar con fondo, crear página y QR con un botón,
// y ver la carta publicada como imagen. Sirve los archivos locales y la API en memoria (no publica nada real).
// Uso: PANEL_STORE=memory node tests/carta-navegador.mjs [carpeta-para-capturas]
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const { default: router } = await import('../api/publico/[accion].js');
const RAIZ = new URL('..', import.meta.url).pathname;
const CAPTURAS = process.argv[2] || '';
const FOTO = join(RAIZ, 'tests/fixtures/fondo-madera.jpg');
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FALLA', m); if (!c) process.exitCode = 1; };

const ARCHIVOS = { '/herramientas/menu-restaurante': 'herramientas/menu-restaurante/index.html' };
async function servir(route) {
  const req = route.request();
  const u = new URL(req.url());
  if (u.pathname.startsWith('/api/publico/')) {
    const cuerpo = req.postDataBuffer();
    const r = await router.fetch(new Request(u, { method: req.method(), headers: req.headers(), body: cuerpo && req.method() !== 'GET' ? cuerpo : undefined }));
    return route.fulfill({ status: r.status, headers: Object.fromEntries(r.headers), body: Buffer.from(await r.arrayBuffer()) });
  }
  const rel = u.pathname.startsWith('/carta/') ? 'carta/index.html' : ARCHIVOS[u.pathname] || u.pathname.slice(1);
  const f = join(RAIZ, rel);
  if (!existsSync(f)) return route.fulfill({ status: 404, body: 'no' });
  const tipo = f.endsWith('.js') ? 'text/javascript' : 'text/html; charset=utf-8';
  return route.fulfill({ status: 200, contentType: tipo, body: readFileSync(f) });
}

const b = await chromium.launch();
for (const [nombre, opciones] of [['celular', { ...devices['iPhone 13'], deviceScaleFactor: 1 }], ['computador', { viewport: { width: 1280, height: 900 } }]]) {
  const ctx = await b.newContext(opciones);
  await ctx.route('https://stpyme.cl/**', servir);
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  await p.goto('https://stpyme.cl/herramientas/menu-restaurante', { waitUntil: 'networkidle' });

  // Con la carta de ejemplo, el botón pide cambiarla primero.
  await p.click('#crear');
  ok(/carta de ejemplo/.test(await p.textContent('#estado')) && !(await p.evaluate(() => document.querySelector('#dlg').open)), `${nombre}: con la carta de ejemplo pide cambiarla`);

  // Cambia el nombre, elige fondo verde oscuro y una foto de fondo.
  const local = 'Fuente de Soda La Esquina ' + nombre;
  await p.fill('#l-nombre', local);
  await p.click('#fondos .color[data-v="#1f3b2c"]');
  await p.waitForTimeout(300);
  const colorTexto = await p.evaluate((n) => [...document.querySelectorAll('#hojas svg text')].find((t) => t.textContent === n)?.getAttribute('fill'), local);
  ok(colorTexto === '#f4f1ea', `${nombre}: con fondo oscuro el texto se pone claro (${colorTexto})`);
  await p.setInputFiles('#d-fondo', FOTO);
  await p.waitForFunction(() => !document.querySelector('#fondo-mini').hidden);
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => Boolean(document.querySelector('#hojas svg image') && document.querySelector('#hojas svg rect[fill-opacity]'))), `${nombre}: la foto de fondo aparece con su velo`);
  ok(await p.evaluate(() => { try { return window.CartaMotor.aPDF(JSON.parse(localStorage.getItem('stpyme-menu-v1'))).output('arraybuffer').byteLength > 10000; } catch { return false; } }), `${nombre}: el PDF se arma con la foto de fondo`);
  if (CAPTURAS) await p.screenshot({ path: `${CAPTURAS}/editor-${nombre}.png`, fullPage: nombre === 'computador' });

  // Un botón: pide nombre y WhatsApp, sugiere el link y muestra el QR al tiro.
  await p.click('#crear');
  ok(await p.evaluate(() => document.querySelector('#dlg').open), `${nombre}: se abre la ventana para crear la carta`);
  await p.waitForFunction(() => /disponible/.test(document.querySelector('#p-disp').textContent));
  const link = await p.inputValue('#p-local');
  ok(link === 'fuente-de-soda-la-esquina-' + nombre, `${nombre}: sugiere el link ${link}`);
  await p.fill('#p-nombre', 'Prueba');
  await p.fill('#p-wsp', nombre === 'celular' ? '9 1111 1111' : '9 2222 2222');
  await p.click('#p-enviar');
  await p.waitForFunction(() => !document.querySelector('#dlg-listo').hidden, null, { timeout: 8000 });
  ok(await p.evaluate(() => Boolean(document.querySelector('#dlg-qr svg path'))) && (await p.textContent('#dlg-link')).includes('/carta/' + link), `${nombre}: muestra el QR y el link al tiro`);
  if (CAPTURAS) await p.screenshot({ path: `${CAPTURAS}/listo-${nombre}.png` });
  const descarga = p.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  const popup = p.waitForEvent('popup', { timeout: 5000 }).catch(() => null);
  await p.click('#q-imprimir');
  const [d, v] = await Promise.all([descarga, popup]);
  ok(Boolean(d || v), `${nombre}: "Imprimir QR" ${d ? 'descarga el PDF' : 'abre el PDF para imprimir'}`);
  await p.click('#dlg-cerrar');

  // Cambiar un precio: el botón pasa a "Actualizar" y vuelve a mostrar el QR.
  await p.fill('.p-pre >> nth=0', '9990');
  await p.waitForTimeout(300);
  ok(/Actualizar/.test(await p.textContent('#crear')), `${nombre}: con cambios, el botón ofrece actualizar`);
  await p.click('#crear');
  await p.waitForFunction(() => document.querySelector('#dlg').open && !document.querySelector('#dlg-listo').hidden, null, { timeout: 8000 });
  ok(/Ver el QR/.test(await p.textContent('#crear')), `${nombre}: actualiza y vuelve a mostrar el QR`);
  ok(!errores.length, `${nombre}: sin errores en la herramienta ${errores.join(' | ')}`);

  // La carta publicada: una imagen con el diseño, sin menú de secciones.
  const pub = await ctx.newPage();
  const errPub = [];
  pub.on('pageerror', (e) => errPub.push(e.message));
  await pub.goto('https://stpyme.cl/carta/' + link, { waitUntil: 'networkidle' });
  const info = await pub.evaluate(() => ({ hojas: document.querySelectorAll('svg.hoja').length, foto: Boolean(document.querySelector('svg.hoja image')), nav: Boolean(document.querySelector('nav')), texto: document.body.innerText, precio: [...document.querySelectorAll('svg.hoja text')].some((t) => t.textContent === '$9.990') }));
  ok(info.hojas >= 1 && info.foto && !info.nav && !/\bnull\b/.test(info.texto), `${nombre}: la carta publicada es una imagen con su fondo, sin menú de secciones`);
  ok(info.precio, `${nombre}: la carta publicada tiene el precio actualizado`);
  ok(/WhatsApp|Descargar PDF/.test(info.texto) && !errPub.length, `${nombre}: abajo quedan los botones, sin errores ${errPub.join(' | ')}`);
  if (CAPTURAS) await pub.screenshot({ path: `${CAPTURAS}/publicada-${nombre}.png`, fullPage: nombre === 'celular' });
  await ctx.close();
}
await b.close();
