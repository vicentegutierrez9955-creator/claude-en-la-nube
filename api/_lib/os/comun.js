// Base de las herramientas MCP: constantes de negocio, esquemas zod reutilizables y la envoltura que
// serializa respuestas compactas, oculta errores internos y registra la auditoría de cada escritura.
import { z } from 'zod';
import { auditar } from './auditoria.js';
import { compacto, ErrorUsuario } from './util.js';

export const ETAPAS = ['por contactar', 'contactado', 'interesado', 'cerrado', 'no interesado'];
export const ORIGENES = ['instagram', 'tiktok', 'whatsapp_frio', 'correo_frio', 'referido', 'google', 'web', 'otro'];
export const AREAS = ['marca_contenido', 'ventas', 'proyectos_entrega', 'finanzas'];
export const ENFOQUES = { ventas: ['ventas', 'proyectos_entrega', 'finanzas'], marca: ['marca_contenido'] };
export const ESTADOS_PUB = ['Idea', 'Guion', 'Grabado', 'Editado', 'Publicado'];
// Unidades de negocio. Leads y clientes siempre tienen una; productos, objetivos y estrategias pueden
// no tenerla (son generales, de las dos unidades).
export const UNIDADES = ['web_agenda', 'erp_talleres'];
export const UNIDAD_DESC = 'web_agenda (webs con agendamiento de citas para pymes unipersonales, la vende el fundador) o erp_talleres (ERP Tuerkit para talleres mecánicos, a cargo de Pablo)';

export const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD');
export const texto = (max) => z.string().trim().max(max);
export const url = z.string().trim().max(500).regex(/^https:\/\//, 'El link debe empezar con https://');
export const id = z.string().trim().min(1).max(80);
export const paginacion = {
  pagina: z.number().int().min(1).max(1000).default(1),
  limite: z.number().int().min(1).max(50).default(20),
};

export const unidad = z.enum(UNIDADES).describe(`Unidad de negocio: ${UNIDAD_DESC}`);
// Para productos, objetivos, estrategias y métricas: "ninguna" la quita (queda general).
export const unidadOpcional = z.enum([...UNIDADES, 'ninguna']).describe(`Unidad de negocio: ${UNIDAD_DESC}; "ninguna" la deja general`);
export const unidadFiltro = z.enum([...UNIDADES, 'sin_unidad']).describe('Filtra por unidad de negocio ("sin_unidad": los que aún no tienen)');

// Aplica una unidad recibida de una herramienta: undefined no cambia nada y "ninguna" la quita.
export function ponerUnidad(x, campo, valor) {
  if (valor === undefined) return;
  if (valor === 'ninguna') delete x[campo];
  else x[campo] = valor;
}

export function fallar(mensaje) {
  throw new ErrorUsuario(mensaje);
}

// Registra una herramienta. `escritura: true` la marca como no solo-lectura; la función recibe
// (args, { usuario, auditar }) y devuelve un objeto que se envía como JSON compacto.
export function crearDefinir(server) {
  return function definir(nombre, { titulo, descripcion, entrada, escritura = false }, fn) {
    server.registerTool(nombre, {
      title: titulo,
      description: descripcion,
      inputSchema: entrada || z.object({}),
      annotations: { readOnlyHint: !escritura, destructiveHint: false },
    }, async (args, ctx) => {
      const usuario = ctx?.http?.authInfo?.extra?.usuario || 'desconocido';
      try {
        const r = await fn(args || {}, { usuario, auditar: (e) => auditar({ usuario, herramienta: nombre, ...e }) });
        return { content: [{ type: 'text', text: JSON.stringify(compacto(r)) }] };
      } catch (e) {
        if (e instanceof ErrorUsuario) return { isError: true, content: [{ type: 'text', text: e.message }] };
        console.error(`Error en ${nombre}:`, e);
        return { isError: true, content: [{ type: 'text', text: 'Error interno al ejecutar la herramienta. Intenta de nuevo en un momento.' }] };
      }
    });
  };
}
