// Lógica de fechas y avisos del panel. Sin DOM: la usan la página y el cron de correos.

export function hoyChile(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(now);
}

function partes(fecha) {
  return fecha.split('-').map(Number);
}

export function diasEntre(desde, hasta) {
  const [y1, m1, d1] = partes(desde);
  const [y2, m2, d2] = partes(hasta);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

// Suma un mes o un año. `dia` mantiene el día original (31 → 28 de febrero → 31 de marzo).
export function sumarPeriodo(fecha, frecuencia, dia) {
  const [y, m, d] = partes(fecha);
  let mes = m - 1 + (frecuencia === 'anual' ? 12 : 1);
  const anio = y + Math.floor(mes / 12);
  mes %= 12;
  const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const nuevoDia = Math.min(dia || d, ultimo);
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(nuevoDia).padStart(2, '0')}`;
}

export function esFecha(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function avisos(data, hoy) {
  const lista = [];
  for (const c of data.clientes || []) {
    if (c.estado === 'inactivo') continue;
    const h = c.hosting;
    if (h && h.activo !== false && esFecha(h.proximoCobro)) {
      lista.push({ tipo: 'cobro', cliente: c, fecha: h.proximoCobro, dias: diasEntre(hoy, h.proximoCobro), monto: Number(h.monto) || 0 });
    }
    const d = c.dominio;
    if (d && esFecha(d.vence)) {
      lista.push({ tipo: 'dominio', cliente: c, fecha: d.vence, dias: diasEntre(hoy, d.vence) });
    }
  }
  return lista.sort((a, b) => a.dias - b.dias);
}

// atrasado (rojo), pronto (naranjo), mes (amarillo), ok
export function nivel(a) {
  if (a.dias < 0) return 'atrasado';
  const [pronto, mes] = a.tipo === 'dominio' ? [14, 60] : [7, 30];
  if (a.dias <= pronto) return 'pronto';
  if (a.dias <= mes) return 'mes';
  return 'ok';
}

// Días en que el correo diario avisa; los lunes llega además un resumen.
const MARCAS = {
  cobro: [7, 3, 1, 0, -1, -3, -7, -14, -30],
  dominio: [60, 30, 14, 7, 3, 1, 0, -1, -7],
};

export function debeAvisar(a, esLunes) {
  if (MARCAS[a.tipo].includes(a.dias)) return true;
  if (!esLunes) return false;
  return a.tipo === 'cobro' ? a.dias <= 14 : a.dias <= 60;
}

export function ingresoMensual(data) {
  let total = 0;
  for (const c of data.clientes || []) {
    const h = c.hosting;
    if (c.estado === 'inactivo' || !h || h.activo === false) continue;
    const monto = Number(h.monto) || 0;
    total += h.frecuencia === 'anual' ? monto / 12 : monto;
  }
  return Math.round(total);
}

export function pesos(n) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(n) || 0);
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function fechaLarga(fecha) {
  if (!esFecha(fecha)) return '';
  const [y, m, d] = partes(fecha);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

export function cuando(dias) {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  return dias > 0 ? `en ${dias} días` : `hace ${-dias} días`;
}

export function descripcion(a) {
  return a.tipo === 'cobro'
    ? `Hosting ${pesos(a.monto)}${a.cliente.hosting.frecuencia === 'anual' ? ' (anual)' : ''}`
    : `Dominio ${a.cliente.dominio.nombre || ''}`.trim();
}

export function mensajeCobro(cliente, transferencia) {
  const h = cliente.hosting || {};
  const nombre = (cliente.contacto || '').trim().split(/\s+/)[0];
  const web = (cliente.web || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const fecha = fechaLarga(h.proximoCobro);
  const vencido = esFecha(h.proximoCobro) && diasEntre(hoyChile(), h.proximoCobro) < 0;
  let msg = `Hola${nombre ? ' ' + nombre : ''}, ¿cómo estás? Te escribo por el hosting de tu página${web ? ' ' + web : ''}: `;
  msg += vencido ? `el pago venció el ${fecha}` : `el ${fecha} corresponde el pago`;
  msg += ` (${pesos(h.monto)}${h.frecuencia === 'anual' ? ' anual' : ' mensual'}).`;
  if (transferencia && transferencia.trim()) msg += `\n\nDatos para la transferencia:\n${transferencia.trim()}`;
  msg += '\n\n¡Muchas gracias!';
  return msg;
}
