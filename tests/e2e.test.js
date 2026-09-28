/*
 * Prueba de punta a punta: levanta el servidor con una base de datos temporal,
 * abre DOS cajas en el navegador y verifica que comparten inventario.
 *
 *   node tests/e2e.test.js
 */
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(require('node:child_process').execSync('npm root -g').toString().trim(), 'playwright'))); }

const PORT = 8190 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-test-'));
const XLSX = require('../puntoventa/vendor/xlsx.full.min.js');

function startServer() {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'puntoventa', 'server', 'server.js')], { env: { ...process.env, PORT, PV_DATA_DIR: DATA }, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve, reject) => {
    let out = '';
    srv.stdout.on('data', d => { out += d; if (out.includes('SERVIDOR ENCENDIDO')) resolve(srv); });
    srv.stderr.on('data', d => process.stderr.write(d));
    srv.on('exit', c => reject(new Error('El servidor terminó: ' + c + out)));
  });
}

async function login(page, caja, usuario = 'admin', password = '') {
  await page.goto(BASE);
  await page.fill('#login-form input[name=usuario]', usuario);
  await page.fill('#login-form input[name=password]', password);
  if (await page.isVisible('#caja-row')) await page.fill('#login-form input[name=caja]', caja);
  await page.click('#login-form button[type=submit]');
  // ventana de fondo de caja
  await page.waitForSelector('.modal');
  await page.fill('.modal input[name=fondo]', '500');
  await page.click('.modal [data-ok]');
  await page.waitForSelector('[data-code]');
}

