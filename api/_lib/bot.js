// Bot de WhatsApp de cada negocio conectado: conversaciones, configuración ("lo que sabe el bot") y respuestas.
// Para gastar lo mínimo: primero responde sin IA lo repetido (respuestas fijas, "ok", "gracias"), junta los mensajes
// seguidos del cliente en una sola respuesta y manda a DeepSeek solo los últimos mensajes, sin datos personales.
// Las conversaciones de cada negocio van en su propio documento del Blob privado: whatsapp/chats/<waba>.json.
import { leerDoc, guardarDoc } from './panel.js';
import { leerCuentas, enviar, numero } from './whatsapp.js';

const MAX_CHATS = 300;
const MAX_MENSAJES_CHAT = 60;
const HISTORIAL_IA = 12;
export const PAUSA_HORAS = 12;
const DEEPSEEK = 'https://api.deepseek.com/chat/completions';
// Espera antes de responder: si el cliente manda varios mensajes seguidos, se contestan todos juntos (una sola llamada).
const ESPERA_MS = () => Number(process.env.BOT_ESPERA_MS ?? 4000);
const JUNTAR_MS = 15 * 60e3;
const AUDIO = 'Por ahora no puedo escuchar audios 🙏 ¿Me lo puedes escribir?';

const rutaChats = (waba) => `whatsapp/chats/${waba}.json`;
const mesActual = () => new Date().toISOString().slice(0, 7);
const normal = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export const CONFIG_INICIAL = {
  activo: false,
  negocio: '', rubro: '', direccion: '', horario: '',
  servicios: '', preguntas: '', tono: 'Cercano y amable, como en Chile, sin exagerar.', extra: '',
  respuestas: [], // [{ palabras: 'horario, a que hora', respuesta: 'Atendemos de lunes a viernes…' }]
  mensajeDerivar: 'Gracias por escribir. Una persona del equipo te va a responder lo antes posible 🙌',
  topeTokensMes: 3000000,
};

export function configBot(cuenta) {
  return { ...CONFIG_INICIAL, negocio: cuenta?.negocio || cuenta?.nombre || '', ...(cuenta?.bot || {}) };
}

// Limpia lo que llega del panel: solo campos conocidos y con largo acotado.
export function limpiarConfig(c = {}) {
  const t = (v, max) => String(v ?? '').slice(0, max);
  return {
    activo: Boolean(c.activo),
    negocio: t(c.negocio, 80), rubro: t(c.rubro, 60), direccion: t(c.direccion, 200), horario: t(c.horario, 400),
    servicios: t(c.servicios, 3000), preguntas: t(c.preguntas, 3000), tono: t(c.tono, 300), extra: t(c.extra, 1500),
    respuestas: (Array.isArray(c.respuestas) ? c.respuestas : []).slice(0, 20)
      .map((r) => ({ palabras: t(r?.palabras, 200), respuesta: t(r?.respuesta, 600) }))
      .filter((r) => r.palabras.trim() && r.respuesta.trim()),
    mensajeDerivar: t(c.mensajeDerivar, 300) || CONFIG_INICIAL.mensajeDerivar,
    topeTokensMes: Math.min(Math.max(Number(c.topeTokensMes) || CONFIG_INICIAL.topeTokensMes, 100000), 50000000),
  };
}

// ---------- Conversaciones ----------
export async function leerChats(waba) {
  const { data, etag } = await leerDoc(rutaChats(waba));
  return { doc: data || { chats: {}, uso: { mes: mesActual(), tokens: 0, respuestas: 0, sinIA: 0 } }, etag };
}

// Aplica un cambio al documento de conversaciones del negocio, reintentando si cambió al mismo tiempo.
export async function cambiarChats(waba, cambio) {
  for (let intento = 0; intento < 5; intento++) {
    const { doc, etag } = await leerChats(waba);
    if (doc.uso?.mes !== mesActual()) doc.uso = { mes: mesActual(), tokens: 0, respuestas: 0, sinIA: 0 };
    const r = cambio(doc);
    if (r === false) return { ok: true, doc, sinCambios: true };
    // Recorta: mensajes por chat y cantidad de chats (se quedan los más recientes).
    const lista = Object.entries(doc.chats);
    for (const [, c] of lista) c.mensajes = c.mensajes.slice(-MAX_MENSAJES_CHAT);
    if (lista.length > MAX_CHATS) {
      lista.sort((a, b) => (b[1].actualizado || '').localeCompare(a[1].actualizado || ''));
      doc.chats = Object.fromEntries(lista.slice(0, MAX_CHATS));
    }
    if ((await guardarDoc(rutaChats(waba), doc, etag)).ok) return { ok: true, doc, resultado: r };
  }
  return { ok: false };
}

