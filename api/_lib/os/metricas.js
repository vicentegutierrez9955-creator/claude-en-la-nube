// Métricas (resultados clave) y avance de objetivos. Las automáticas se calculan con datos reales
// del CRM y del módulo de contenido; las manuales usan el último valor registrado.
import { ETAPAS } from './comun.js';
import { hoy, esFecha } from './util.js';

export const FUENTES = {
  leads_nuevos: 'Leads agregados en el periodo',
  leads_contactados: 'Leads contactados por primera vez en el periodo',
  leads_interesados: 'Leads que pasaron a interesado en el periodo',
  leads_cerrados: 'Leads cerrados (ganados) en el periodo',
  tasa_conversion: '% de leads contactados en el periodo que terminaron cerrados',
  leads_por_origen: 'Leads nuevos de un origen (parametro = origen, ej. instagram)',
  clientes_nuevos: 'Clientes que empezaron en el periodo',
  clientes_activos: 'Clientes activos hoy',
  ingresos_cobrados: 'Suma de pagos recibidos en el periodo (CLP)',
  ingreso_mensual_recurrente: 'Hosting mensual activo + anual/12 (CLP)',
  publicaciones_publicadas: 'Publicaciones con estado Publicado en el periodo',
  seguidores_instagram: 'Seguidores de Instagram (última semana registrada)',
  seguidores_tiktok: 'Seguidores de TikTok (última semana registrada)',
  seguidores_total: 'Seguidores de Instagram + TikTok (última semana)',
  diagnosticos_redes: 'Diagnósticos que llegaron por redes en el periodo',
  mensajes_redes: 'Mensajes recibidos por redes en el periodo',
  tareas_completadas: 'Tareas completadas en el periodo (parametro opcional = área)',
};

const orden = (e) => (e === 'no interesado' ? 1 : ETAPAS.indexOf(e || 'por contactar'));
const enRango = (f, desde, hasta) => esFecha(f) && f >= desde && f <= hasta;

// Fecha en que el lead llegó a una etapa: historial (si existe) o las marcas que deja el panel.
export function fechaEtapa(p, etapa) {
  const h = (p.historialEtapas || []).find((x) => x.estado === etapa);
  if (h) return h.fecha;
  if (etapa === 'contactado') return p.contactado?.fecha || (p.mensajes || [])[0]?.fecha || null;
  return null;
}

// ¿Llegó a esa etapa dentro del periodo? Si no hay fecha, se usa la fecha de alta como aproximación.
function llegoEnPeriodo(p, etapa, desde, hasta) {
  if (orden(p.estado) < orden(etapa)) return false;
  const f = fechaEtapa(p, etapa);
  return f ? enRango(f, desde, hasta) : enRango(p.desde, desde, hasta);
}

