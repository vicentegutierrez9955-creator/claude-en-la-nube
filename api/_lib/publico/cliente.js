// Panel del negocio (/mi-whatsapp#k=<clave>): el cliente lee y responde sus chats de WhatsApp y configura su bot.
// La clave la crea el equipo desde /panel/whatsapp ("Panel del cliente"). Todo por POST, desde el mismo sitio:
// { k, accion: 'datos' }                       → negocio, configuración del bot, uso del mes y lista de chats.
// { k, accion: 'chat', numero }                → mensajes de un chat (y lo marca como leído).
// { k, accion: 'guardar', config }             → guarda "lo que sabe el bot" y si está activo.
// { k, accion: 'responder', numero, texto }    → responde desde el número del negocio (dentro de las 24 h) y pausa el bot en ese chat.
// { k, accion: 'pausar', numero, horas }       → pausa el bot en un chat (horas 0 = lo reactiva).
// { k, accion: 'simular', config, mensajes }   → qué respondería el bot, sin enviar nada.
import { createHash, timingSafeEqual } from 'node:crypto';
import { json } from '../panel.js';
import { leerCuentas, guardarCuenta, enviar, numero } from '../whatsapp.js';
import { configBot, limpiarConfig, leerChats, cambiarChats, chatDe, pausado, pausaHasta, ventanaAbierta, simular } from '../bot.js';

const hash = (s) => createHash('sha256').update(String(s)).digest();

async function cuentaDeClave(k) {
  if (!/^[\w-]{24,64}$/.test(String(k || ''))) return null;
  const { cuentas } = await leerCuentas();
  return Object.values(cuentas).find((c) => c.acceso && timingSafeEqual(hash(c.acceso), hash(k))) || null;
}

const resumen = (num, c) => {
  const ultimo = c.mensajes.at(-1) || null;
  return {
    numero: num, nombre: c.nombre || '', noLeidos: c.noLeidos || 0, derivado: Boolean(c.derivado),
    pausado: pausado(c), pausadoHasta: pausado(c) ? c.pausadoHasta : null, ventana: ventanaAbierta(c),
    actualizado: c.actualizado, ultimo: ultimo && { por: ultimo.por, texto: ultimo.texto.slice(0, 120), fecha: ultimo.fecha },
  };
};

export default {
  async fetch(request) {
    if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
    const url = new URL(request.url);
    const origen = request.headers.get('origin');
    if (!origen || origen !== url.origin) return json({ error: 'No autorizado' }, 403);
    const crudo = await request.text();
    if (crudo.length > 30000) return json({ error: 'Demasiados datos' }, 413);
    let b;
    try { b = JSON.parse(crudo); } catch { return json({ error: 'Datos inválidos' }, 400); }
    const cuenta = await cuentaDeClave(b.k);
    if (!cuenta) return json({ error: 'El link no es válido. Pídele uno nuevo a STPyme.' }, 401);
    const num = numero(b.numero);

    if (b.accion === 'datos') {
      const { doc } = await leerChats(cuenta.waba);
      const chats = Object.entries(doc.chats).map(([n, c]) => resumen(n, c))
        .sort((x, y) => (y.actualizado || '').localeCompare(x.actualizado || ''));
      const config = configBot(cuenta);
      return json({
        negocio: config.negocio || cuenta.nombre || '', numero: cuenta.numero, tipo: cuenta.tipo,
        config, uso: doc.uso, iaLista: Boolean(process.env.DEEPSEEK_API_KEY), chats,
      });
    }
    if (b.accion === 'chat') {
      const { doc } = await leerChats(cuenta.waba);
      const c = doc.chats[num];
      if (!c) return json({ error: 'Ese chat no existe' }, 404);
      if (c.noLeidos) await cambiarChats(cuenta.waba, (d) => { if (!d.chats[num]?.noLeidos) return false; d.chats[num].noLeidos = 0; });
      return json({ ...resumen(num, c), noLeidos: 0, mensajes: c.mensajes });
    }
    if (b.accion === 'guardar') {
      const bot = limpiarConfig(b.config);
      if (!(await guardarCuenta({ waba: cuenta.waba, bot }))) return json({ error: 'No se pudo guardar, intenta de nuevo' }, 503);
      return json({ ok: true, config: bot });
    }
    if (b.accion === 'responder') {
      const texto = String(b.texto || '').trim().slice(0, 4000);
      if (!texto) return json({ error: 'Escribe la respuesta' }, 400);
      const { doc } = await leerChats(cuenta.waba);
      const c = doc.chats[num];
      if (!c) return json({ error: 'Ese chat no existe' }, 404);
      // Fuera de las 24 h WhatsApp solo deja enviar plantillas aprobadas (y se cobran).
      if (!ventanaAbierta(c)) return json({ error: 'Pasaron más de 24 horas desde el último mensaje de esta persona: WhatsApp no deja responder con texto libre. Escríbele desde tu celular o espera a que vuelva a escribir.' }, 409);
      const r = await enviar(num, { texto }, cuenta);
      if (!r.ok) return json({ error: r.motivo }, 502);
      await cambiarChats(cuenta.waba, (d) => {
        const ch = chatDe(d, num);
        ch.mensajes.push({ id: r.id, por: 'dueño', texto, fecha: new Date().toISOString() });
        ch.actualizado = new Date().toISOString();
        ch.pausadoHasta = pausaHasta();
        ch.derivado = false;
        ch.noLeidos = 0;
      });
      return json({ ok: true });
    }
    if (b.accion === 'pausar') {
      const horas = Math.min(Math.max(Number(b.horas) || 0, 0), 24 * 30);
      const r = await cambiarChats(cuenta.waba, (d) => {
        const ch = d.chats[num];
        if (!ch) return false;
        ch.pausadoHasta = horas ? pausaHasta(horas) : null;
        if (!horas) ch.derivado = false;
      });
      return r.ok ? json({ ok: true }) : json({ error: 'No se pudo guardar, intenta de nuevo' }, 503);
    }
    if (b.accion === 'simular') {
      const config = limpiarConfig({ ...configBot(cuenta), ...(b.config || {}) });
      const { doc } = await leerChats(cuenta.waba);
      if ((doc.uso?.tokens || 0) >= config.topeTokensMes) return json({ error: 'Se alcanzó el tope de uso del mes' }, 429);
      const r = await simular(config, b.mensajes);
      if (r.error) return json(r, 502);
      if (r.tokens) await cambiarChats(cuenta.waba, (d) => { d.uso.tokens += r.tokens; });
      return json(r);
    }
    return json({ error: 'Acción desconocida' }, 400);
  },
};
