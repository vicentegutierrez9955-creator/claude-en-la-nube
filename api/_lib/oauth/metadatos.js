// Metadatos del servidor de autorización (RFC 8414). Se sirve en /.well-known/oauth-authorization-server.
import { origen, SCOPE } from '../os/oauth.js';
import { jsonCors, opciones } from '../os/http.js';

export default {
  fetch(request) {
    if (request.method === 'OPTIONS') return opciones();
    const o = origen(request);
    return jsonCors({
      issuer: o,
      authorization_endpoint: `${o}/api/oauth/autorizar`,
      token_endpoint: `${o}/api/oauth/token`,
      registration_endpoint: `${o}/api/oauth/registro`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: [SCOPE, 'offline_access'],
      client_id_metadata_document_supported: true,
      service_documentation: `${o}/panel`,
    });
  },
};
