// Tienda de STPyme (mini cursos en ebook y asesorías), en /api/publico/tienda?op=…
//
// Público (sin sesión):
//   op=config    GET   IDs públicos de los píxeles (Meta, Google, Clarity) que puso el equipo en Vercel.
//   op=evento    POST  pasos del embudo de una visita (vista, comprar), uno por página. Sin datos personales.
//   op=orden     POST  crea la orden y la preferencia de Mercado Pago (Checkout Pro); responde la URL de pago.
//   op=webhook   POST  aviso de Mercado Pago: se consulta el pago a su API y, si está aprobado, la orden queda pagada.
//   op=estado    GET   la página /gracias consulta su orden (con su clave); si vuelve con payment_id lo verifica al tiro.
//   op=descarga  GET   el PDF del producto, solo para órdenes pagadas y con la clave de la orden.
// Panel (con sesión del panel):
//   op=panel     GET   métricas de la tienda (ventas, embudo, canales, productos, pagos abandonados).
//   op=archivo   PUT   sube el PDF de un producto al almacenamiento privado (?producto=<id>).
//
// Variables en Vercel: MP_ACCESS_TOKEN (obligatoria para cobrar), MP_WEBHOOK_SECRET (opcional, firma de avisos),
// META_PIXEL_ID y META_CAPI_TOKEN (píxel y API de Conversiones), GOOGLE_TAG_ID (G-…), GOOGLE_ADS_ID (AW-…),
// GOOGLE_ADS_COMPRA (etiqueta de la conversión), CLARITY_ID, TIENDA_REMITENTE (correo verificado en Resend para
// mandarle el ebook al comprador; si no está, el comprador lo descarga en /gracias y el equipo recibe el aviso).
import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { get, put } from '@vercel/blob';
import { leerDoc, guardarDoc, sesion, json, enviarCorreo, escapar } from '../panel.js';

const SITIO = 'https://stpyme.cl';
const ZONA = 'America/Santiago';

// Catálogo. El precio lo decide el servidor, nunca la página.
export const PRODUCTOS = {
  'ebook-web-ia': {
    nombre: 'Ebook: Tu web profesional con IA',
    corto: 'Tu web con IA',
    pagina: '/ebook',
    archivo: 'tienda/archivos/ebook-web-ia.pdf',
    descarga: 'Tu-web-profesional-con-IA-STPyme.pdf',
    // Precio de lanzamiento hasta el 30 de noviembre de 2026 (hora de Chile); después, precio normal.
    precio: (ahora = new Date()) => (ahora < new Date('2026-12-01T00:00:00-03:00') ? 5000 : 7990),
  },
};

const PASOS = ['vista', 'comprar', 'pago', 'compra'];
const CANALES = ['meta', 'google', 'tiktok', 'instagram', 'youtube', 'whatsapp', 'correo', 'otro', 'directo'];
const texto = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const dia = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: ZONA });
const mesDe = (fecha) => fecha.slice(0, 7);
const sha = (v) => createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');
const iguales = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

// ---------- almacenamiento ----------
const ORDENES = 'tienda/ordenes.json';
const rutaMes = (mes) => `tienda/meses/${mes}.json`;
const enMemoria = () => process.env.PANEL_STORE === 'memory';
const conClave = (o = {}) => (process.env.BLOB_READ_WRITE_TOKEN ? { ...o, token: process.env.BLOB_READ_WRITE_TOKEN } : o);
const archivosMemoria = (globalThis.__tiendaArchivos ??= {});

// Lee, cambia y guarda un documento, reintentando si otra visita lo escribió al mismo tiempo.
async function actualizar(ruta, vacio, cambiar) {
  for (let intento = 0; intento < 8; intento++) {
    const { data, etag } = await leerDoc(ruta);
    const d = data || vacio();
    const r = cambiar(d);
    if (r === false) return d;
    const g = await guardarDoc(ruta, d, etag);
    if (g.ok) return d;
    await new Promise((ok) => setTimeout(ok, 40 + Math.random() * 160));
  }
  throw new Error('No se pudo guardar (muchas escrituras al mismo tiempo)');
}

// Suma pasos del embudo al mes: c[día]["producto|paso|canal|dispositivo"] = n
function sumarPasos(fecha, filas) {
  return actualizar(rutaMes(mesDe(fecha)), () => ({ c: {} }), (d) => {
    d.c[fecha] ??= {};
    for (const { producto, paso, canal, disp } of filas) {
      const k = `${producto}|${paso}|${canal}|${disp}`;
      d.c[fecha][k] = (d.c[fecha][k] || 0) + 1;
    }
  });
}

