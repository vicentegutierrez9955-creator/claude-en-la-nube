// Cartas de restaurante publicadas con QR (stpyme.cl/carta/<local>), creadas desde /herramientas/menu-restaurante.
// Se guardan en un Blob privado propio (stpyme-cartas, token CARTAS_READ_WRITE_TOKEN), separado del Blob del panel
// para que nada de lo que escribe el público toque el CRM. Cada carta es cartas/<local>.json y el índice de todas
// está en cartas/_indice.json (para topes y para el panel).
//
// Público (solo desde el mismo sitio):
//   GET  ?local=<local>                       → la carta (404 si no existe, 410 si está pausada)
//   POST {accion:'publicar', local, carta, nombre, whatsapp}  → crea la carta y devuelve su clave de edición
//   POST {accion:'actualizar', local, clave, carta}           → reemplaza la carta (solo con la clave)
//   POST {accion:'reportar', local, motivo}                   → avisa al equipo
// Cartas subidas (PDF o fotos, desde /herramientas/carta-qr): carta.tipo = 'archivo'. Las páginas llegan como
// imágenes, una por pedido: POST ?accion=pagina&local=&n=&total=&w=&h= con la clave en x-clave y la imagen
// en el cuerpo. Se muestran con GET ?local=&img=<n>.
// Panel (con sesión del panel):
//   POST {accion:'lista'} y {accion:'ocultar', local, oculta}
//
// Quien publica deja su WhatsApp: queda como prospecto en el panel (como el formulario de contacto).
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { get, head, put, BlobPreconditionFailedError, BlobNotFoundError } from '@vercel/blob';
import { leerDatos, guardarDatos, datosIniciales, enviarCorreo, escapar, json, sesion } from '../panel.js';
import { celular } from './contacto.js';

const SITIO = 'https://stpyme.cl';
const INDICE = 'cartas/_indice.json';
const TOPE_DIARIO = 40; // cartas nuevas por día en total
const TOPE_POR_WHATSAPP = 3;
const MAX_BYTES = 450 * 1024;
const MAX_PAGINAS = 10;
const MAX_IMAGEN = 4 * 1024 * 1024; // Vercel acepta hasta 4,5 MB por pedido
const IMAGENES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const RESERVADAS = new Set(['admin', 'api', 'panel', 'stpyme', 'carta', 'cartas', 'herramientas', 'nueva', 'nuevo', 'editar', 'ejemplo', 'test', 'prueba', 'www', 'indice', 'menu', 'qr', 'login', 'ayuda', 'soporte', 'contacto']);
const ESTILOS = ['clasico', 'moderno', 'pizarra', 'fresco'];

const texto = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });
const hash = (s) => createHash('sha256').update(String(s)).digest('hex');
const iguales = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
export const localValido = (s) => typeof s === 'string' && s.length >= 3 && s.length <= 40 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) && !RESERVADAS.has(s);
const rutaCarta = (local) => `cartas/${local}.json`;
const enlace = (local) => `${SITIO}/carta/${local}`;

// ---------- Almacenamiento (Blob propio, o memoria en pruebas con PANEL_STORE=memory) ----------
const memoria = (globalThis.__cartasMemoria ??= { docs: {}, n: 0 });
const enMemoria = () => process.env.PANEL_STORE === 'memory';
const token = () => process.env.CARTAS_READ_WRITE_TOKEN || process.env.CARTAS_BLOB_READ_WRITE_TOKEN || '';
const activo = () => enMemoria() || Boolean(token());

