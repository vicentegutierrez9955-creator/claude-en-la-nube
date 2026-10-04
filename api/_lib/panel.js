// Utilidades del panel de clientes: sesión, almacenamiento (Vercel Blob privado) y correo (Resend).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { get, put, BlobPreconditionFailedError, BlobNotFoundError } from '@vercel/blob';

const DATA_PATH = 'panel/datos.json';
const COOKIE = 'panel_sesion';
const MAX_AGE = 60 * 60 * 24 * 30;
export const MAX_BYTES = 1024 * 1024;

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

function firmar(valor) {
  return createHmac('sha256', process.env.PANEL_SECRET).update(valor).digest('base64url');
}

function iguales(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export function claveCorrecta(clave) {
  const real = process.env.PANEL_PASSWORD || '';
  return Boolean(real) && typeof clave === 'string' && iguales(clave, real);
}

export function cookieSesion(nombre) {
  const datos = Buffer.from(JSON.stringify({ n: nombre, e: Date.now() + MAX_AGE * 1000 })).toString('base64url');
  return `${COOKIE}=${datos}.${firmar(datos)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

export const cookieBorrada = `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

export function sesion(request) {
  if (!process.env.PANEL_SECRET) return null;
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)panel_sesion=([^;]+)/);
  if (!m) return null;
  const [datos, firma] = m[1].split('.');
  if (!datos || !firma || !iguales(firma, firmar(datos))) return null;
  try {
    const s = JSON.parse(Buffer.from(datos, 'base64url').toString());
    return s.e > Date.now() ? { nombre: s.n } : null;
  } catch {
    return null;
  }
}

// Almacenamiento en memoria solo para pruebas locales (PANEL_STORE=memory).
const memoria = (globalThis.__panelMemoria ??= { texto: null, etag: null, n: 0 });

export async function leerDatos() {
  if (process.env.PANEL_STORE === 'memory') {
    return memoria.texto ? { data: JSON.parse(memoria.texto), etag: memoria.etag } : { data: null, etag: null };
  }
  try {
    const r = await get(DATA_PATH, { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200) return { data: null, etag: null };
    return { data: JSON.parse(await new Response(r.stream).text()), etag: r.blob.etag };
  } catch (e) {
    if (e instanceof BlobNotFoundError) return { data: null, etag: null };
    throw e;
  }
}

// Escribe solo si nadie cambió los datos desde `etag` (null = primera vez).
export async function guardarDatos(data, etag) {
  const texto = JSON.stringify(data);
  if (process.env.PANEL_STORE === 'memory') {
    if ((memoria.etag || null) !== (etag || null)) return { ok: false };
    memoria.texto = texto;
    memoria.etag = `m${++memoria.n}`;
    return { ok: true, etag: memoria.etag };
  }
  try {
    const r = await put(DATA_PATH, texto, {
      access: 'private',
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
      ...(etag ? { ifMatch: etag } : {}),
    });
    return { ok: true, etag: r.etag };
  } catch (e) {
    if (e instanceof BlobPreconditionFailedError) return { ok: false };
    throw e;
  }
}

export function datosValidos(d) {
  return d && typeof d === 'object' && Array.isArray(d.clientes) && Array.isArray(d.pagos)
    && d.clientes.every((c) => c && typeof c === 'object' && typeof c.id === 'string');
}

export function correosDestino() {
  return (process.env.ALERT_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

export async function enviarCorreo({ asunto, html, texto }) {
  const key = process.env.RESEND_API_KEY;
  const to = correosDestino();
  if (!key || !to.length) return { ok: false, motivo: 'Faltan RESEND_API_KEY o ALERT_EMAILS en Vercel.' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.ALERT_FROM || 'Panel de clientes <onboarding@resend.dev>',
      to,
      subject: asunto,
      html,
      text: texto,
    }),
  });
  if (!r.ok) return { ok: false, motivo: `Resend respondió ${r.status}: ${(await r.text()).slice(0, 300)}` };
  return { ok: true, destinos: to };
}

export function escapar(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

export function datosIniciales() {
  return {
    clientes: [
      {
        id: 'asesorias-contables-jc',
        negocio: 'Asesorías Contables JC',
        contacto: 'Juan Carlos Vilches',
        whatsapp: '56991017048',
        email: 'asesoriascontablesjc956@gmail.com',
        ciudad: 'Melipilla',
        web: 'https://asesoriascontables-jc.cl',
        estado: 'activo',
        responsable: 'Vicente',
        desde: '2026-10-01',
        dominio: { nombre: 'asesoriascontables-jc.cl', registrador: 'NIC Chile', dns: 'Cloudflare', vence: '2027-10-01' },
        hosting: { proveedor: 'Vercel', monto: 5000, frecuencia: 'mensual', proximoCobro: '2026-11-01', dia: 1, activo: true },
        productos: [
          { nombre: 'Página web', precio: null, fecha: '2026-10-01', nota: 'El pago de la página es para quien la hizo' },
          { nombre: 'Ficha de Google Maps', precio: null, fecha: '2026-10-03', nota: '' },
          { nombre: 'SEO local y Search Console', precio: null, fecha: '2026-10-04', nota: '' },
        ],
        accesos: [
          { nombre: 'Página web', url: 'https://asesoriascontables-jc.cl' },
          { nombre: 'Ficha de Google Maps', url: 'https://maps.app.goo.gl/uvt4bCtGWuMAxbHp6' },
          { nombre: 'Link para reseñas', url: 'https://g.page/r/Ce-2N3nRvBHbEBM/review' },
          { nombre: 'Search Console', url: 'https://search.google.com/search-console' },
          { nombre: 'Cloudflare (DNS)', url: 'https://dash.cloudflare.com' },
          { nombre: 'NIC Chile', url: 'https://www.nic.cl' },
          { nombre: 'Vercel', url: 'https://vercel.com/ssiderss/plantillas' },
        ],
        notas: '',
      },
    ],
    pagos: [],
    config: { transferencia: '' },
  };
}