// ---------- utilidades ----------
const claveOrden = (id) => createHmac('sha256', process.env.PANEL_SECRET || 'sin-secreto').update('orden:' + id).digest('base64url').slice(0, 24);
const canalValido = (c) => (CANALES.includes(c) ? c : 'directo');
const dispValido = (d) => (d === 'movil' || d === 'escritorio' ? d : 'escritorio');
function mismoSitio(request) {
  const origen = request.headers.get('origin');
  return Boolean(origen) && origen === new URL(request.url).origin;
}
async function cuerpo(request, max = 4000) {
  const crudo = await request.text();
  if (crudo.length > max) return null;
  try { return JSON.parse(crudo); } catch { return null; }
}
const ip = (request) => (request.headers.get('x-forwarded-for') || '').split(',')[0].trim();

async function mp(ruta, opciones = {}) {
  const r = await fetch('https://api.mercadopago.com' + ruta, {
    ...opciones,
    headers: { authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'content-type': 'application/json', ...(opciones.headers || {}) },
  });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Mercado Pago respondió ${r.status}: ${JSON.stringify(b).slice(0, 200)}`);
  return b;
}

// API de Conversiones de Meta: la compra llega desde el servidor (con el mismo event_id que el píxel, para no contarla dos veces).
async function compraAMeta(o) {
  const pixel = process.env.META_PIXEL_ID, token = process.env.META_CAPI_TOKEN;
  if (!pixel || !token || !o.consentimiento) return;
  const user_data = { em: [sha(o.email)], client_ip_address: o.ip || undefined, client_user_agent: o.agente || undefined, fbp: o.fbp || undefined, fbc: o.fbc || undefined };
  if (o.telefono) user_data.ph = [sha(o.telefono)];
  if (o.nombre) user_data.fn = [sha(o.nombre.split(' ')[0])];
  const evento = {
    event_name: 'Purchase', event_time: Math.floor(new Date(o.pagado || Date.now()).getTime() / 1000), event_id: o.id,
    action_source: 'website', event_source_url: SITIO + '/gracias', user_data,
    custom_data: { currency: 'CLP', value: o.monto, content_ids: [o.producto], content_type: 'product' },
  };
  await fetch(`https://graph.facebook.com/v21.0/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: [evento] }),
  }).catch(() => {});
}

function linkDescarga(o) { return `${SITIO}/api/publico/tienda?op=descarga&orden=${o.id}&t=${claveOrden(o.id)}`; }

async function correoAlComprador(o) {
  const de = process.env.TIENDA_REMITENTE, key = process.env.RESEND_API_KEY;
  const p = PRODUCTOS[o.producto];
  if (!de || !key || !p) return false;
  const link = linkDescarga(o);
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: de, to: [o.email], subject: `Tu compra: ${p.nombre}`,
      html: `<p>Hola ${escapar(o.nombre)}, gracias por tu compra.</p><p><a href="${link}"><b>Descarga aquí tu ${escapar(p.corto)}</b></a></p><p>Guarda este correo: el link sirve cuando lo necesites. Si tienes una duda, responde este correo.</p><p>STPyme · stpyme.cl</p>`,
      text: `Hola ${o.nombre}, gracias por tu compra.\nDescarga tu ${p.corto}: ${link}\nSTPyme · stpyme.cl`,
    }),
  }).catch(() => null);
  return Boolean(r?.ok);
}