async function leer(ruta) {
  if (enMemoria()) {
    const m = memoria.docs[ruta];
    return m ? { data: JSON.parse(m.texto), etag: m.etag } : { data: null, etag: null };
  }
  const limpio = (e) => String(e || '').replace(/^W\//, '').replace(/"/g, '');
  try {
    let ultimo = { data: null, etag: null };
    for (let intento = 0; intento < 3; intento++) {
      const info = await head(ruta, { token: token() });
      const r = await get(ruta, { access: 'private', useCache: false, token: token() });
      if (!r || r.statusCode !== 200) return { data: null, etag: null };
      ultimo = { data: JSON.parse(await new Response(r.stream).text()), etag: info.etag };
      if (limpio(r.blob.etag) === limpio(info.etag)) break;
    }
    return ultimo;
  } catch (e) {
    if (e instanceof BlobNotFoundError) return { data: null, etag: null };
    throw e;
  }
}

// etag: null = crear solo si no existe; string = solo si nadie lo cambió desde esa versión.
async function guardar(ruta, data, etag) {
  const cuerpo = JSON.stringify(data);
  if (enMemoria()) {
    const actual = memoria.docs[ruta];
    if (etag ? actual?.etag !== etag : actual) return false;
    memoria.docs[ruta] = { texto: cuerpo, etag: `m${++memoria.n}` };
    return true;
  }
  try {
    await put(ruta, cuerpo, {
      access: 'private', addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60, token: token(),
      ...(etag ? { allowOverwrite: true, ifMatch: etag } : { allowOverwrite: false }),
    });
    return true;
  } catch (e) {
    if (e instanceof BlobPreconditionFailedError) return false;
    if (!etag && /exist/i.test(String(e?.message))) return false;
    throw e;
  }
}

// Lee, aplica `cambio` y guarda con reintentos si alguien escribió entremedio. `cambio` puede devolver una respuesta para cortar.
async function modificar(ruta, vacio, cambio) {
  for (let intento = 0; intento < 4; intento++) {
    const { data, etag } = await leer(ruta);
    const d = data || vacio();
    const corte = await cambio(d);
    if (corte) return corte;
    if (await guardar(ruta, d, etag)) return null;
  }
  throw new Error('Otra persona estaba guardando al mismo tiempo. Intenta de nuevo.');
}
const indiceVacio = () => ({ cartas: [] });

// Imágenes de las cartas subidas (el nombre lleva una parte al azar, así cada versión se puede guardar en caché).
async function guardarImagen(ruta, bytes, tipo) {
  if (enMemoria()) { memoria.docs[ruta] = { bytes, tipo }; return; }
  await put(ruta, bytes, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: tipo, token: token() });
}
async function leerImagen(ruta) {
  if (enMemoria()) { const m = memoria.docs[ruta]; return m ? { cuerpo: m.bytes, tipo: m.tipo } : null; }
  try {
    const r = await get(ruta, { access: 'private', token: token() });
    return r && r.statusCode === 200 ? { cuerpo: r.stream, tipo: r.blob.contentType } : null;
  } catch (e) {
    if (e instanceof BlobNotFoundError) return null;
    throw e;
  }
}
const esImagen = (b, tipo) => (tipo === 'image/jpeg' ? b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  : tipo === 'image/png' ? b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    : tipo === 'image/webp' ? String.fromCharCode(...b.slice(0, 4)) === 'RIFF' && String.fromCharCode(...b.slice(8, 12)) === 'WEBP' : false);

// ---------- La carta: solo los campos conocidos, cortos y limpios ----------
const limpiarLocal = (L = {}) => ({ nombre: texto(L.nombre, 50), frase: texto(L.frase, 70), tel: texto(L.tel, 30), ig: texto(L.ig, 40), dir: texto(L.dir, 80), horario: texto(L.horario, 60), logo: '', logoR: 1 });

// Carta subida en PDF o fotos: solo los datos del local; las páginas las agrega el servidor al recibir cada imagen.
export function limpiarCartaArchivo(c) {
  if (!c || typeof c !== 'object') return null;
  const local = limpiarLocal(c.local);
  if (!local.nombre) return null;
  return { tipo: 'archivo', local, diseno: { estilo: 'moderno', color: '', cols: 1, hoja: 'a4' }, paginas: [] };
}
const cartaDe = (c) => (c && c.tipo === 'archivo' ? limpiarCartaArchivo(c) : limpiarCarta(c));

