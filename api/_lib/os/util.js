// Utilidades comunes de Optimind OS (fechas, ids, respuestas compactas).
import { randomBytes } from 'node:crypto';

export const hoy = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // hora de Chile (aprox.)
export const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const sumarDias = (fecha, n) => new Date(Date.parse(fecha + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const lunesDe = (fecha) => { const d = new Date(fecha + 'T12:00:00Z'); return sumarDias(fecha, -((d.getUTCDay() + 6) % 7)); };
export const nuevoId = (prefijo) => `${prefijo}-${randomBytes(4).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || Date.now().toString(36)}`;
export const slug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// Quita campos vacíos para que las respuestas gasten poco contexto.
export function compacto(o) {
  if (Array.isArray(o)) return o.map(compacto);
  if (!o || typeof o !== 'object') return o;
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === '' || v === null || v === undefined || (Array.isArray(v) && !v.length)) continue;
    r[k] = typeof v === 'object' ? compacto(v) : v;
  }
  return r;
}

export function paginar(lista, pagina = 1, limite = 20) {
  const inicio = (pagina - 1) * limite;
  return { total: lista.length, pagina, ...(inicio + limite < lista.length ? { siguiente: pagina + 1 } : {}), items: lista.slice(inicio, inicio + limite) };
}

export const recortar = (s, n) => (typeof s === 'string' && s.length > n ? s.slice(0, n) + '…' : s);

// Cambios campo por campo entre dos versiones (para la auditoría). Textos largos se recortan.
export function diferencias(antes = {}, despues = {}) {
  const r = {};
  for (const k of new Set([...Object.keys(antes || {}), ...Object.keys(despues || {})])) {
    const a = JSON.stringify(antes?.[k] ?? null);
    const b = JSON.stringify(despues?.[k] ?? null);
    if (a !== b) r[k] = [recortar(a, 200), recortar(b, 200)];
  }
  return r;
}

export class ErrorUsuario extends Error {}
