// Pantalla de autorización: la persona entra con su usuario y clave personal (OS_USUARIOS) y, si es correcta,
// se devuelve un código de un solo uso al cliente (claude.ai). Nada se redirige antes de validar cliente y retorno.
import { escapar } from '../_lib/panel.js';
import {
  validarCliente, verificarClave, emitirCodigo, recurso, esLoopback, bloqueado, anotarFallo, SCOPE,
} from '../_lib/os/oauth.js';
import { leerCuerpo } from '../_lib/os/http.js';
import { auditar } from '../_lib/os/auditoria.js';

const CAMPOS = ['response_type', 'client_id', 'redirect_uri', 'state', 'code_challenge', 'code_challenge_method', 'scope', 'resource'];

function pagina(cuerpo, status = 200) {
  return new Response(`<!DOCTYPE html><html lang="es-CL"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Autorizar acceso · Optimind OS</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1b2d;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:#0f1b2d;padding:16px}
.card{background:#fff;border-radius:18px;max-width:420px;width:100%;padding:28px 24px;box-shadow:0 30px 60px -30px rgba(0,0,0,.6)}
h1{font-size:22px;margin:0 0 6px}p{margin:0 0 14px;color:#475467}.app{font-weight:700;color:#0f1b2d}
.host{font-family:ui-monospace,monospace;background:#f2f4f7;border-radius:8px;padding:2px 8px;color:#0f1b2d}
.aviso{background:#fef3c7;color:#78350f;border-radius:10px;padding:10px 12px;font-size:14px}
label{display:block;font-weight:600;font-size:14px;margin:12px 0 4px}
input{width:100%;box-sizing:border-box;border:2px solid #d0d5dd;border-radius:10px;padding:11px 12px;font:inherit}
input:focus{outline:none;border-color:#1f6feb}
button{margin-top:18px;width:100%;border:0;border-radius:999px;background:#1f6feb;color:#fff;font:inherit;font-weight:700;padding:13px}
.error{background:#fef2f2;color:#991b1b;border-radius:10px;padding:10px 12px;font-size:14px}
ul{margin:0 0 14px;padding-left:20px;color:#475467;font-size:14px}
</style></head><body><main class="card">${cuerpo}</main></body></html>`, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-frame-options': 'DENY',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
      'referrer-policy': 'no-referrer',
    },
  });
}

const errorPagina = (texto) => pagina(`<h1>No se puede autorizar</h1><p>${escapar(texto)}</p>`, 400);

function redirigir(retorno, params) {
  const u = new URL(retorno);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { location: u.toString(), 'cache-control': 'no-store' } });
}

function formulario(p, cliente, mensajeError = '') {
  const host = new URL(p.redirect_uri).host;
  const ocultos = CAMPOS.map((k) => (p[k] ? `<input type="hidden" name="${k}" value="${escapar(p[k])}">` : '')).join('');
  return pagina(`<h1>Conectar con Optimind OS</h1>
<p><span class="app">${escapar(cliente.nombre)}</span> pide acceso para leer y escribir los datos de la empresa (clientes, leads, estrategia y contenido). Después te devolverá a <span class="host">${escapar(host)}</span>.</p>
<ul><li>No podrá borrar nada.</li><li>Cada cambio queda registrado con tu nombre.</li></ul>
${esLoopback(p.redirect_uri) ? '<p class="aviso">Esta autorización vuelve a un programa de este computador (localhost). Continúa solo si tú lo iniciaste, por ejemplo Claude Code o MCP Inspector.</p>' : ''}
${mensajeError ? `<p class="error" role="alert">${escapar(mensajeError)}</p>` : ''}
<form method="post" action="/api/oauth/autorizar">${ocultos}
<label for="u">Usuario</label><input id="u" name="usuario" autocomplete="username" required maxlength="40" autofocus>
<label for="c">Clave personal</label><input id="c" name="clave" type="password" autocomplete="current-password" required maxlength="200">
<button type="submit">Autorizar</button></form>`, mensajeError ? 401 : 200);
}

export default {
  async fetch(request) {
    if (!['GET', 'POST'].includes(request.method)) return errorPagina('Método no permitido');
    const fuente = request.method === 'GET' ? Object.fromEntries(new URL(request.url).searchParams) : await leerCuerpo(request);
    const p = Object.fromEntries(CAMPOS.map((k) => [k, String(fuente[k] || '').slice(0, 2000)]));

    // 1) Cliente y retorno: si fallan, se muestra el error aquí (nunca se redirige a un retorno no validado).
    if (!p.client_id || !p.redirect_uri) return errorPagina('Faltan client_id o redirect_uri.');
    const cliente = await validarCliente(p.client_id, p.redirect_uri);
    if (cliente.error) return errorPagina(cliente.error);

    // 2) El resto de errores vuelven al cliente, como pide OAuth.
    const volverConError = (codigo, descripcion) => redirigir(p.redirect_uri, { error: codigo, error_description: descripcion, state: p.state });
    if (p.response_type !== 'code') return volverConError('unsupported_response_type', 'Solo response_type=code');
    if (!p.code_challenge || p.code_challenge_method !== 'S256') return volverConError('invalid_request', 'PKCE S256 es obligatorio');
    const recursoUrl = recurso(request);
    if (p.resource && p.resource.replace(/\/$/, '') !== recursoUrl) return volverConError('invalid_target', 'Recurso desconocido');

    if (request.method === 'GET') return formulario(p, cliente);

    // 3) Login con clave personal.
    const usuario = String(fuente.usuario || '').trim().slice(0, 40);
    if (await bloqueado(usuario)) return formulario(p, cliente, 'Demasiados intentos. Espera 15 minutos.');
    const nombre = verificarClave(usuario, fuente.clave);
    if (!nombre) {
      await anotarFallo(usuario);
      await new Promise((r) => setTimeout(r, 800));
      return formulario(p, cliente, 'Usuario o clave incorrectos.');
    }
    const scope = SCOPE;
    const code = emitirCodigo({ usuario: nombre, clientId: p.client_id, retorno: p.redirect_uri, desafio: p.code_challenge, recursoUrl, scope });
    await auditar({ usuario: nombre, herramienta: 'oauth', accion: 'inicio de sesión para autorizar', cliente: cliente.nombre });
    return redirigir(p.redirect_uri, { code, state: p.state, iss: new URL(recursoUrl).origin });
  },
};
