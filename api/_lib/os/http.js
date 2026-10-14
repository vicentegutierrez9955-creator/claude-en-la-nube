// Respuestas HTTP de los endpoints OAuth (con CORS: los clientes web como MCP Inspector llaman desde el navegador).
export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id, mcp-method, mcp-name',
  'access-control-expose-headers': 'www-authenticate, mcp-session-id, mcp-protocol-version',
  'access-control-max-age': '86400',
};

export function jsonCors(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS, ...extra },
  });
}

export const opciones = () => new Response(null, { status: 204, headers: CORS });

// Lee el cuerpo como formulario o JSON (el token endpoint usa x-www-form-urlencoded).
export async function leerCuerpo(request) {
  const tipo = request.headers.get('content-type') || '';
  const texto = await request.text();
  if (texto.length > 20000) return {};
  if (tipo.includes('application/json')) { try { return JSON.parse(texto) || {}; } catch { return {}; } }
  return Object.fromEntries(new URLSearchParams(texto));
}
