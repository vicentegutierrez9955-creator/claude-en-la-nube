// Endpoints públicos en una sola función (el plan Hobby de Vercel permite 12 por deploy).
// Rutas: /api/publico/contacto (formularios de la web), /api/publico/whatsapp (página /conectar-whatsapp)
// /api/publico/cliente (panel del negocio /mi-whatsapp: chats y bot), /api/publico/carta (cartas con QR, /carta/<local>)
// /api/publico/tuerkit (avisos por WhatsApp cuando Tuerkit cambia el estado de un auto)
// y /api/publico/tienda (tienda de ebooks y asesorías: Mercado Pago, embudo y métricas del panel).
import contacto from '../_lib/publico/contacto.js';
import whatsapp from '../_lib/publico/whatsapp.js';
import cliente from '../_lib/publico/cliente.js';
import carta from '../_lib/publico/carta.js';
import tuerkit from '../_lib/publico/tuerkit.js';
import tienda from '../_lib/publico/tienda.js';

const RUTAS = { contacto, whatsapp, cliente, carta, tuerkit, tienda };

// Vercel agrega ?accion=<ruta> por el nombre de este archivo ([accion].js), y eso puede tapar el ?accion propio
// de una ruta (las cartas suben sus páginas con ?accion=pagina). Se quita lo agregado antes de pasar el pedido;
// si Vercel reemplazó el valor, una imagen enviada a /carta es una página de carta.
export function sinAccionDeVercel(request, ruta) {
  const url = new URL(request.url);
  if (!url.searchParams.has('accion')) return request;
  const propias = url.searchParams.getAll('accion').filter((a) => a !== ruta);
  if (!propias.length && ruta === 'carta' && request.method === 'POST' && /^image\//i.test(request.headers.get('content-type') || '')) propias.push('pagina');
  url.searchParams.delete('accion');
  propias.forEach((a) => url.searchParams.append('accion', a));
  const conCuerpo = request.method !== 'GET' && request.method !== 'HEAD';
  return new Request(url, { method: request.method, headers: request.headers, ...(conCuerpo ? { body: request.body, duplex: 'half' } : {}) });
}

export default {
  fetch(request) {
    const ruta = new URL(request.url).pathname.split('/').filter(Boolean).pop();
    const h = RUTAS[ruta];
    return h ? h.fetch(sinAccionDeVercel(request, ruta)) : new Response('No encontrado', { status: 404 });
  },
};
