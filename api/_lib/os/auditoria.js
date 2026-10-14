// Registro de auditoría: cada escritura hecha por el MCP queda en panel/auditoria/AAAA-MM-DD.json.
import { leerDoc, guardarDoc } from '../panel.js';
import { hoy, sumarDias } from './util.js';

const ruta = (dia) => `panel/auditoria/${dia}.json`;

export async function auditar(evento) {
  const e = { fecha: new Date().toISOString(), ...evento };
  const dia = hoy();
  for (let intento = 0; intento < 4; intento++) {
    const { data, etag } = await leerDoc(ruta(dia));
    const lista = Array.isArray(data) ? data : [];
    lista.push(e);
    if ((await guardarDoc(ruta(dia), lista, etag)).ok) return;
  }
  // Nunca se pierde en silencio: si no se pudo guardar, queda en los logs de Vercel.
  console.error('No se pudo guardar la auditoría', JSON.stringify(e));
}

export async function ultimosEventos({ dias = 7, limite = 30, herramienta } = {}) {
  const out = [];
  for (let i = 0; i < dias && out.length < limite; i++) {
    const { data } = await leerDoc(ruta(sumarDias(hoy(), -i)));
    const lista = (Array.isArray(data) ? data : []).filter((e) => !herramienta || e.herramienta === herramienta).reverse();
    out.push(...lista);
  }
  return out.slice(0, limite);
}