export function chatDe(doc, numero, nombre = '') {
  const c = (doc.chats[numero] ||= { nombre: '', mensajes: [], pausadoHasta: null, derivado: false, actualizado: null });
  if (nombre && !c.nombre) c.nombre = nombre;
  return c;
}

export const pausado = (chat) => Boolean(chat?.pausadoHasta && new Date(chat.pausadoHasta) > new Date());
export const pausaHasta = (horas = PAUSA_HORAS) => new Date(Date.now() + horas * 3600e3).toISOString();

// La ventana de 24 h de WhatsApp: se puede responder con texto libre solo si el cliente escribió hace menos de 24 h.
export function ventanaAbierta(chat) {
  const ultimo = [...(chat?.mensajes || [])].reverse().find((m) => m.por === 'cliente');
  return Boolean(ultimo && Date.now() - new Date(ultimo.fecha).getTime() < 24 * 3600e3);
}

// ---------- Respuestas sin IA ----------
const SOLO_ACUSE = /^((ok|oka|okey|okis|dale|listo|gracias|muchas|mil|perfecto|genial|bueno|buena|ya|vale|si|no|super|👍|🙏|❤️|😊|🙌|👌)[\s!.,]*)+$/u;

// Devuelve { texto } con una respuesta fija, { nada: true } si no hay que responder, o null si debe responder la IA.
// Con `trasPregunta` (lo último que dijo el negocio fue una pregunta), un "sí", "ok" o "dale" sí se responde.
export function respuestaSinIA(texto, config, trasPregunta = false) {
  const t = normal(texto);
  if (t === '[audio]') return { texto: AUDIO };
  if (!t || /^\[(sticker|reaction|image|video|document|location|contacts|unsupported)\]$/.test(t)) return { nada: true };
  if (SOLO_ACUSE.test(t)) return trasPregunta ? null : { nada: true };
  if (t.length <= 80) {
    for (const r of config.respuestas || []) {
      const palabras = r.palabras.split(',').map(normal).filter(Boolean);
      if (palabras.some((p) => t.includes(p))) return { texto: r.respuesta };
    }
  }
  return null;
}