export function calcularFuente(fuente, parametro, { crm, os, contenido }, desde, hasta) {
  const leads = crm.prospectos || [];
  const semanas = [...(contenido.metricasRedes || [])].sort((a, b) => b.semana.localeCompare(a.semana));
  const sumaSemanas = (campo) => semanas.filter((s) => enRango(s.semana, desde, hasta)).reduce((t, s) => t + (Number(s[campo]) || 0), 0);
  switch (fuente) {
    case 'leads_nuevos': return leads.filter((p) => enRango(p.desde, desde, hasta)).length;
    case 'leads_contactados': return leads.filter((p) => llegoEnPeriodo(p, 'contactado', desde, hasta)).length;
    case 'leads_interesados': return leads.filter((p) => llegoEnPeriodo(p, 'interesado', desde, hasta)).length;
    case 'leads_cerrados': return leads.filter((p) => llegoEnPeriodo(p, 'cerrado', desde, hasta)).length;
    case 'tasa_conversion': {
      const contactados = leads.filter((p) => llegoEnPeriodo(p, 'contactado', desde, hasta));
      return contactados.length ? Math.round((contactados.filter((p) => p.estado === 'cerrado').length / contactados.length) * 1000) / 10 : 0;
    }
    case 'leads_por_origen': return leads.filter((p) => p.origen === parametro && enRango(p.desde, desde, hasta)).length;
    case 'clientes_nuevos': return crm.clientes.filter((c) => enRango(c.desde, desde, hasta)).length;
    case 'clientes_activos': return crm.clientes.filter((c) => c.estado !== 'inactivo').length;
    case 'ingresos_cobrados': return (crm.pagos || []).filter((p) => enRango(p.fecha, desde, hasta)).reduce((t, p) => t + (Number(p.monto) || 0), 0);
    case 'ingreso_mensual_recurrente':
      return Math.round(crm.clientes.filter((c) => c.estado !== 'inactivo' && c.hosting?.activo).reduce((t, c) => {
        const m = Number(c.hosting.monto) || 0;
        return t + (c.hosting.frecuencia === 'anual' ? m / 12 : m);
      }, 0));
    case 'publicaciones_publicadas': return (contenido.publicaciones || []).filter((p) => p.estado === 'Publicado' && enRango(p.fecha, desde, hasta)).length;
    case 'seguidores_instagram': return Number(semanas[0]?.seguidoresIg) || 0;
    case 'seguidores_tiktok': return Number(semanas[0]?.seguidoresTiktok) || 0;
    case 'seguidores_total': return (Number(semanas[0]?.seguidoresIg) || 0) + (Number(semanas[0]?.seguidoresTiktok) || 0);
    case 'diagnosticos_redes': return sumaSemanas('diagnosticos');
    case 'mensajes_redes': return sumaSemanas('mensajes');
    case 'tareas_completadas': {
      const deArea = (t) => {
        if (!parametro) return true;
        const ini = os.iniciativas.find((i) => i.id === t.iniciativaId);
        const est = ini && os.estrategias.find((e) => e.id === ini.estrategiaId);
        return est?.area === parametro;
      };
      return os.tareas.filter((t) => t.estado === 'hecha' && enRango(t.completadaEl, desde, hasta) && deArea(t)).length;
    }
    default: return null;
  }
}

export function valorMetrica(m, ctx) {
  if (m.tipo === 'automatica') {
    const obj = ctx.os.objetivos.find((o) => o.id === m.objetivoId);
    const desde = m.desde || obj?.creado || '2000-01-01';
    const hasta = [hoy(), obj?.fechaLimite].filter(Boolean).sort()[0];
    return calcularFuente(m.fuente, m.parametro, ctx, desde, hasta);
  }
  const ultimo = [...(m.valores || [])].sort((a, b) => a.fecha.localeCompare(b.fecha)).pop();
  return ultimo ? ultimo.valor : (m.inicial ?? 0);
}

export function avanceMetrica(m, valor) {
  const inicial = Number(m.inicial) || 0;
  const meta = Number(m.meta);
  if (!Number.isFinite(meta) || valor == null) return null;
  if (meta === inicial) return valor >= meta ? 1 : 0;
  return Math.max(0, Math.min(1, (valor - inicial) / (meta - inicial)));
}

// Avance del objetivo = el de su métrica principal (o el promedio de sus métricas si no tiene principal).
// "ritmo" compara el avance con el tiempo transcurrido hasta la fecha límite.
export function estadoObjetivo(o, ctx) {
  const mets = ctx.os.metricas.filter((m) => m.objetivoId === o.id).map((m) => {
    const valor = valorMetrica(m, ctx);
    return { ...m, valor, avance: avanceMetrica(m, valor) };
  });
  const principal = mets.find((m) => m.id === o.metricaPrincipalId);
  const conAvance = mets.filter((m) => m.avance != null);
  const avance = principal?.avance ?? (conAvance.length ? conAvance.reduce((t, m) => t + m.avance, 0) / conAvance.length : null);
  let ritmo = null;
  if (o.estado === 'logrado' || avance === 1) ritmo = 'logrado';
  else if (o.estado && o.estado !== 'activo') ritmo = o.estado;
  else if (esFecha(o.fechaLimite)) {
    if (hoy() > o.fechaLimite) ritmo = 'vencido';
    else if (avance != null) {
      const total = Date.parse(o.fechaLimite) - Date.parse(o.creado || hoy());
      const transcurrido = total > 0 ? (Date.parse(hoy()) - Date.parse(o.creado || hoy())) / total : 1;
      ritmo = avance + 0.1 >= transcurrido ? 'en camino' : 'en riesgo';
    }
  }
  return { avance: avance == null ? null : Math.round(avance * 100), ritmo, principal, metricas: mets };
}

export const textoMeta = (m) => (m ? `${m.valor ?? '?'} de ${m.meta} ${m.unidad || ''}`.trim() : null);
