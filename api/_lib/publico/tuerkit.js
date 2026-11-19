// Enlace para Tuerkit: avisa por WhatsApp al cliente del taller cuando su auto cambia de estado.
// Lo llama el servidor de Tuerkit (nunca el navegador: la clave es secreta), con la clave del taller:
//   POST /api/publico/tuerkit   Authorization: Bearer tk_...
//   { "telefono": "+56 9 1234 5678", "cliente": "Juan", "vehiculo": "Toyota Yaris", "patente": "ABCD12",
//     "estado": "Listo para retirar", "link": "https://...", "idEvento": "orden-123-estado-4" }
//   → { ok: true, id, plantilla }   (link e idEvento son opcionales; con el mismo idEvento no se manda dos veces)
//   { "accion": "plantillas" } → estado de aprobación de las plantillas del taller en Meta.
// Guía para Tuerkit: docs/tuerkit-whatsapp.md
import { json } from '../panel.js';
import { enviar, numero } from '../whatsapp.js';
import { IDIOMA, cuentaDeClave, plantillas, variable, leerAvisos, anotarAviso, tapar, TOPE_DIARIO } from '../tuerkit.js';

const MAX_CUERPO = 10 * 1024;
const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });

// Celular chileno: 9 1234 5678 → 56912345678. Otros números deben venir con código de país.
function telefonoDe(v) {
  let t = numero(v);
  if (/^9\d{8}$/.test(t)) t = '56' + t;
  return t.length >= 10 && t.length <= 15 ? t : '';
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') return json({ error: 'Usa POST con la clave del taller (ver docs/tuerkit-whatsapp.md).' }, 405);
    const clave = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const cuenta = await cuentaDeClave(clave);
    if (!cuenta) return json({ error: 'Clave inválida. Créala en el panel de STPyme (WhatsApp → Tuerkit).' }, 401);
    if (!cuenta.phoneNumberId || !cuenta.token) return json({ error: 'El WhatsApp del taller no está conectado.' }, 409);

    const crudo = await request.text();
    if (crudo.length > MAX_CUERPO) return json({ error: 'Pedido muy grande' }, 413);
    let b;
    try { b = JSON.parse(crudo || '{}'); } catch { return json({ error: 'El cuerpo debe ser JSON' }, 400); }
    if (!b || typeof b !== 'object') return json({ error: 'El cuerpo debe ser JSON' }, 400);

    if (b.accion === 'plantillas') {
      const r = await plantillas(cuenta);
      return json(r, r.error ? 502 : 200);
    }
    if (b.accion && b.accion !== 'estado') return json({ error: 'Acción desconocida' }, 400);

    const tel = telefonoDe(b.telefono);
    const patente = variable(b.patente, 12).toUpperCase();
    const estado = variable(b.estado, 60);
    const link = variable(b.link, 300);
    const idEvento = variable(b.idEvento, 100);
    if (!tel) return json({ error: 'Revisa el teléfono del cliente (ej: +56 9 1234 5678).' }, 400);
    if (!patente || !estado) return json({ error: 'Faltan la patente o el estado.' }, 400);
    if (link && !/^https:\/\/\S+$/.test(link)) return json({ error: 'El link debe empezar con https://' }, 400);

    const { avisos } = await leerAvisos();
    const delTaller = avisos.filter((a) => a.waba === cuenta.waba);
    if (idEvento) {
      const previo = delTaller.find((a) => a.idEvento === idEvento && a.ok);
      if (previo) return json({ ok: true, repetido: true, id: previo.id, plantilla: previo.plantilla });
    }
    if (delTaller.filter((a) => a.dia === hoy() && a.ok).length >= TOPE_DIARIO) {
      return json({ error: `Este taller ya mandó ${TOPE_DIARIO} avisos hoy. Revisa que Tuerkit no los esté repitiendo.` }, 429);
    }

    const plantilla = link ? 'estado_vehiculo_link' : 'estado_vehiculo';
    const variables = [
      variable(b.cliente, 60) || 'cliente',
      variable(b.taller, 60) || variable(cuenta.negocio, 60) || variable(cuenta.nombre, 60) || 'tu taller',
      variable(b.vehiculo, 60) || 'vehículo',
      patente,
      estado,
      ...(link ? [link] : []),
    ];
    const r = await enviar(tel, { plantilla, idioma: IDIOMA, variables }, cuenta);
    await anotarAviso({
      fecha: new Date().toISOString(), dia: hoy(), waba: cuenta.waba, telefono: tapar(tel), patente, estado,
      plantilla, idEvento: idEvento || null, ok: r.ok, id: r.id || null, motivo: r.ok ? null : r.motivo,
    }).catch(() => {});
    if (!r.ok) {
      const sinPlantilla = /template|plantilla/i.test(r.motivo || '');
      return json({ error: sinPlantilla ? `La plantilla ${plantilla} aún no está aprobada por Meta. ${r.motivo}` : r.motivo }, 502);
    }
    return json({ ok: true, id: r.id, plantilla });
  },
};
