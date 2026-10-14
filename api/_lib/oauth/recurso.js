// Metadatos del recurso protegido (RFC 9728) para el MCP. Se sirve en /.well-known/oauth-protected-resource/api/mcp.
import { origen, recurso, SCOPE } from '../os/oauth.js';
import { jsonCors, opciones } from '../os/http.js';

export default {
  fetch(request) {
    if (request.method === 'OPTIONS') return opciones();
    return jsonCors({
      resource: recurso(request),
      authorization_servers: [origen(request)],
      scopes_supported: [SCOPE],
      bearer_methods_supported: ['header'],
      resource_name: 'Optimind OS',
    });
  },
};
