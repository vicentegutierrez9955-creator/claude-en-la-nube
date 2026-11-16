// Endpoints públicos en una sola función (el plan Hobby de Vercel permite 12 por deploy).
// Rutas: /api/publico/contacto (formularios de la web), /api/publico/whatsapp (página /conectar-whatsapp)
// /api/publico/cliente (panel del negocio /mi-whatsapp: chats y bot) y /api/publico/carta (cartas con QR, /carta/<local>).
import contacto from '../_lib/publico/contacto.js';
import whatsapp from '../_lib/publico/whatsapp.js';
import cliente from '../_lib/publico/cliente.js';
import carta from '../_lib/publico/carta.js';

const RUTAS = { contacto, whatsapp, cliente, carta };

export default {
  fetch(request) {
    const h = RUTAS[new URL(request.url).pathname.split('/').filter(Boolean).pop()];
    return h ? h.fetch(request) : new Response('No encontrado', { status: 404 });
  },
};
