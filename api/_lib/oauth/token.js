// Endpoint de tokens: canjea el código (con PKCE) y renueva tokens rotando el refresh token.
import {
  leerFirmado, s256, emitirTokens, usarUnaVez, revocarFamilia, familiaRevocada, usuarioPermitido, recurso,
} from '../os/oauth.js';
import { jsonCors, opciones, leerCuerpo } from '../os/http.js';
import { auditar } from '../os/auditoria.js';

const error = (codigo, descripcion, status = 400) => jsonCors({ error: codigo, error_description: descripcion }, status);

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return opciones();
    if (request.method !== 'POST') return error('invalid_request', 'Usa POST', 405);
    const p = await leerCuerpo(request);
    const recursoUrl = recurso(request);

    if (p.grant_type === 'authorization_code') {
      const c = leerFirmado(p.code, 'cod');
      if (!c) return error('invalid_grant', 'Código inválido o vencido');
      if (p.client_id && p.client_id !== c.cid) return error('invalid_grant', 'El código es de otro cliente');
      if (p.redirect_uri !== c.ru) return error('invalid_grant', 'redirect_uri distinto');
      if (!p.code_verifier || s256(p.code_verifier) !== c.cc) return error('invalid_grant', 'PKCE inválido');
      if (p.resource && p.resource !== recursoUrl) return error('invalid_target', 'Recurso desconocido');
      if (!usuarioPermitido(c.sub)) return error('invalid_grant', 'Usuario sin acceso');
      if (!(await usarUnaVez(c.jti))) return error('invalid_grant', 'El código ya se usó');
      await auditar({ usuario: c.sub, herramienta: 'oauth', accion: 'conector autorizado', cliente: c.cid.startsWith('dcr.') ? 'registro dinámico' : c.cid });
      return jsonCors(emitirTokens({ usuario: c.sub, clientId: c.cid, recursoUrl: c.aud, scope: c.scp }));
    }

    if (p.grant_type === 'refresh_token') {
      const r = leerFirmado(p.refresh_token, 'rt');
      if (!r || (p.client_id && p.client_id !== r.cid) || r.aud !== recursoUrl) return error('invalid_grant', 'Refresh token inválido');
      if (!usuarioPermitido(r.sub) || (await familiaRevocada(r.fam))) return error('invalid_grant', 'Acceso revocado');
      if (!(await usarUnaVez(r.jti))) {
        // Un refresh token reutilizado indica que alguien lo copió: se revoca toda la cadena.
        await revocarFamilia(r.fam);
        await auditar({ usuario: r.sub, herramienta: 'oauth', accion: 'refresh token reutilizado: acceso revocado' });
        return error('invalid_grant', 'Refresh token ya usado');
      }
      return jsonCors(emitirTokens({ usuario: r.sub, clientId: r.cid, recursoUrl: r.aud, scope: r.scp, familia: r.fam }));
    }

    return error('unsupported_grant_type', 'Solo authorization_code y refresh_token');
  },
};
