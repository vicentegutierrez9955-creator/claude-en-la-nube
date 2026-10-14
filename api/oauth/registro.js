// Registro dinámico de clientes (RFC 7591). No guarda nada: el client_id lleva firmados sus retornos.
import { registrarCliente } from '../_lib/os/oauth.js';
import { jsonCors, opciones } from '../_lib/os/http.js';

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return opciones();
    if (request.method !== 'POST') return jsonCors({ error: 'invalid_request' }, 405);
    let meta;
    try { meta = await request.json(); } catch { return jsonCors({ error: 'invalid_client_metadata' }, 400); }
    const r = registrarCliente(meta);
    return jsonCors(r, r.error ? 400 : 201);
  },
};