// Tapa datos personales antes de mandar texto a la IA.
export function enmascarar(s) {
  return String(s || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[correo]')
    .replace(/\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g, '[rut]')
    .replace(/\+?\d[\d\s-]{7,}\d/g, '[teléfono]');
}

// Instrucciones del bot: siempre iguales y al principio, para que DeepSeek cobre menos la parte repetida (caché).
export function promptSistema(c) {
  const sec = (titulo, v) => (String(v || '').trim() ? `\n\n${titulo}:\n${String(v).trim()}` : '');
  return `Eres el asistente virtual de WhatsApp de ${c.negocio || 'este negocio'}${c.rubro ? ` (${c.rubro})` : ''}. Atiendes a sus clientes por WhatsApp.
Reglas:
- Responde en español de Chile, breve (máximo 3 frases) y claro. Tono: ${c.tono || CONFIG_INICIAL.tono}
- Usa SOLO la información de abajo. Nunca inventes precios, horarios, disponibilidad ni datos que no estén escritos.
- Si no sabes la respuesta, si es un reclamo, una urgencia, un pago o algo que necesita a una persona, empieza tu respuesta con [DERIVAR] y luego di en una frase que una persona del equipo le responderá pronto.
- Si el cliente pide hablar con una persona, empieza con [DERIVAR].
- Si te preguntan si eres una persona, di que eres el asistente virtual de ${c.negocio || 'el negocio'}.
- No pidas datos sensibles (RUT, tarjetas, claves).${sec('Dirección', c.direccion)}${sec('Horario', c.horario)}${sec('Servicios y precios', c.servicios)}${sec('Preguntas frecuentes', c.preguntas)}${sec('Indicaciones del dueño', c.extra)}`;
}

// Pide la respuesta a DeepSeek con los últimos mensajes del chat. Devuelve { texto, derivar, tokens } o { error }.
export async function responderConIA(config, mensajes) {
  const clave = process.env.DEEPSEEK_API_KEY;
  if (!clave) return { error: 'Falta DEEPSEEK_API_KEY en Vercel' };
  const historial = mensajes.slice(-HISTORIAL_IA)
    .filter((m) => m.texto)
    .map((m) => ({ role: m.por === 'cliente' ? 'user' : 'assistant', content: enmascarar(m.texto).slice(0, 1000) }));
  if (!historial.length || historial.at(-1).role !== 'user') return { error: 'No hay mensaje del cliente que responder' };
  let r;
  try {
    r = await fetch(DEEPSEEK, {
      method: 'POST',
      headers: { authorization: `Bearer ${clave}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || 'deepseek-chat', messages: [{ role: 'system', content: promptSistema(config) }, ...historial], max_tokens: 300, temperature: 0.3, stream: false }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    return { error: `DeepSeek no respondió (${e.name})` };
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { error: j.error?.message || `DeepSeek respondió ${r.status}` };
  let texto = String(j.choices?.[0]?.message?.content || '').trim();
  const derivar = texto.startsWith('[DERIVAR]');
  texto = texto.replace(/^\[DERIVAR\]\s*/, '').trim();
  return { texto: texto || (derivar ? config.mensajeDerivar : ''), derivar, tokens: (j.usage?.total_tokens) || 0 };
}

// ---------- Atención de los mensajes que llegan al webhook ----------
export function textoDe(m) {
  if (m.type === 'text') return m.text?.body || '';
  if (m.type === 'button') return m.button?.text || '';
  if (m.type === 'interactive') return m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || '';
  return `[${m.type}]`;
}

const fechaDe = (m) => new Date(Number(m.timestamp) * 1000 || Date.now()).toISOString();
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function cuentaDeLinea(linea) {
  const { cuentas } = await leerCuentas();
  return Object.values(cuentas).find((c) => c.phoneNumberId && c.phoneNumberId === linea) || null;
}

// Guarda en las conversaciones del negocio lo que llegó en un aviso de su línea: mensajes de sus clientes y, con
// coexistencia, lo que el dueño respondió desde su app WhatsApp Business (message_echoes: el bot se pausa en ese chat).
// Después, si el bot está activo, responde cada chat con mensajes nuevos.
export async function atenderLinea(v) {
  const cuenta = await cuentaDeLinea(v.metadata?.phone_number_id);
  if (!cuenta) return { atendidos: 0 };
  const nuevos = new Map(); // número → id del último mensaje nuevo
  await cambiarChats(cuenta.waba, (doc) => {
    nuevos.clear();
    let cambio = false;
    for (const m of v.messages || []) {
      const de = numero(m.from);
      const nombre = (v.contacts || []).find((c) => c.wa_id === m.from)?.profile?.name || '';
      const chat = chatDe(doc, de, nombre);
      if (chat.mensajes.some((x) => x.id === m.id)) continue; // Meta reintenta: no duplicar
      const fecha = fechaDe(m);
      chat.mensajes.push({ id: m.id, por: 'cliente', texto: textoDe(m).slice(0, 1000), fecha });
      chat.actualizado = fecha;
      chat.noLeidos = (chat.noLeidos || 0) + 1;
      nuevos.set(de, m.id);
      cambio = true;
    }
    for (const e of v.message_echoes || []) {
      const chat = chatDe(doc, numero(e.to));
      if (chat.mensajes.some((x) => x.id === e.id)) continue;
      const fecha = fechaDe(e);
      chat.mensajes.push({ id: e.id, por: 'dueño', texto: textoDe(e).slice(0, 1000), fecha });
      chat.actualizado = fecha;
      chat.pausadoHasta = pausaHasta();
      chat.derivado = false;
      chat.noLeidos = 0;
      cambio = true;
    }
    return cambio;
  });
  const config = configBot(cuenta);
  if (!config.activo || !nuevos.size) return { atendidos: 0 };
  if (ESPERA_MS()) await esperar(ESPERA_MS());
  const resultados = await Promise.all([...nuevos].map(([num, id]) => responderChat(cuenta, config, num, id)));
  return { atendidos: resultados.filter((r) => r.enviado).length, resultados };
}

// Responde un chat si sigue siendo el turno del bot: el mensaje `idUltimo` es el último del cliente (si llegó otro,
// lo responde el aviso de ese mensaje), nadie respondió después y el chat no está pausado.
export async function responderChat(cuenta, config, num, idUltimo) {
  const { doc } = await leerChats(cuenta.waba);
  const chat = doc.chats[num];
  if (!chat || pausado(chat)) return { motivo: 'pausado' };
  const ultimo = chat.mensajes.at(-1);
  if (!ultimo || ultimo.por !== 'cliente' || ultimo.id !== idUltimo) return { motivo: 'no es su turno' };
  // Se contestan juntos los mensajes seguidos del cliente de los últimos minutos (los más antiguos, por ejemplo de
  // antes de prender el bot, igual van en el historial que lee la IA).
  const desde = chat.mensajes.findLastIndex((m) => m.por !== 'cliente');
  const pendientes = chat.mensajes.slice(desde + 1).filter((m) => new Date(ultimo.fecha) - new Date(m.fecha) < JUNTAR_MS);
  const trasPregunta = desde >= 0 && /\?\s*\W*$/u.test(chat.mensajes[desde].texto || '');
  const utiles = pendientes.filter((m) => !respuestaSinIA(m.texto, config, trasPregunta)?.nada);
  if (!utiles.length) return { motivo: 'nada que responder' };

  let texto = null, derivar = false, tokens = 0, sinIA = false;
  const fijas = utiles.map((m) => respuestaSinIA(m.texto, config, trasPregunta)?.texto);
  if (fijas.every(Boolean)) { texto = [...new Set(fijas)].join('\n\n'); sinIA = true; }
  else if ((doc.uso?.mes === mesActual() ? doc.uso.tokens : 0) >= config.topeTokensMes) { texto = config.mensajeDerivar; derivar = true; sinIA = true; }
  else {
    const ia = await responderConIA(config, chat.mensajes);
    if (ia.error) { console.warn('bot:', ia.error); texto = config.mensajeDerivar; derivar = true; sinIA = true; }
    else ({ texto, derivar, tokens } = ia);
  }
  if (!texto) return { motivo: 'sin respuesta' };
  const r = await enviar(num, { texto }, cuenta);
  if (!r.ok) { console.warn('bot: no se pudo enviar:', r.motivo); return { motivo: r.motivo }; }
  await cambiarChats(cuenta.waba, (d) => {
    const c = chatDe(d, num);
    if (!c.mensajes.some((m) => m.id === r.id)) c.mensajes.push({ id: r.id, por: 'bot', texto, fecha: new Date().toISOString() });
    c.actualizado = new Date().toISOString();
    if (derivar) { c.derivado = true; c.pausadoHasta = pausaHasta(); }
    d.uso.tokens += tokens;
    d.uso[sinIA ? 'sinIA' : 'respuestas'] += 1;
  });
  return { enviado: true, texto, derivar };
}

// Simulador del panel: qué respondería el bot con una configuración (aunque no esté guardada), sin enviar nada.
export async function simular(config, mensajes) {
  const historial = (Array.isArray(mensajes) ? mensajes : []).slice(-HISTORIAL_IA)
    .map((m) => ({ por: m?.por === 'cliente' ? 'cliente' : 'bot', texto: String(m?.texto || '').slice(0, 1000) }));
  const ultimo = historial.at(-1);
  if (!ultimo || ultimo.por !== 'cliente') return { error: 'Escribe un mensaje como cliente' };
  const anterior = historial.at(-2);
  const fija = respuestaSinIA(ultimo.texto, config, anterior?.por === 'bot' && /\?\s*\W*$/u.test(anterior.texto));
  if (fija?.nada) return { texto: null, nota: 'El bot no responde a esto (es un "ok", "gracias", sticker o imagen).' };
  if (fija?.texto) return { texto: fija.texto, nota: 'Respuesta fija (sin IA, no gasta).' };
  const ia = await responderConIA(config, historial);
  if (ia.error) return { error: ia.error };
  return { texto: ia.texto, derivar: ia.derivar, tokens: ia.tokens, nota: ia.derivar ? 'El bot pasaría este chat a una persona y se pausaría.' : null };
}