// Marca la orden como pagada una sola vez (si el pago de Mercado Pago está aprobado y calza con la orden).
async function confirmarPago(pagoId) {
  if (!process.env.MP_ACCESS_TOKEN || !/^\d{3,20}$/.test(String(pagoId))) return null;
  const pago = await mp(`/v1/payments/${pagoId}`);
  const id = String(pago.external_reference || '');
  let recienPagada = null;
  const d = await actualizar(ORDENES, () => ({ ordenes: [] }), (doc) => {
    const o = doc.ordenes.find((x) => x.id === id);
    if (!o) return false;
    o.mpEstado = pago.status;
    if (pago.status !== 'approved') { if (o.estado === 'pendiente' && ['rejected', 'cancelled'].includes(pago.status)) o.estado = 'rechazado'; else return false; return; }
    if (o.estado === 'pagado') return false;
    if (pago.currency_id !== 'CLP' || Number(pago.transaction_amount) < o.monto) { o.estado = 'revisar'; o.nota = `Monto pagado ${pago.transaction_amount} ${pago.currency_id}`; return; }
    o.estado = 'pagado'; o.pagado = new Date().toISOString(); o.pagoId = String(pago.id); o.medio = pago.payment_type_id || '';
    recienPagada = o;
  });
  const o = d.ordenes?.find((x) => x.id === id) || null;
  if (recienPagada) {
    await sumarPasos(dia(new Date(recienPagada.pagado)), [{ producto: recienPagada.producto, paso: 'compra', canal: recienPagada.canal, disp: recienPagada.disp }]).catch(() => {});
    const p = PRODUCTOS[recienPagada.producto];
    const enviado = await correoAlComprador(recienPagada);
    await enviarCorreo({
      asunto: `Venta: ${p?.corto || recienPagada.producto} · $${recienPagada.monto.toLocaleString('es-CL')}`,
      html: `<p>Nueva venta en la tienda de STPyme.</p><ul><li><b>Producto:</b> ${escapar(p?.nombre)}</li><li><b>Comprador:</b> ${escapar(recienPagada.nombre)} (${escapar(recienPagada.email)})</li><li><b>Monto:</b> $${recienPagada.monto.toLocaleString('es-CL')}</li><li><b>Canal:</b> ${escapar(recienPagada.canal)}</li></ul><p>${enviado ? 'El ebook se le mandó por correo.' : `El comprador lo descarga en la página de gracias. Si te escribe, este es su link: ${linkDescarga(recienPagada)}`}</p>`,
      texto: `Venta: ${p?.nombre} · $${recienPagada.monto} · ${recienPagada.nombre} <${recienPagada.email}> · canal ${recienPagada.canal}\nDescarga: ${linkDescarga(recienPagada)}`,
    }).catch(() => {});
    await compraAMeta(recienPagada);
  }
  return o;
}

function firmaWebhookValida(request, dataId) {
  const secreto = process.env.MP_WEBHOOK_SECRET;
  if (!secreto) return true; // sin secreto igual es seguro: el pago siempre se consulta a la API de Mercado Pago
  const firma = request.headers.get('x-signature') || '';
  const partes = Object.fromEntries(firma.split(',').map((p) => p.trim().split('=')));
  if (!partes.ts || !partes.v1) return false;
  const manifiesto = `id:${String(dataId).toLowerCase()};request-id:${request.headers.get('x-request-id') || ''};ts:${partes.ts};`;
  return iguales(createHmac('sha256', secreto).update(manifiesto).digest('hex'), partes.v1);
}

// ---------- métricas para el panel ----------
async function metricas(desde, hasta) {
  const meses = [];
  for (let m = mesDe(desde); m <= mesDe(hasta);) {
    meses.push(m);
    const [a, mm] = m.split('-').map(Number);
    m = mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, '0')}`;
  }
  const docs = await Promise.all(meses.map((m) => leerDoc(rutaMes(m)).then((r) => r.data?.c || {})));
  const pasos = {}; // día -> producto -> paso -> canal -> disp -> n
  const filas = [];
  for (const c of docs) for (const [f, claves] of Object.entries(c)) {
    if (f < desde || f > hasta) continue;
    for (const [k, n] of Object.entries(claves)) { const [producto, paso, canal, disp] = k.split('|'); filas.push({ dia: f, producto, paso, canal, disp, n }); }
  }
  const { data } = await leerDoc(ORDENES);
  const ordenes = (data?.ordenes || []).filter((o) => o.creado.slice(0, 10) >= desde && o.creado.slice(0, 10) <= hasta);
  const ahora = Date.now();
  const abandonadas = ordenes.filter((o) => o.estado !== 'pagado' && ahora - new Date(o.creado).getTime() > 30 * 60 * 1000 && !(data?.ordenes || []).some((x) => x.email === o.email && x.estado === 'pagado'));
  const privada = ({ ip: _i, agente: _a, fbp: _p, fbc: _c, ...resto }) => resto;
  return {
    desde, hasta, pasos: filas, productos: Object.fromEntries(Object.entries(PRODUCTOS).map(([id, p]) => [id, { nombre: p.nombre, precio: p.precio() }])),
    ordenes: ordenes.map(privada).sort((a, b) => b.creado.localeCompare(a.creado)),
    abandonadas: abandonadas.map(privada).map((o) => ({ ...o, linkPago: `${SITIO}${PRODUCTOS[o.producto]?.pagina || '/'}#comprar` })),
    config: {
      pagos: Boolean(process.env.MP_ACCESS_TOKEN), meta: Boolean(process.env.META_PIXEL_ID), capi: Boolean(process.env.META_CAPI_TOKEN),
      google: Boolean(process.env.GOOGLE_TAG_ID || process.env.GOOGLE_ADS_ID), clarity: process.env.CLARITY_ID || '', correoComprador: Boolean(process.env.TIENDA_REMITENTE),
    },
  };
}

