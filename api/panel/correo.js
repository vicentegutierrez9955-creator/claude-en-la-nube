// Correo de avisos: el cron de Vercel lo llama a diario; desde el panel se puede mandar uno de prueba.
import { sesion, leerDatos, datosIniciales, enviarCorreo, correosDestino, escapar, json } from '../_lib/panel.js';
import { avisos, nivel, debeAvisar, hoyChile, fechaLarga, cuando, descripcion, pesos } from '../../panel/alertas.js';

const COLORES = { atrasado: '#c62828', pronto: '#e65100', mes: '#b28704', ok: '#2e7d32' };
const ETIQUETAS = { atrasado: 'Atrasado', pronto: 'Pronto', mes: 'Este mes', ok: 'Al día' };

function armarCorreo(lista, hoy, url, prueba) {
  const cobros = lista.filter((a) => a.tipo === 'cobro' && nivel(a) !== 'ok');
  const total = cobros.reduce((s, a) => s + a.monto, 0);
  const atrasados = lista.filter((a) => a.dias < 0).length;
  let asunto = prueba ? 'Prueba: avisos del panel de clientes' : 'Panel de clientes: ';
  if (!prueba) {
    const partes = [];
    if (atrasados) partes.push(`${atrasados} atrasado${atrasados > 1 ? 's' : ''}`);
    if (cobros.length) partes.push(`${cobros.length} cobro${cobros.length > 1 ? 's' : ''} por ${pesos(total)}`);
    const dominios = lista.filter((a) => a.tipo === 'dominio' && nivel(a) !== 'ok').length;
    if (dominios) partes.push(`${dominios} dominio${dominios > 1 ? 's' : ''} por renovar`);
    asunto += partes.join(', ') || 'resumen semanal';
  }
  const filas = lista.map((a) => {
    const n = nivel(a);
    return `<tr><td style="padding:10px 8px;border-bottom:1px solid #eee"><span style="display:inline-block;padding:2px 8px;border-radius:99px;background:${COLORES[n]};color:#fff;font-size:12px">${ETIQUETAS[n]}</span></td>`
      + `<td style="padding:10px 8px;border-bottom:1px solid #eee"><b>${escapar(a.cliente.negocio)}</b><br><span style="color:#555">${escapar(descripcion(a))}</span></td>`
      + `<td style="padding:10px 8px;border-bottom:1px solid #eee;white-space:nowrap">${escapar(fechaLarga(a.fecha))}<br><span style="color:#555">${escapar(cuando(a.dias))}</span></td></tr>`;
  }).join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;color:#1b2430">`
    + `<h2 style="margin:0 0 4px">Avisos del panel de clientes</h2><p style="margin:0 0 16px;color:#555">${escapar(fechaLarga(hoy))}</p>`
    + (lista.length ? `<table style="width:100%;border-collapse:collapse;font-size:14px">${filas}</table>` : '<p>No hay cobros ni dominios pendientes. 🎉</p>')
    + (url ? `<p style="margin-top:20px"><a href="${escapar(url)}" style="background:#1f6feb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Abrir el panel</a></p>` : '')
    + '</div>';
  const texto = lista.map((a) => `- ${ETIQUETAS[nivel(a)]}: ${a.cliente.negocio}, ${descripcion(a)}, ${fechaLarga(a.fecha)} (${cuando(a.dias)})`).join('\n')
    + (url ? `\n\nPanel: ${url}` : '');
  return { asunto, html, texto: texto || 'No hay pendientes.' };
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const panelUrl = process.env.PANEL_URL || `${url.origin}/panel`;
    const esCron = Boolean(process.env.CRON_SECRET)
      && request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
    const s = sesion(request);
    if (!esCron && !s) return json({ error: 'No autorizado' }, 401);
    if (!esCron && request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

    const hoy = hoyChile();
    const { data } = await leerDatos();
    const todos = avisos(data || datosIniciales(), hoy);

    if (!esCron) {
      const lista = todos.filter((a) => nivel(a) !== 'ok');
      const r = await enviarCorreo(armarCorreo(lista.length ? lista : todos.slice(0, 5), hoy, panelUrl, true));
      return json({ ...r, destinos: correosDestino() }, r.ok ? 200 : 502);
    }

    const esLunes = new Date(`${hoy}T12:00:00Z`).getUTCDay() === 1;
    if (!todos.some((a) => debeAvisar(a, esLunes))) return json({ ok: true, enviado: false, motivo: 'Nada que avisar hoy' });
    const lista = todos.filter((a) => nivel(a) !== 'ok');
    const r = await enviarCorreo(armarCorreo(lista, hoy, panelUrl, false));
    return json({ ...r, enviado: r.ok }, r.ok ? 200 : 502);
  },
};