export function limpiarCarta(c) {
  if (!c || typeof c !== 'object') return null;
  const L = c.local || {};
  const local = limpiarLocal(L);
  if (typeof L.logo === 'string' && L.logo.length <= 300000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(L.logo)) {
    local.logo = L.logo;
    const r = Number(L.logoR);
    local.logoR = r > 0.1 && r < 10 ? r : 1;
  }
  const D = c.diseno || {};
  const diseno = {
    estilo: ESTILOS.includes(D.estilo) ? D.estilo : 'clasico',
    color: /^#[0-9a-f]{6}$/i.test(String(D.color || '')) ? D.color : '',
    cols: Number(D.cols) === 2 ? 2 : 1,
    hoja: D.hoja === 'carta' ? 'carta' : 'a4',
  };
  let total = 0;
  const secciones = (Array.isArray(c.secciones) ? c.secciones : []).slice(0, 30).map((s) => ({
    titulo: texto(s?.titulo, 40),
    nota: texto(s?.nota, 90),
    items: (Array.isArray(s?.items) ? s.items : []).slice(0, 80)
      .map((it) => ({ nombre: texto(it?.nombre, 60), desc: texto(it?.desc, 120), precio: texto(it?.precio, 14) }))
      .filter((it) => (it.nombre || it.precio) && ++total <= 400),
  })).filter((s) => s.titulo || s.items.length);
  if (!local.nombre || !secciones.some((s) => s.items.length)) return null;
  return { local, diseno, secciones };
}

// El dueño de la carta queda como prospecto en el panel (o se anota en el que ya existe).
async function anotarProspecto({ nombre, whatsapp, negocio, local, comuna }) {
  const fecha = hoy();
  const nota = `Publicó su carta con QR (${fecha}): ${enlace(local)}. Llegó por la herramienta Carta para restaurantes; candidato a web con pedidos por WhatsApp.`;
  const id = 'web-' + whatsapp;
  for (let intento = 0; intento < 3; intento++) {
    const { data, etag } = await leerDatos();
    const d = data || datosIniciales();
    d.prospectos = Array.isArray(d.prospectos) ? d.prospectos : [];
    const actual = d.prospectos.find((x) => x.id === id || (x.whatsapp && celular(x.whatsapp) === whatsapp));
    if (actual) {
      if (String(actual.notas || '').includes(enlace(local))) return false;
      actual.notas = texto([actual.notas, nota].filter(Boolean).join('\n'), 3000);
      if (!actual.contacto && nombre) actual.contacto = nombre;
      actual.creado = Array.isArray(actual.creado) ? actual.creado : [];
      actual.creado.push({ nombre: 'Carta con QR', url: enlace(local) });
    } else {
      d.prospectos.push({
        id, negocio, contacto: nombre, whatsapp, rubro: 'Otro', comuna, origen: 'web', unidad: 'web_agenda',
        estado: 'por contactar', desde: fecha, contactarEl: fecha, notas: nota, creado: [{ nombre: 'Carta con QR', url: enlace(local) }],
      });
    }
    d.actualizado = new Date().toISOString();
    d.actualizadoPor = 'Carta con QR';
    if ((await guardarDatos(d, etag)).ok) return !actual;
  }
  return false;
}

const mismoSitio = (request) => {
  const origen = request.headers.get('origin');
  return Boolean(origen) && origen === new URL(request.url).origin;
};
const noActivo = () => json({ error: 'Las cartas con QR todavía no están activas. Vuelve a intentarlo más tarde.' }, 503);

async function ver(request) {
  const local = new URL(request.url).searchParams.get('local') || '';
  if (!localValido(local)) return json({ error: 'No existe' }, 404);
  if (!activo()) return noActivo();
  const { data } = await leer(rutaCarta(local));
  if (!data) return json({ error: 'No existe' }, 404, { 'cache-control': 'public, max-age=0, s-maxage=10' });
  if (data.oculta) return json({ error: 'Esta carta está pausada.' }, 410, { 'cache-control': 'public, max-age=0, s-maxage=30' });
  const carta = data.carta.tipo === 'archivo'
    ? { ...data.carta, paginas: (data.carta.paginas || []).map((p, i) => (p ? { url: `/api/publico/carta?local=${local}&img=${i}&v=${p.archivo.split('-').pop().split('.')[0]}`, w: p.w, h: p.h } : null)).filter(Boolean) }
    : data.carta;
  return json({ local, carta, actualizada: data.actualizada }, 200, { 'cache-control': 'public, max-age=0, s-maxage=30, stale-while-revalidate=300' });
}

