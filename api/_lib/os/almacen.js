// Documentos de Optimind OS en el Blob privado. El CRM sigue en panel/datos.json (el mismo que usa el panel);
// la estrategia y el contenido van en archivos aparte para no agrandar ni arriesgar el del CRM.
import { leerDoc, guardarDoc, datosIniciales } from '../panel.js';

export const DOCS = {
  crm: { ruta: 'panel/datos.json', vacio: datosIniciales },
  os: { ruta: 'panel/os.json', vacio: () => ({ vision: null, objetivos: [], estrategias: [], iniciativas: [], tareas: [], metricas: [], productos: [] }) },
  contenido: { ruta: 'panel/contenido.json', vacio: () => ({ publicaciones: [], metricasRedes: [], biblioteca: [], briefings: [], rutina: { plantilla: [], semanas: [] } }) },
};

// Completa las listas que falten (documentos creados antes de que existiera alguna colección).
function conVacios(doc, data) {
  const base = DOCS[doc].vacio();
  const d = data || base;
  for (const [k, v] of Object.entries(base)) if (d[k] === undefined || (Array.isArray(v) && !Array.isArray(d[k]))) d[k] = v;
  if (doc === 'crm') for (const k of ['prospectos', 'trabajos']) if (!Array.isArray(d[k])) d[k] = [];
  return d;
}

export async function leer(doc) {
  const { data } = await leerDoc(DOCS[doc].ruta);
  return conVacios(doc, data);
}

// Lee, aplica `cambio(data)` y guarda. Si alguien guardó entremedio (ETag distinto), lo reintenta
// con los datos nuevos. Devuelve lo que devuelva `cambio`.
export async function modificar(doc, cambio, usuario) {
  for (let intento = 0; intento < 4; intento++) {
    const { data, etag } = await leerDoc(DOCS[doc].ruta);
    const d = conVacios(doc, data);
    const resultado = await cambio(d);
    d.actualizado = new Date().toISOString();
    d.actualizadoPor = usuario ? `Claude (${usuario})` : 'Claude';
    const r = await guardarDoc(DOCS[doc].ruta, d, etag);
    if (r.ok) return resultado;
  }
  throw new Error('Otra persona estaba guardando al mismo tiempo. Intenta de nuevo.');
}
