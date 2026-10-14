// Endpoint MCP de Optimind OS (Streamable HTTP). Protegido con OAuth: sin un token válido responde 401
// con el puntero a /.well-known/oauth-protected-resource/api/mcp para que claude.ai inicie la autorización.
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { crearDefinir } from './_lib/os/comun.js';
import { registrarCrm } from './_lib/os/h-crm.js';
import { registrarEstrategia } from './_lib/os/h-estrategia.js';
import { registrarContenido } from './_lib/os/h-contenido.js';
import { registrarGeneral } from './_lib/os/h-general.js';
import { verificarAcceso, SCOPE } from './_lib/os/oauth.js';
import { CORS, opciones } from './_lib/os/http.js';

const INSTRUCCIONES = `Optimind OS: datos reales de Optimind Partners (CRM de clientes y leads, estrategia, productos y contenido de marca).
Hay dos unidades de negocio (unidad_negocio): web_agenda (webs con agendamiento de citas para pymes unipersonales) y erp_talleres (ERP Tuerkit para talleres mecánicos).
Para ponerte al día llama primero a resumen_empresa (enfoque "ventas" o "marca", y unidad_negocio si trabajas una sola unidad). Las listas vienen paginadas y compactas; pide el detalle con las herramientas ver_*.
Puedes crear y actualizar, pero no borrar. Cada escritura queda auditada con el nombre de la persona que autorizó el conector.`;

const mcp = createMcpHandler((server) => {
  const definir = crearDefinir(server);
  registrarGeneral(definir, server);
  registrarCrm(definir);
  registrarEstrategia(definir);
  registrarContenido(definir);
}, { serverInfo: { name: 'optimind-os', version: '1.0.0' }, instructions: INSTRUCCIONES });

const protegido = withMcpAuth(mcp, verificarAcceso, {
  required: true,
  requiredScopes: [SCOPE],
  resourceMetadataPath: '/.well-known/oauth-protected-resource/api/mcp',
});

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return opciones();
    const r = await protegido(request);
    // CORS para clientes web (MCP Inspector); el token va en el header, no en cookies.
    const h = new Headers(r.headers);
    for (const [k, v] of Object.entries(CORS)) h.set(k, v);
    return new Response(r.body, { status: r.status, statusText: r.statusText, headers: h });
  },
};
