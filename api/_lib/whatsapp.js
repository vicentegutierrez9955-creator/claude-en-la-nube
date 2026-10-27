// WhatsApp Business Platform (Cloud API de Meta): envío de mensajes y registro de conversaciones en el Blob privado.
// Variables en Vercel: WHATSAPP_TOKEN y WHATSAPP_APP_SECRET (secretas), WHATSAPP_VERIFY_TOKEN y WHATSAPP_PHONE_NUMBER_ID.
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { leerDoc, guardarDoc } from './panel.js';

const API = 'https://graph.facebook.com/v25.0';
const RUTA = 'whatsapp/registro.json';
const MAX_MENSAJES = 300;

export const numero = (v) => String(v ?? '').replace(/\D/g, '').slice(0, 15);

// Meta firma cada aviso con la clave secreta de la app: "sha256=<hmac del cuerpo crudo>".
export function firmaValida(crudo, firma) {
  const clave = process.env.WHATSAPP_APP_SECRET;
  if (!clave || !firma) return false;
  const esperada = Buffer.from('sha256=' + createHmac('sha256', clave).update(crudo).digest('hex'));
  const recibida = Buffer.from(String(firma));
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

// Envía un mensaje: { texto } (solo dentro de las 24 h desde el último mensaje de la persona) o { plantilla, idioma, variables }.
// Sin `cuenta` sale del número de STPyme; con `cuenta` (de las conectadas con "Conectar WhatsApp") sale del número del cliente.
export async function enviar(para, { texto, plantilla, idioma = 'es', variables = [] }, cuenta = null) {
  const token = cuenta ? cuenta.token : process.env.WHATSAPP_TOKEN;
  const desde = cuenta ? cuenta.phoneNumberId : process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !desde) return { ok: false, motivo: 'Faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_NUMBER_ID en Vercel.' };
  const cuerpo = { messaging_product: 'whatsapp', to: numero(para) };
  if (plantilla) {
    cuerpo.type = 'template';
    cuerpo.template = { name: plantilla, language: { code: idioma } };
    if (variables.length) cuerpo.template.components = [{ type: 'body', parameters: variables.map((v) => ({ type: 'text', text: String(v) })) }];
  } else {
    cuerpo.type = 'text';
    cuerpo.text = { body: String(texto).slice(0, 4096), preview_url: false };
  }
  const r = await fetch(`${API}/${desde}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, motivo: j.error?.message || `Meta respondió ${r.status}` };
  const id = j.messages?.[0]?.id || null;
  await anotar((reg) => {
    reg.mensajes.push({ id, dir: 'sale', numero: cuerpo.to, linea: desde, texto: plantilla ? `[plantilla ${plantilla}]` : cuerpo.text.body, fecha: new Date().toISOString(), estado: 'enviado' });
  });
  return { ok: true, id };
}

// Llamada simple a la Graph API con el token del sistema (para diagnóstico). Nunca devuelve el token.
export async function graph(ruta, method = 'GET') {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return { error: 'Falta WHATSAPP_TOKEN' };
  const r = await fetch(`${API}/${ruta}`, { method, headers: { authorization: `Bearer ${token}` } });
  return r.json().catch(() => ({ error: `Meta respondió ${r.status}` }));
}

// Cuentas de clientes conectadas con el registro insertado de Meta (botón "Conectar WhatsApp").
// Se guardan en el Blob privado con el token de cada negocio; el token nunca sale del servidor.
const CUENTAS = 'whatsapp/cuentas.json';
export const APP_ID = process.env.META_APP_ID || '2621913031556176';

export async function leerCuentas() {
  const { data, etag } = await leerDoc(CUENTAS);
  return { cuentas: data || {}, etag };
}

export async function guardarCuenta(cuenta) {
  for (let intento = 0; intento < 4; intento++) {
    const { cuentas, etag } = await leerCuentas();
    cuentas[cuenta.waba] = { ...cuentas[cuenta.waba], ...cuenta };
    if ((await guardarDoc(CUENTAS, cuentas, etag)).ok) return true;
  }
  return false;
}

// Llamada a la Graph API con un token dado (el del negocio conectado).
export async function graphCon(token, ruta, method = 'GET', cuerpo = null) {
  const r = await fetch(`${API}/${ruta}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
    ...(cuerpo ? { body: JSON.stringify(cuerpo) } : {}),
  });
  return r.json().catch(() => ({ error: { message: `Meta respondió ${r.status}` } }));
}

// Cambia el código que entrega el registro insertado por el token del negocio.
export async function canjearCodigo(code) {
  const clave = process.env.WHATSAPP_APP_SECRET;
  if (!clave) return { error: { message: 'Falta WHATSAPP_APP_SECRET en Vercel' } };
  const q = new URLSearchParams({ client_id: APP_ID, client_secret: clave, code });
  const r = await fetch(`${API}/oauth/access_token?${q}`);
  return r.json().catch(() => ({ error: { message: `Meta respondió ${r.status}` } }));
}

const idMeta = (v) => String(v || '').replace(/\D/g, '').slice(0, 20);
const motivo = (r) => r?.error?.message || null;

