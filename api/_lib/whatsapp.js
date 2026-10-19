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
export async function enviar(para, { texto, plantilla, idioma = 'es', variables = [] }) {
  const token = process.env.WHATSAPP_TOKEN;
  const desde = process.env.WHATSAPP_PHONE_NUMBER_ID;
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
    reg.mensajes.push({ id, dir: 'sale', numero: cuerpo.to, texto: plantilla ? `[plantilla ${plantilla}]` : cuerpo.text.body, fecha: new Date().toISOString(), estado: 'enviado' });
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
