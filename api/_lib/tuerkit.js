// Avisos de Tuerkit por WhatsApp: cuando el taller cambia el estado de un auto en Tuerkit, al cliente le llega un
// WhatsApp desde el número del taller (conectado con "Conectar WhatsApp"). Como el cliente no escribió en las
// últimas 24 h, el aviso va con una plantilla aprobada por Meta (categoría "utilidad").
// Cada taller tiene su propia clave (se crea en /panel/whatsapp, botón "Tuerkit"); se guarda solo su hash.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { leerDoc, guardarDoc } from './panel.js';
import { leerCuentas, guardarCuenta, graphCon } from './whatsapp.js';

export const IDIOMA = 'es';
const PIE = 'Si tienes dudas, responde este mensaje.';
export const PLANTILLAS = {
  estado_vehiculo: {
    cuerpo: `Hola {{1}}, te escribimos de {{2}}. Tu {{3}} patente {{4}} cambió de estado: {{5}}.\n\n${PIE}`,
    ejemplos: ['Juan', 'Taller Gotuerca', 'Toyota Yaris', 'ABCD12', 'Listo para retirar'],
  },
  estado_vehiculo_link: {
    cuerpo: `Hola {{1}}, te escribimos de {{2}}. Tu {{3}} patente {{4}} cambió de estado: {{5}}.\n\nPuedes ver el detalle en este link: {{6}}\n\n${PIE}`,
    ejemplos: ['Juan', 'Taller Gotuerca', 'Toyota Yaris', 'ABCD12', 'Listo para retirar', 'https://ejemplo.cl/auto/123'],
  },
};

const hashClave = (clave) => createHash('sha256').update(String(clave)).digest('hex');
const iguales = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
export const claveValida = (clave) => /^tk_[A-Za-z0-9_-]{30,60}$/.test(String(clave || ''));

// Crea una clave nueva para el taller (reemplaza la anterior). Devuelve la clave: se muestra una sola vez.
export async function nuevaClave(waba) {
  const clave = 'tk_' + randomBytes(30).toString('base64url');
  const ok = await guardarCuenta({ waba, tuerkit: { hash: hashClave(clave), creada: new Date().toISOString() } });
  return ok ? clave : null;
}

// Busca la cuenta del taller dueña de la clave.
export async function cuentaDeClave(clave) {
  if (!claveValida(clave)) return null;
  const h = hashClave(clave);
  const { cuentas } = await leerCuentas();
  return Object.values(cuentas).find((c) => c.tuerkit?.hash && iguales(c.tuerkit.hash, h)) || null;
}

// Estado de las dos plantillas en la cuenta de WhatsApp del taller; con `crear`, manda a revisión las que falten.
export async function plantillas(cuenta, { crear = false } = {}) {
  const r = await graphCon(cuenta.token, `${cuenta.waba}/message_templates?fields=name,status,language,rejected_reason&limit=100`);
  if (r.error) return { error: r.error.message || 'Meta no respondió' };
  const existentes = (r.data || []).filter((p) => PLANTILLAS[p.name] && p.language === IDIOMA);
  const out = [];
  for (const [nombre, def] of Object.entries(PLANTILLAS)) {
    const p = existentes.find((x) => x.name === nombre);
    if (p) { out.push({ nombre, estado: p.status, motivo: p.rejected_reason && p.rejected_reason !== 'NONE' ? p.rejected_reason : null }); continue; }
    if (!crear) { out.push({ nombre, estado: 'NO_CREADA' }); continue; }
    const c = await graphCon(cuenta.token, `${cuenta.waba}/message_templates`, 'POST', {
      name: nombre, language: IDIOMA, category: 'UTILITY',
      components: [{ type: 'BODY', text: def.cuerpo, example: { body_text: [def.ejemplos] } }],
    });
    out.push(c.error ? { nombre, estado: 'ERROR', motivo: c.error.error_user_msg || c.error.message } : { nombre, estado: c.status || 'PENDING' });
  }
  return { plantillas: out };
}

// Meta no acepta saltos de línea, tabs ni más de 4 espacios seguidos dentro de una variable.
export const variable = (v, max) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);

// Registro de avisos (para no mandar dos veces el mismo y para revisar qué se envió). El teléfono va tapado.
const REGISTRO = 'whatsapp/tuerkit.json';
const MAX_REGISTRO = 1000;
export const TOPE_DIARIO = 300; // avisos por taller por día, por si un error en Tuerkit los manda en bucle

export async function leerAvisos() {
  const { data, etag } = await leerDoc(REGISTRO);
  return { avisos: data?.avisos || [], etag };
}

export async function anotarAviso(aviso) {
  for (let intento = 0; intento < 4; intento++) {
    const { avisos, etag } = await leerAvisos();
    avisos.push(aviso);
    if ((await guardarDoc(REGISTRO, { avisos: avisos.slice(-MAX_REGISTRO) }, etag)).ok) return true;
  }
  return false;
}

export const tapar = (tel) => (tel.length > 4 ? '•'.repeat(tel.length - 4) + tel.slice(-4) : tel);
