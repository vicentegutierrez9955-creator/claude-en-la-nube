// Servidor local para probar el MCP y el OAuth de Optimind OS sin Vercel (datos en memoria).
// Uso: PANEL_SECRET=algo OS_USUARIOS="$(node scripts/crear-usuario-os.mjs prueba | grep scrypt)" node scripts/dev-os.mjs
// Luego: npx @modelcontextprotocol/inspector  →  http://localhost:8790/api/mcp
import http from 'node:http';

process.env.PANEL_STORE ||= 'memory';
const PUERTO = Number(process.env.PORT) || 8790;
const RUTAS = {
  '/api/mcp': '../api/mcp.js',
  '/api/oauth/autorizar': '../api/oauth/autorizar.js',
  '/api/oauth/token': '../api/oauth/token.js',
  '/api/oauth/registro': '../api/oauth/registro.js',
  '/api/oauth/metadatos': '../api/oauth/metadatos.js',
  '/api/oauth/recurso': '../api/oauth/recurso.js',
  '/.well-known/oauth-authorization-server': '../api/oauth/metadatos.js',
  '/.well-known/oauth-protected-resource/api/mcp': '../api/oauth/recurso.js',
  '/.well-known/oauth-protected-resource': '../api/oauth/recurso.js',
  '/api/panel/os': '../api/panel/os.js',
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PUERTO}`);
    const archivo = RUTAS[url.pathname];
    if (!archivo) { res.writeHead(404).end('No encontrado'); return; }
    const { default: h } = await import(new URL(archivo, import.meta.url));
    const cuerpo = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise((ok) => { const b = []; req.on('data', (c) => b.push(c)).on('end', () => ok(Buffer.concat(b))); });
    const r = await h.fetch(new Request(url, { method: req.method, headers: req.headers, body: cuerpo }));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.writeHead(500).end('Error');
  }
}).listen(PUERTO, () => console.log(`Optimind OS local en http://localhost:${PUERTO}/api/mcp`));
