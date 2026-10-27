// Webhook de WhatsApp (Meta). GET: verificación de la suscripción. POST: mensajes entrantes y estados de los enviados.
// Solo acepta avisos firmados con WHATSAPP_APP_SECRET. Responde SALIR, VOLVER y ELIMINAR (ver /privacidad).
// Los avisos de las líneas de clientes conectados los atiende el bot de cada negocio (api/_lib/bot.js).
import { json } from '../_lib/panel.js';
import { firmaValida, enviar, anotar, numero } from '../_lib/whatsapp.js';
import { atenderLinea, textoDe } from '../_lib/bot.js';

const RESPUESTAS = {
  salir: 'Listo, no te enviaremos más mensajes de reseñas ni de controles. Los avisos de tus horas reservadas siguen llegando. Si fue un error, responde VOLVER.',
  volver: 'Listo, volverás a recibir nuestros mensajes. Para dejar de recibirlos, responde SALIR.',
  eliminar: 'Recibimos tu solicitud para borrar tus datos. Lo haremos dentro de 30 días y te avisaremos por aquí cuando esté hecho.',
  hola: 'Hola, este es el número de STPyme para confirmar y recordar horas reservadas. Estamos en pruebas. Responde SALIR para no recibir más mensajes o ELIMINAR para que borremos tus datos.',
};

// Deja trabajando al bot después de responder a Meta (Vercel espera la promesa); fuera de Vercel, se espera aquí.
function enSegundoPlano(promesa) {
  const waitUntil = globalThis[Symbol.for('@vercel/request-context')]?.get?.()?.waitUntil;
  if (typeof waitUntil === 'function') { waitUntil(promesa); return null; }
  return promesa;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const p = url.searchParams;
      const token = process.env.WHATSAPP_VERIFY_TOKEN;
      if (p.get('hub.mode') === 'subscribe' && token && p.get('hub.verify_token') === token) {
        return new Response(p.get('hub.challenge') || '', { headers: { 'content-type': 'text/plain' } });
      }
      return json({ error: 'No autorizado' }, 403);
    }
    if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
    const crudo = await request.text();
    if (!firmaValida(crudo, request.headers.get('x-hub-signature-256'))) {
      console.warn('whatsapp webhook: firma inválida (revisa WHATSAPP_APP_SECRET)');
      return json({ error: 'Firma inválida' }, 401);
    }
    let aviso;
    try { aviso = JSON.parse(crudo); } catch { return json({ error: 'Datos inválidos' }, 400); }

    const cambios = (aviso.entry || []).flatMap((e) => e.changes || []).map((c) => c.value || {});
    console.log('whatsapp webhook:', cambios.reduce((n, v) => n + (v.messages || []).length, 0), 'mensajes,', cambios.reduce((n, v) => n + (v.statuses || []).length, 0), 'estados');
    const respuestas = [];
    await anotar((reg) => {
      respuestas.length = 0; // si se reintenta el guardado, no repetir respuestas
      for (const v of cambios) {
        // Los números de clientes conectados con "Conectar WhatsApp" llegan a este mismo webhook: esos mensajes
        // solo se registran; las respuestas automáticas y las bajas son del número de STPyme.
        const linea = v.metadata?.phone_number_id || null;
        const propia = !linea || linea === process.env.WHATSAPP_PHONE_NUMBER_ID;
        for (const s of v.statuses || []) {
          const m = reg.mensajes.find((x) => x.id === s.id);
          if (m) m.estado = s.status === 'failed' ? `falló: ${s.errors?.[0]?.title || ''}`.trim() : s.status;
        }
        for (const m of v.messages || []) {
          if (reg.mensajes.some((x) => x.id === m.id)) continue; // Meta reintenta: no duplicar
          const de = numero(m.from);
          const texto = textoDe(m).slice(0, 1000);
          const nombre = (v.contacts || []).find((c) => c.wa_id === m.from)?.profile?.name || '';
          reg.mensajes.push({ id: m.id, dir: 'entra', numero: de, nombre, texto, linea, fecha: new Date(Number(m.timestamp) * 1000 || Date.now()).toISOString() });
          if (!propia) continue;
          const palabra = texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/)[0];
          if (palabra === 'salir') reg.bajas[de] = new Date().toISOString();
          if (palabra === 'volver') delete reg.bajas[de];
          if (palabra === 'eliminar' && !reg.eliminar.some((x) => x.numero === de && !x.hecho)) reg.eliminar.push({ numero: de, fecha: new Date().toISOString(), hecho: false });
          const clave = ['salir', 'volver', 'eliminar'].includes(palabra) ? palabra : /^(hola|prueba|test)$/.test(palabra) ? 'hola' : null;
          if (clave) respuestas.push([de, RESPUESTAS[clave]]);
        }
      }
    });
    const lineasClientes = cambios.filter((v) => v.metadata?.phone_number_id && v.metadata.phone_number_id !== process.env.WHATSAPP_PHONE_NUMBER_ID
      && ((v.messages || []).length || (v.message_echoes || []).length));
    const bot = lineasClientes.length
      ? enSegundoPlano(Promise.all(lineasClientes.map((v) => atenderLinea(v).catch((e) => console.error('bot:', e)))))
      : null;
    for (const [para, texto] of respuestas) {
      const r = await enviar(para, { texto });
      if (!r.ok) console.warn('whatsapp webhook: no se pudo responder:', r.motivo);
    }
    if (bot) await bot;
    return json({ ok: true });
  },
};
