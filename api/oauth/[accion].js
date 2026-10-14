// Servidor de autorización OAuth en una sola función (el plan Hobby de Vercel permite 12 por deploy).
// Rutas: /api/oauth/{autorizar,token,registro,metadatos,recurso} y los /.well-known que apuntan acá.
import autorizar from '../_lib/oauth/autorizar.js';
import token from '../_lib/oauth/token.js';
import registro from '../_lib/oauth/registro.js';
import metadatos from '../_lib/oauth/metadatos.js';
import recurso from '../_lib/oauth/recurso.js';

const RUTAS = { autorizar, token, registro, metadatos, recurso };

export default {
  fetch(request) {
    const url = new URL(request.url);
    let accion = url.pathname.split('/').filter(Boolean).pop();
    if (url.pathname.startsWith('/.well-known/oauth-authorization-server')) accion = 'metadatos';
    else if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) accion = 'recurso';
    else if (!RUTAS[accion]) accion = url.searchParams.get('accion');
    const h = RUTAS[accion];
    return h ? h.fetch(request) : new Response('No encontrado', { status: 404 });
  },
};