// Termina el registro insertado: canjea el código, suscribe la app a la cuenta del negocio, registra el número
// si es nuevo y guarda la cuenta. `extra` se guarda junto a la cuenta (quién conectó, invitación, negocio).
export async function conectarCuenta({ code, waba, telefono, tipo, extra = {} }) {
  code = String(code || '').slice(0, 2000);
  if (!code) return { status: 400, error: 'Falta el código de Meta' };
  const tok = await canjearCodigo(code);
  if (!tok.access_token) return { status: 502, error: `No se pudo canjear el código: ${motivo(tok) || 'sin token'}` };
  const token = tok.access_token;
  waba = idMeta(waba);
  telefono = idMeta(telefono);
  // Si el navegador no alcanzó a recibir los IDs, se sacan de los permisos que el negocio le dio a la app.
  if (!waba && process.env.WHATSAPP_APP_SECRET) {
    const d = await graphCon(`${APP_ID}|${process.env.WHATSAPP_APP_SECRET}`, `debug_token?input_token=${encodeURIComponent(token)}`);
    waba = idMeta((d.data?.granular_scopes || []).find((s) => s.scope === 'whatsapp_business_management')?.target_ids?.[0]);
  }
  if (!waba) return { status: 502, error: 'Meta no informó la cuenta de WhatsApp conectada' };
  if (!telefono) telefono = idMeta((await graphCon(token, `${waba}/phone_numbers?fields=id`)).data?.[0]?.id);
  const suscripcion = await graphCon(token, `${waba}/subscribed_apps`, 'POST');
  // Un número nuevo hay que registrarlo en la Cloud API; con coexistencia (WhatsApp Business) ya está registrado.
  tipo = tipo === 'coexistencia' ? 'coexistencia' : 'nuevo';
  let pin = null, registro = null;
  if (tipo === 'nuevo' && telefono) {
    pin = String(randomInt(0, 1e6)).padStart(6, '0');
    registro = await graphCon(token, `${telefono}/register`, 'POST', { messaging_product: 'whatsapp', pin });
    if (!registro.success) pin = null;
  }
  const info = telefono ? await graphCon(token, `${telefono}?fields=display_phone_number,verified_name`) : {};
  const cuenta = {
    waba, phoneNumberId: telefono || null, numero: info.display_phone_number || null, nombre: info.verified_name || null,
    tipo, conectada: new Date().toISOString(), ...extra, token, ...(pin ? { pin } : {}),
  };
  if (!(await guardarCuenta(cuenta))) return { status: 503, error: 'No se pudo guardar la cuenta, intenta de nuevo' };
  return {
    status: 200, ok: true, waba, telefono: cuenta.phoneNumberId, numero: cuenta.numero, nombre: cuenta.nombre, tipo,
    suscrita: Boolean(suscripcion.success), errorSuscripcion: motivo(suscripcion),
    registrado: registro ? Boolean(registro.success) : null, errorRegistro: motivo(registro),
  };
}

// Invitaciones: un link de un solo uso para que un negocio conecte su WhatsApp sin entrar al panel.
const INVITACIONES = 'whatsapp/invitaciones.json';
const DIAS_INVITACION = 14;

export async function leerInvitaciones() {
  const { data, etag } = await leerDoc(INVITACIONES);
  return { invitaciones: data || {}, etag };
}

async function cambiarInvitaciones(cambio) {
  for (let intento = 0; intento < 4; intento++) {
    const { invitaciones, etag } = await leerInvitaciones();
    const r = cambio(invitaciones);
    if (r === false) return false;
    if ((await guardarDoc(INVITACIONES, invitaciones, etag)).ok) return r ?? true;
  }
  return false;
}

export async function crearInvitacion({ negocio, por }) {
  const id = randomBytes(18).toString('base64url');
  const inv = { negocio: String(negocio).trim().slice(0, 80), creada: new Date().toISOString(), vence: new Date(Date.now() + DIAS_INVITACION * 864e5).toISOString(), por: por || null, usada: null };
  const ok = await cambiarInvitaciones((todas) => { todas[id] = inv; });
  return ok ? { id, ...inv } : null;
}

// Devuelve la invitación si existe, no venció y no se usó.
export async function invitacionVigente(id) {
  if (!/^[\w-]{20,40}$/.test(String(id || ''))) return null;
  const { invitaciones } = await leerInvitaciones();
  const inv = invitaciones[id];
  return inv && !inv.usada && new Date(inv.vence) > new Date() ? inv : null;
}

export const marcarInvitacionUsada = (id, waba) =>
  cambiarInvitaciones((todas) => { if (!todas[id]) return false; todas[id].usada = { fecha: new Date().toISOString(), waba }; });

export async function leerRegistro() {
  const { data } = await leerDoc(RUTA);
  return data || { mensajes: [], bajas: {}, eliminar: [] };
}

// Aplica un cambio al registro, reintentando si otro aviso lo cambió al mismo tiempo.
export async function anotar(cambio) {
  for (let intento = 0; intento < 4; intento++) {
    const { data, etag } = await leerDoc(RUTA);
    const reg = data || { mensajes: [], bajas: {}, eliminar: [] };
    if (cambio(reg) === false) return true;
    reg.mensajes = reg.mensajes.slice(-MAX_MENSAJES);
    if ((await guardarDoc(RUTA, reg, etag)).ok) return true;
  }
  return false;
}