async function existeArchivo(ruta) {
  if (enMemoria()) return Boolean(archivosMemoria[ruta]);
  try { const r = await get(ruta, conClave({ access: 'private', useCache: false })); return Boolean(r && r.statusCode === 200); } catch { return false; }
}

// ---------- rutas ----------
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const op = url.searchParams.get('op');

    if (op === 'config' && request.method === 'GET') {
      return json({
        meta: process.env.META_PIXEL_ID || '', googleTag: process.env.GOOGLE_TAG_ID || '', googleAds: process.env.GOOGLE_ADS_ID || '',
        googleCompra: process.env.GOOGLE_ADS_COMPRA || '', clarity: process.env.CLARITY_ID || '', pagos: Boolean(process.env.MP_ACCESS_TOKEN),
        productos: Object.fromEntries(Object.entries(PRODUCTOS).map(([id, p]) => [id, { nombre: p.nombre, precio: p.precio() }])),
      }, 200, { 'cache-control': 'public, max-age=300' });
    }

    if (op === 'evento' && request.method === 'POST') {
      if (!mismoSitio(request)) return json({ error: 'No autorizado' }, 403);
      const b = await cuerpo(request, 1500);
      const p = b && PRODUCTOS[b.producto] ? b.producto : null;
      const pasos = Array.isArray(b?.pasos) ? [...new Set(b.pasos)].filter((x) => x === 'vista' || x === 'comprar') : [];
      if (!p || !pasos.length) return json({ ok: true });
      await sumarPasos(dia(), pasos.map((paso) => ({ producto: p, paso, canal: canalValido(b.canal), disp: dispValido(b.disp) })));
      return json({ ok: true });
    }

    if (op === 'orden' && request.method === 'POST') {
      if (!mismoSitio(request)) return json({ error: 'No autorizado' }, 403);
      const b = await cuerpo(request, 3000);
      if (!b) return json({ error: 'Datos inválidos' }, 400);
      if (texto(b.web, 100)) return json({ ok: true, url: SITIO });
      const p = PRODUCTOS[b.producto];
      const nombre = texto(b.nombre, 60), email = texto(b.email, 120).toLowerCase(), telefono = texto(b.telefono, 20).replace(/[^\d+]/g, '');
      if (!p) return json({ error: 'Producto no encontrado' }, 400);
      if (!nombre || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'Revisa tu nombre y tu correo.' }, 400);
      if (!process.env.MP_ACCESS_TOKEN) return json({ error: 'pagos-no-configurados' }, 503);
      const id = 'o' + randomBytes(6).toString('hex');
      const t = claveOrden(id);
      const monto = p.precio();
      const orden = {
        id, producto: b.producto, monto, nombre, email, telefono, estado: 'pendiente', creado: new Date().toISOString(),
        canal: canalValido(b.canal), disp: dispValido(b.disp), utm: texto(b.utm, 200), consentimiento: b.consentimiento === true,
        fbp: b.consentimiento ? texto(b.fbp, 120) : '', fbc: b.consentimiento ? texto(b.fbc, 200) : '',
        ip: b.consentimiento ? ip(request) : '', agente: b.consentimiento ? texto(request.headers.get('user-agent'), 300) : '',
      };
      const pref = await mp('/checkout/preferences', {
        method: 'POST',
        headers: { 'x-idempotency-key': id },
        body: JSON.stringify({
          items: [{ id: b.producto, title: p.nombre, quantity: 1, unit_price: monto, currency_id: 'CLP', category_id: 'learnings' }],
          payer: { name: nombre, email },
          external_reference: id,
          back_urls: { success: `${SITIO}/gracias?orden=${id}&t=${t}`, pending: `${SITIO}/gracias?orden=${id}&t=${t}`, failure: `${SITIO}${p.pagina}?pago=fallido#comprar` },
          auto_return: 'approved',
          notification_url: `${SITIO}/api/publico/tienda?op=webhook`,
          statement_descriptor: 'STPYME',
          metadata: { orden: id },
        }),
      });
      orden.preferencia = pref.id;
      await actualizar(ORDENES, () => ({ ordenes: [] }), (d) => { d.ordenes.push(orden); if (d.ordenes.length > 5000) d.ordenes.splice(0, d.ordenes.length - 5000); });
      await sumarPasos(dia(), [{ producto: b.producto, paso: 'pago', canal: orden.canal, disp: orden.disp }]).catch(() => {});
      return json({ ok: true, url: pref.init_point, orden: id });
    }

    if (op === 'webhook' && request.method === 'POST') {
      const b = await cuerpo(request, 20000) || {};
      const tipo = b.type || url.searchParams.get('type') || url.searchParams.get('topic');
      const pagoId = b.data?.id || url.searchParams.get('data.id') || (tipo === 'payment' ? url.searchParams.get('id') : null);
      if (tipo !== 'payment' || !pagoId) return json({ ok: true });
      if (!firmaWebhookValida(request, url.searchParams.get('data.id') || pagoId)) return json({ error: 'Firma inválida' }, 401);
      try { await confirmarPago(pagoId); } catch (e) { return json({ error: String(e.message).slice(0, 200) }, 500); }
      return json({ ok: true });
    }

    if (op === 'estado' && request.method === 'GET') {
      const id = url.searchParams.get('orden') || '', t = url.searchParams.get('t') || '';
      if (!/^o[0-9a-f]{12}$/.test(id) || !iguales(t, claveOrden(id))) return json({ error: 'Orden no encontrada' }, 404);
      let o = (await leerDoc(ORDENES)).data?.ordenes?.find((x) => x.id === id);
      if (!o) return json({ error: 'Orden no encontrada' }, 404);
      const pagoId = url.searchParams.get('payment_id') || url.searchParams.get('collection_id');
      if (o.estado !== 'pagado' && pagoId) { try { o = (await confirmarPago(pagoId)) || o; } catch { /* se reintenta al recargar */ } }
      const p = PRODUCTOS[o.producto];
      return json({
        estado: o.estado, producto: o.producto, nombre: p?.nombre, monto: o.monto, comprador: o.nombre.split(' ')[0],
        descarga: o.estado === 'pagado' ? linkDescarga(o) : null, consentimiento: o.consentimiento,
      });
    }

    if (op === 'descarga' && request.method === 'GET') {
      const id = url.searchParams.get('orden') || '', t = url.searchParams.get('t') || '';
      if (!/^o[0-9a-f]{12}$/.test(id) || !iguales(t, claveOrden(id))) return new Response('Link no válido', { status: 404 });
      const o = (await leerDoc(ORDENES)).data?.ordenes?.find((x) => x.id === id);
      if (!o || o.estado !== 'pagado') return new Response('Esta compra todavía no aparece pagada. Si ya pagaste, espera un minuto y vuelve a intentar.', { status: 402, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      const p = PRODUCTOS[o.producto];
      const cab = { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${p.descarga}"`, 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' };
      if (enMemoria()) return archivosMemoria[p.archivo] ? new Response(archivosMemoria[p.archivo], { headers: cab }) : new Response('Archivo no disponible', { status: 503 });
      const r = await get(p.archivo, conClave({ access: 'private', useCache: false })).catch(() => null);
      if (!r || r.statusCode !== 200) return new Response('El archivo no está disponible en este momento. Escríbenos y te lo mandamos.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      return new Response(r.stream, { headers: cab });
    }

    // ---- panel ----
    if (op === 'panel' || op === 'archivo') {
      const s = sesion(request);
      if (!s) return json({ error: 'Sesión expirada' }, 401);
      if (op === 'panel' && request.method === 'GET') {
        const hasta = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('hasta') || '') ? url.searchParams.get('hasta') : dia();
        const desde = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('desde') || '') ? url.searchParams.get('desde') : dia(new Date(Date.now() - 29 * 864e5));
        if (desde > hasta) return json({ error: 'Rango inválido' }, 400);
        const m = await metricas(desde, hasta);
        m.archivos = Object.fromEntries(await Promise.all(Object.entries(PRODUCTOS).map(async ([id, p]) => [id, await existeArchivo(p.archivo)])));
        return json(m);
      }
      if (op === 'archivo' && request.method === 'PUT') {
        const p = PRODUCTOS[url.searchParams.get('producto')];
        if (!p) return json({ error: 'Producto no encontrado' }, 400);
        if (!/pdf/i.test(request.headers.get('content-type') || '')) return json({ error: 'Sube un PDF' }, 400);
        const datos = Buffer.from(await request.arrayBuffer());
        if (datos.length < 1000 || datos.subarray(0, 4).toString() !== '%PDF') return json({ error: 'El archivo no parece un PDF' }, 400);
        if (enMemoria()) archivosMemoria[p.archivo] = datos;
        else await put(p.archivo, datos, conClave({ access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/pdf' }));
        return json({ ok: true, bytes: datos.length });
      }
    }

    return json({ error: 'No encontrado' }, 404);
  },
};