async function verImagen(request) {
  const u = new URL(request.url).searchParams;
  const local = u.get('local') || '';
  const n = Number(u.get('img'));
  if (!localValido(local) || !Number.isInteger(n) || n < 0 || n >= MAX_PAGINAS || !activo()) return new Response('No existe', { status: 404 });
  const { data } = await leer(rutaCarta(local));
  const p = data && !data.oculta && data.carta.tipo === 'archivo' ? (data.carta.paginas || [])[n] : null;
  const img = p ? await leerImagen(p.archivo) : null;
  if (!img) return new Response('No existe', { status: 404, headers: { 'cache-control': 'public, max-age=0, s-maxage=30' } });
  // El link lleva la versión (?v=), así que cada imagen se puede guardar mucho tiempo.
  return new Response(img.cuerpo, { headers: { 'content-type': img.tipo || 'image/jpeg', 'cache-control': 'public, max-age=86400, s-maxage=2592000', 'x-content-type-options': 'nosniff' } });
}

async function subirPagina(request) {
  const u = new URL(request.url).searchParams;
  const local = u.get('local') || '';
  const n = Number(u.get('n'));
  const total = Number(u.get('total'));
  const tipo = String(request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const clave = request.headers.get('x-clave') || '';
  if (!localValido(local) || !clave) return json({ error: 'No autorizado' }, 403);
  if (!Number.isInteger(total) || total < 1 || total > MAX_PAGINAS || !Number.isInteger(n) || n < 0 || n >= total) return json({ error: `Puedes subir hasta ${MAX_PAGINAS} páginas.` }, 400);
  if (!IMAGENES[tipo]) return json({ error: 'Cada página debe ser una imagen JPG, PNG o WebP.' }, 400);
  const largo = Number(request.headers.get('content-length') || 0);
  if (largo > MAX_IMAGEN) return json({ error: 'Esa página pesa demasiado (máximo 4 MB).' }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_IMAGEN) return json({ error: 'Esa página pesa demasiado (máximo 4 MB).' }, 413);
  if (!esImagen(bytes, tipo)) return json({ error: 'Ese archivo no es una imagen válida.' }, 400);
  const revisar = (d) => {
    if (!d || !iguales(hash(clave), d.claveHash || '')) return json({ error: 'Esta carta se publicó desde otro dispositivo. Escríbenos para recuperarla.' }, 403);
    if (d.oculta) return json({ error: 'Esta carta está pausada. Escríbenos para revisarla.' }, 403);
    if (d.carta.tipo !== 'archivo') return json({ error: 'Esta carta se hizo con la herramienta; edítala ahí.' }, 400);
    return null;
  };
  const antes = revisar((await leer(rutaCarta(local))).data);
  if (antes) return antes;
  const archivo = `cartas/${local}/p${n}-${randomBytes(6).toString('hex')}.${IMAGENES[tipo]}`;
  await guardarImagen(archivo, bytes, tipo);
  const medida = (v) => { const x = Math.round(Number(v)); return x > 0 && x < 20000 ? x : null; };
  let cuando = '';
  const corte = await modificar(rutaCarta(local), () => null, (d) => {
    const mal = revisar(d);
    if (mal) return mal;
    const paginas = (d.carta.paginas || []).slice(0, total);
    while (paginas.length < total) paginas.push(null);
    paginas[n] = { archivo, w: medida(u.get('w')), h: medida(u.get('h')) };
    d.carta.paginas = paginas;
    d.actualizada = cuando = new Date().toISOString();
    return null;
  });
  if (corte) return corte;
  await modificar(INDICE, indiceVacio, (d) => {
    const x = d.cartas.find((c) => c.local === local);
    if (!x) return json({ ok: true });
    x.actualizada = cuando;
    return null;
  }).catch(() => {});
  return json({ ok: true, n, total });
}

async function publicar(b) {
  if (texto(b.web, 200)) return json({ ok: true, local: 'ejemplo', clave: 'x', url: enlace('ejemplo') }); // trampa para bots
  const local = String(b.local || '');
  const nombre = texto(b.nombre, 60);
  const whatsapp = celular(b.whatsapp);
  const carta = cartaDe(b.carta);
  if (!localValido(local)) return json({ error: 'Elige un link de 3 a 40 letras o números, separados por guiones (ej: picada-don-tito).' }, 400);
  if (!nombre || !whatsapp) return json({ error: 'Revisa tu nombre y tu WhatsApp (celular chileno).' }, 400);
  if (!carta) return json({ error: b.carta && b.carta.tipo === 'archivo' ? 'Escribe el nombre de tu local.' : 'Tu carta necesita el nombre del local y al menos un plato.' }, 400);
  const fecha = hoy();
  const indice = (await leer(INDICE)).data || indiceVacio();
  if (indice.cartas.filter((x) => x.whatsapp === whatsapp).length >= TOPE_POR_WHATSAPP) return json({ error: `Ya tienes ${TOPE_POR_WHATSAPP} cartas publicadas con ese WhatsApp. Escríbenos si necesitas más.` }, 400);
  if (indice.cartas.filter((x) => x.creada === fecha).length >= TOPE_DIARIO) return json({ error: 'Hoy se publicaron muchas cartas. Inténtalo mañana, por favor.' }, 429);
  const clave = randomBytes(24).toString('base64url');
  const doc = { local, carta, claveHash: hash(clave), dueno: { nombre, whatsapp }, creada: fecha, actualizada: new Date().toISOString(), oculta: false };
  if (!(await guardar(rutaCarta(local), doc, null))) return json({ error: 'Ese link ya está ocupado. Prueba con otro.', ocupado: true }, 409);
  await modificar(INDICE, indiceVacio, (d) => {
    d.cartas = d.cartas.filter((x) => x.local !== local);
    d.cartas.push({ local, negocio: carta.local.nombre, nombre, whatsapp, creada: fecha, actualizada: doc.actualizada, oculta: false, reportes: 0, tipo: carta.tipo === 'archivo' ? 'archivo' : 'herramienta' });
  });
  const nuevo = await anotarProspecto({ nombre, whatsapp, negocio: carta.local.nombre, local, comuna: '' }).catch(() => false);
  await enviarCorreo({
    asunto: `Nueva carta con QR: ${carta.local.nombre}`,
    html: `<p>${escapar(nombre)} publicó la carta de <b>${escapar(carta.local.nombre)}</b>: <a href="${enlace(local)}">${enlace(local)}</a>.</p><p>${nuevo ? 'Quedó como prospecto nuevo en el panel.' : 'Ya estaba en el panel; se anotó en sus notas.'} <a href="https://wa.me/${whatsapp}">Escribirle por WhatsApp (+${whatsapp})</a></p>`,
    texto: `${nombre} publicó la carta de ${carta.local.nombre}: ${enlace(local)}\nWhatsApp: +${whatsapp}`,
  }).catch(() => {});
  return json({ ok: true, local, clave, url: enlace(local) });
}

async function actualizar(b) {
  const local = String(b.local || '');
  if (!localValido(local) || typeof b.clave !== 'string') return json({ error: 'No autorizado' }, 403);
  const carta = cartaDe(b.carta);
  if (!carta) return json({ error: b.carta && b.carta.tipo === 'archivo' ? 'Escribe el nombre de tu local.' : 'Tu carta necesita el nombre del local y al menos un plato.' }, 400);
  let cuando = '';
  const corte = await modificar(rutaCarta(local), () => null, (d) => {
    if (!d || !iguales(hash(b.clave), d.claveHash || '')) return json({ error: 'Esta carta se publicó desde otro dispositivo. Escríbenos para recuperarla.' }, 403);
    if (d.oculta) return json({ error: 'Esta carta está pausada. Escríbenos para revisarla.' }, 403);
    // En una carta subida se cambian los datos del local; las páginas siguen hasta que lleguen las nuevas.
    if (carta.tipo === 'archivo' && d.carta.tipo === 'archivo') carta.paginas = d.carta.paginas || [];
    d.carta = carta;
    d.actualizada = cuando = new Date().toISOString();
    return null;
  });
  if (corte) return corte;
  await modificar(INDICE, indiceVacio, (d) => {
    const x = d.cartas.find((c) => c.local === local);
    if (!x) return json({ ok: true });
    x.actualizada = cuando;
    x.negocio = carta.local.nombre;
    return null;
  }).catch(() => {});
  return json({ ok: true, local, url: enlace(local), actualizada: cuando });
}

async function reportar(b) {
  const local = String(b.local || '');
  const motivo = texto(b.motivo, 300);
  if (!localValido(local) || !motivo) return json({ error: 'Cuéntanos qué está mal en esta carta.' }, 400);
  let encontrada = false;
  await modificar(INDICE, indiceVacio, (d) => {
    const x = d.cartas.find((c) => c.local === local);
    if (!x) return json({ ok: true });
    encontrada = true;
    x.reportes = Math.min(999, (Number(x.reportes) || 0) + 1);
    x.ultimoReporte = motivo;
    return null;
  });
  if (encontrada) {
    await enviarCorreo({
      asunto: `Reportaron una carta: ${local}`,
      html: `<p>Reportaron la carta <a href="${enlace(local)}">${enlace(local)}</a>.</p><p><b>Motivo:</b> ${escapar(motivo)}</p><p>Puedes pausarla desde el panel, en Cartas con QR.</p>`,
      texto: `Reportaron la carta ${enlace(local)}\nMotivo: ${motivo}`,
    }).catch(() => {});
  }
  return json({ ok: true });
}

async function panel(b) {
  if (b.accion === 'lista') {
    const { data } = await leer(INDICE);
    const cartas = (data || indiceVacio()).cartas.slice().sort((a, z) => String(z.actualizada).localeCompare(String(a.actualizada)));
    return json({ cartas: cartas.map((c) => ({ ...c, url: enlace(c.local) })) });
  }
  if (b.accion === 'ocultar') {
    const local = String(b.local || '');
    const oculta = Boolean(b.oculta);
    if (!localValido(local)) return json({ error: 'Carta no válida' }, 400);
    const corte = await modificar(rutaCarta(local), () => null, (d) => {
      if (!d) return json({ error: 'No existe esa carta' }, 404);
      d.oculta = oculta;
      return null;
    });
    if (corte) return corte;
    await modificar(INDICE, indiceVacio, (d) => {
      const x = d.cartas.find((c) => c.local === local);
      if (x) x.oculta = oculta;
    });
    return json({ ok: true, local, oculta });
  }
  return json({ error: 'Acción desconocida' }, 400);
}

export default {
  async fetch(request) {
    try {
      if (request.method === 'GET') return new URL(request.url).searchParams.has('img') ? await verImagen(request) : await ver(request);
      if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
      if (!mismoSitio(request)) return json({ error: 'No autorizado' }, 403);
      if (new URL(request.url).searchParams.get('accion') === 'pagina') {
        if (!activo()) return noActivo();
        return await subirPagina(request);
      }
      const crudo = await request.text();
      if (crudo.length > MAX_BYTES) return json({ error: 'La carta es muy pesada. Prueba con un logo más liviano.' }, 413);
      let b;
      try { b = JSON.parse(crudo); } catch { return json({ error: 'Datos inválidos' }, 400); }
      if (!b || typeof b !== 'object') return json({ error: 'Datos inválidos' }, 400);
      if (b.accion === 'lista' || b.accion === 'ocultar') {
        if (!sesion(request)) return json({ error: 'No autorizado' }, 401);
        if (!activo()) return noActivo();
        return await panel(b);
      }
      if (!activo()) return noActivo();
      if (b.accion === 'publicar') return await publicar(b);
      if (b.accion === 'actualizar') return await actualizar(b);
      if (b.accion === 'reportar') return await reportar(b);
      return json({ error: 'Acción desconocida' }, 400);
    } catch (e) {
      console.error('carta', e);
      return json({ error: 'No se pudo guardar, intenta de nuevo en un rato.' }, 500);
    }
  },
};