(async () => {
  const srv = await startServer();
  const browser = await chromium.launch();
  const errors = [];
  try {
    const ctx1 = await browser.newContext({ acceptDownloads: true });
    const ctx2 = await browser.newContext();
    const c1 = await ctx1.newPage();
    const c2 = await ctx2.newPage();
    for (const p of [c1, c2]) {
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => { if (m.type() === 'error' && !/401/.test(m.text())) errors.push(m.text()); });
      await p.addInitScript(() => { window.print = () => { window.__printed = (window.__printed || 0) + 1; }; });
    }

    /* ---- Caja 1: login e importación de productos desde Excel ---- */
    await login(c1, 'Caja 1');
    const xlsxPath = path.join(DATA, 'productos.xlsx');
    const ws = XLSX.utils.aoa_to_sheet([
      ['Código', 'Descripción', 'Precio Costo', 'Precio Venta', 'Precio Mayoreo', 'Departamento', 'Existencia', 'Inv. Mínimo', 'Tipo de Venta'],
      ['7501', 'REFRESCO COLA 600', 12, 18, 16, 'BEBIDAS', 20, 5, 'U'],
      ['7502', 'GALLETAS MARIAS', '9.50', '$14.00', '', 'GALLETAS', 3, 5, 'Unidad'],
      ['FRIJOL', 'FRIJOL A GRANEL', 24, 34, '', 'GRANOS', 10.5, 2, 'Granel'],
    ]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Productos'); fs.writeFileSync(xlsxPath, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    await c1.keyboard.press('F3');
    await c1.click('[data-a=importar]');
    await c1.setInputFiles('[data-file]', xlsxPath);
    await c1.waitForSelector('[data-prev] tr');
    assert.match(await c1.textContent('[data-resumen]'), /3.*producto/);
    await c1.click('.modal [data-ok]');
    await c1.waitForSelector('.modal >> text=Productos nuevos: 3');
    await c1.click('.modal [data-ok]');
    assert.equal(await c1.locator('[data-list] tr').count(), 3);

    /* ---- Caja 2 se conecta y ve el mismo catálogo ---- */
    await login(c2, 'Caja 2');
    assert.equal(await c2.evaluate(() => Store.productos.length), 3);

    /* ---- Caja 1 vende 3 refrescos con 3*7501 y cobra con F12 ---- */
    await c1.keyboard.press('F1');
    await c1.fill('[data-code]', '3*7501');
    await c1.press('[data-code]', 'Enter');
    await c1.fill('[data-code]', '7502');
    await c1.press('[data-code]', 'Enter');
    await c1.keyboard.press('+'); // +1 a la línea seleccionada (galletas)
    assert.equal(await c1.textContent('[data-total]'), '$82.00');
    await c1.keyboard.press('F12');
    await c1.fill('.modal [data-pago]', '100');
    assert.match(await c1.textContent('.modal [data-cambio]'), /18\.00/);
    await c1.keyboard.press('F1');
    await c1.waitForSelector('.modal', { state: 'detached' });
    assert.match(await c1.textContent('[data-last]'), /Cambio: \$18\.00/);
    await c1.waitForFunction(() => window.__printed === 1);

    /* ---- La existencia se actualiza al momento en la Caja 2 ---- */
    await c2.waitForFunction(() => Store.findProducto('7501').existencia === 17, null, { timeout: 5000 });

    /* ---- Caja 2: granel, mayoreo F11 y pago mixto ---- */
    await c2.fill('[data-code]', 'FRIJOL');
    await c2.press('[data-code]', 'Enter');
    await c2.fill('.modal [data-i]', '17');
    await c2.keyboard.press('Enter');
    assert.equal(await c2.evaluate(() => Ventas.T.items[0].cantidad), 0.5);
    await c2.fill('[data-code]', '2*7501');
    await c2.press('[data-code]', 'Enter');
    await c2.keyboard.press('F11');
    assert.equal(await c2.textContent('[data-total]'), '$49.00');
    await c2.keyboard.press('F12');
    await c2.keyboard.press('F7');
    await c2.fill('.modal [data-mt]', '20');
    await c2.fill('.modal [data-me]', '50');
    assert.match(await c2.textContent('.modal [data-cambio]'), /21\.00/);
    await c2.keyboard.press('F2');
    await c2.waitForSelector('.modal', { state: 'detached' });
    await c1.waitForFunction(() => Store.findProducto('7501').existencia === 15 && Store.findProducto('FRIJOL').existencia === 10, null, { timeout: 5000 });

    /* ---- Tickets pendientes (F6) y artículo común (Ctrl+P) ---- */
    await c1.fill('[data-code]', '7501');
    await c1.press('[data-code]', 'Enter');
    await c1.keyboard.press('F6');
    assert.equal(await c1.locator('[data-tabs] button').count(), 2);
    await c1.keyboard.press('Control+p');
    await c1.fill('.modal input[name=precio]', '5');
    await c1.click('.modal [data-ok]');
    assert.equal(await c1.textContent('[data-total]'), '$5.00');
    await c1.keyboard.press('F5');
    assert.equal(await c1.textContent('[data-total]'), '$18.00');

    /* ---- Cliente con crédito: venta a crédito y abono ---- */
    await c1.keyboard.press('F2');
    await c1.click('[data-a=nuevo]');
    await c1.fill('.modal input[name=nombre]', 'Juan Pérez');
    await c1.check('.modal input[name=credito]');
    await c1.fill('.modal input[name=limite]', '1000');
    await c1.click('.modal [data-ok]');
    await c1.waitForFunction(() => Store.clientes.length === 1);
    await c1.keyboard.press('F1');
    await c1.keyboard.press('F12');
    await c1.keyboard.press('F8');
    await c1.waitForSelector('.modal >> text=Seleccionar cliente');
    await c1.keyboard.press('Enter');
    await c1.waitForSelector('.modal >> text=Saldo después');
    await c1.keyboard.press('F2');
    await c1.waitForFunction(() => !document.querySelector('.modal'));
    assert.equal(await c1.evaluate(() => Store.clientes[0].saldo), 18);
    await c2.waitForFunction(() => Store.clientes[0] && Store.clientes[0].saldo === 18, null, { timeout: 5000 });
    const abono = await c1.evaluate(() => Store.abonar(Store.clientes[0].id, 10, 'efectivo', null, 'prueba'));
    assert.equal(abono.cliente.saldo, 8);

    /* ---- Inventario: agregar y ajustar ---- */
    await c1.evaluate(() => Store.movimientoInventario(Store.findProducto('7502').id, 10, 'entrada', 'Proveedor', { costo: 10 }));
    assert.equal(await c1.evaluate(() => Store.findProducto('7502').existencia), 11);
    const kardex = await c1.evaluate(async () => (await DB.byIndex('movinv', 'productoId', Store.findProducto('7502').id)).map(m => m.tipo));
    assert.deepEqual(kardex.sort(), ['entrada', 'importacion', 'precio', 'venta'].sort());

    /* ---- Devolución parcial ---- */
    const dev = await c1.evaluate(() => Store.devolver(1, [{ idx: 0, cantidad: 1 }], 'no le gustó'));
    assert.equal(dev.dev.efectivo, 18);
    await c2.waitForFunction(() => Store.findProducto('7501').existencia === 15, null, { timeout: 5000 });

    /* ---- Corte de la Caja 1 ---- */
    const r = await c1.evaluate(() => Store.resumenTurno(Store.turno));
    // fondo 500 + venta 82 + abono 10 - devolución 18
    assert.equal(r.efectivoEsperado, 574);
    assert.equal(r.ventasCredito, 18);
    await c1.click('#mainnav [data-screen=corte]');
    await c1.click('[data-corte]');
    await c1.fill('.modal input[name=contado]', '570');
    await c1.click('.modal [data-ok]');
    await c1.waitForSelector('.modal >> text=Diferencia: -$4.00');
    await c1.click('.modal [data-ok]');
    await c1.waitForSelector('.modal >> text=Nuevo turno');
    await c1.click('.modal [data-no]');
    assert.equal(await c1.evaluate(() => Store.turno), null);
    // la Caja 2 sigue con su turno abierto
    assert.ok(await c2.evaluate(() => Store.turno && Store.turno.caja === 'Caja 2'));

    /* ---- Permisos: un cajero sin permiso no puede hacer salidas ---- */
    await c1.evaluate(() => Store.guardarUsuario({ nombre: 'Ana', usuario: 'ana', permisos: { vender: true }, activo: true }, '1234'));
    const c3 = await (await browser.newContext()).newPage();
    await c3.goto(BASE);
    await c3.fill('#login-form input[name=usuario]', 'ana');
    await c3.fill('#login-form input[name=password]', '1234');
    await c3.fill('#login-form input[name=caja]', 'Caja 3');
    await c3.click('#login-form button[type=submit]');
    await c3.waitForSelector('.modal'); await c3.click('.modal [data-no]');
    assert.equal(await c3.isVisible('#mainnav [data-screen=productos]'), false);
    const denied = await c3.evaluate(() => Store.movimientoCaja('salida', 50, 'robo').then(() => 'ok', e => e.message));
    assert.match(denied, /permiso/);

    /* ---- Exportar productos ---- */
    await c1.keyboard.press('F3');
    const [download] = await Promise.all([c1.waitForEvent('download'), c1.click('[data-a=exportar]')]);
    const out = XLSX.read(fs.readFileSync(await download.path()));
    const rows = XLSX.utils.sheet_to_json(out.Sheets[out.SheetNames[0]]);
    assert.equal(rows.length, 3);
    assert.equal(rows.find(x => x['Código'] === '7501').Existencia, 15);

    /* ---- Recorrer todas las pantallas sin errores ---- */
    for (const s of ['ventas', 'clientes', 'productos', 'inventario', 'configuracion', 'corte', 'reportes']) {
      await c1.click(`#mainnav [data-screen=${s}]`);
      await c1.waitForTimeout(150);
    }
    for (const t of ['bajos', 'reporte', 'movimientos', 'kardex']) { await c1.click('#mainnav [data-screen=inventario]'); await c1.click(`[data-tab=${t}]`); await c1.waitForTimeout(100); }
    for (const t of ['ticket', 'cajeros', 'general', 'red', 'respaldos']) { await c1.click('#mainnav [data-screen=configuracion]'); await c1.click(`[data-tab=${t}]`); await c1.waitForTimeout(150); }
    for (const g of ['cajero', 'caja', 'departamento', 'forma', 'hora', 'productos', 'tickets']) { await c1.click('#mainnav [data-screen=reportes]'); await c1.selectOption('[data-g]', g); await c1.waitForTimeout(150); }
    await c1.screenshot({ path: path.join(DATA, 'reportes.png'), fullPage: true });

    assert.deepEqual(errors, []);
    console.log('OK - todas las pruebas pasaron');
  } finally {
    await browser.close();
    srv.kill();
  }
})().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
