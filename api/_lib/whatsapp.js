// WhatsApp Business Platform (Cloud API de Meta): envío de mensajes y registro de conversaciones en el Blob privado.
// Variables en Vercel: WHATSAPP_TOKEN y WHATSAPP_APP_SECRET (secretas), WHATSAPP_VERIFY_TOKEN y WHATSAPP_PHONE_NUMBER_ID.
import { createHmac, timingSafeEqual } from 'node:crypto';
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
