// Endpoints públicos en una sola función (el plan Hobby de Vercel permite 12 por deploy).
// Rutas: /api/publico/contacto (formularios de la web) y /api/publico/whatsapp (página /conectar-whatsapp).
import contacto from '../_lib/publico/contacto.js';
import whatsapp from '../_lib/publico/whatsapp.js';

const RUTAS = { contacto, whatsapp };

export default {
  fetch(request) {
    const h = RUTAS[new URL(request.url).pathname.split('/').filter(Boolean).pop()];
    return h ? h.fetch(request) : new Response('No encontrado', { status: 404 });
  },
};
