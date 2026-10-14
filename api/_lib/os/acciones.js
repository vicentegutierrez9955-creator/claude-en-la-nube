// Acciones compartidas entre las herramientas MCP y el panel: terminar tareas e iniciativas, y la
// migración que asigna la unidad de negocio a los registros que existían antes de que hubiera unidades.
import { hoy } from './util.js';

export const ESTADOS_INI = ['propuesta', 'en curso', 'pausada', 'terminada'];
export const ESTADOS_TAR = ['pendiente', 'en curso', 'hecha', 'bloqueada'];
export const ESTADOS_TRABAJO = ['pendiente', 'en curso', 'hecho'];

// Guarda la fecha de término al terminar y la quita si se reabre.
export function marcarTermino(x, estadoFinal, campo) {
  if (x.estado === estadoFinal) x[campo] ||= hoy();
  else delete x[campo];
}

// ---------- migración: unidad de negocio de los registros antiguos ----------
// Todo lo que nombra talleres, mecánica o el ERP es de erp_talleres; el resto de leads y clientes
// viene de la prospección de páginas web (web_agenda). Objetivos y estrategias solo se marcan si
// nombran el ERP; los demás quedan generales (de las dos unidades).
const ERP = /taller|mec[aá]nic|automotr|tuerk|\berp\b|lubricentro|vulcaniz|desabollad/i;
const WEB = /web|p[aá]gina|agenda|sitio/i;
const texto = (...v) => v.flat().filter(Boolean).join(' ');

export function planUnidad({ crm, os }) {
  const plan = [];
  const proponer = (coleccion, x, nombre, unidad) => { if (!x.unidad && unidad) plan.push({ coleccion, id: x.id, nombre, unidad }); };
  for (const p of crm.prospectos || []) proponer('leads', p, p.negocio, ERP.test(texto(p.negocio, p.rubro)) ? 'erp_talleres' : 'web_agenda');
  for (const c of crm.clientes || []) proponer('clientes', c, c.negocio, ERP.test(texto(c.negocio, c.rubro, (c.productos || []).map((x) => x.nombre))) ? 'erp_talleres' : 'web_agenda');
  for (const p of os.productos || []) {
    const t = texto(p.nombre, p.descripcion);
    proponer('productos', p, p.nombre, ERP.test(t) ? 'erp_talleres' : WEB.test(t) ? 'web_agenda' : null);
  }
  for (const o of os.objetivos || []) proponer('objetivos', o, o.titulo, ERP.test(texto(o.titulo, o.descripcion)) ? 'erp_talleres' : null);
  for (const s of os.estrategias || []) proponer('estrategias', s, s.titulo, ERP.test(texto(s.titulo, s.descripcion)) ? 'erp_talleres' : null);
  return plan;
}

// Aplica un plan ya revisado (solo a lo que sigue sin unidad). Devuelve cuántos cambió por colección.
export function aplicarPlan(doc, d, plan) {
  const donde = { leads: [doc === 'crm', 'prospectos'], clientes: [doc === 'crm', 'clientes'], productos: [doc === 'os', 'productos'], objetivos: [doc === 'os', 'objetivos'], estrategias: [doc === 'os', 'estrategias'] };
  const hechos = {};
  for (const item of plan) {
    const [aqui, coleccion] = donde[item.coleccion] || [];
    if (!aqui) continue;
    const x = (d[coleccion] || []).find((y) => y.id === item.id);
    if (x && !x.unidad) { x.unidad = item.unidad; (hechos[item.coleccion] ||= []).push(item.id); }
  }
  return hechos;
}
