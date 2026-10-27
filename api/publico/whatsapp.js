// Página pública /conectar-whatsapp: un negocio conecta su WhatsApp a STPyme con el link de invitación
// que le mandamos desde el panel (un solo uso, vence a los 14 días). Sin invitación vigente no se hace nada.
// GET  ?i=<invitación>                              → nombre del negocio (para saludarlo en la página).
// POST { i, code, waba, telefono, tipo } (mismo sitio) → termina el registro insertado y marca la invitación como usada.
import { json, enviarCorreo, escapar } from '../_lib/panel.js';
import { conectarCuenta, invitacionVigente, marcarInvitacionUsada } from '../_lib/whatsapp.js';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET') {
      const inv = await invitacionVigente(url.searchParams.get('i'));
      return inv ? json({ ok: true, negocio: inv.negocio }) : json({ error: 'El link no es válido o ya se usó' }, 404);
    }
    if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
    const origen = request.headers.get('origin');
    if (!origen || origen !== url.origin) return json({ error: 'No autorizado' }, 403);
    const crudo = await request.text();
    if (crudo.length > 4000) return json({ error: 'Demasiados datos' }, 413);
    let b;
    try { b = JSON.parse(crudo); } catch { return json({ error: 'Datos inválidos' }, 400); }

    const inv = await invitacionVigente(b.i);
    if (!inv) return json({ error: 'El link no es válido o ya se usó. Pídenos uno nuevo.' }, 404);
    const { status, ...r } = await conectarCuenta({ code: b.code, waba: b.waba, telefono: b.telefono, tipo: b.tipo, extra: { negocio: inv.negocio, invitacion: b.i, por: 'el negocio (link)' } });
    if (!r.ok) return json({ error: r.error }, status);
    await marcarInvitacionUsada(b.i, r.waba);
    await enviarCorreo({
      asunto: `WhatsApp conectado: ${inv.negocio}`,
      html: `<p><b>${escapar(inv.negocio)}</b> conectó su WhatsApp ${escapar(r.numero || '')} (${r.tipo === 'coexistencia' ? 'coexistencia' : 'número nuevo'}).</p><p>App suscrita: ${r.suscrita ? 'sí' : 'no'}.</p>`,
      texto: `${inv.negocio} conectó su WhatsApp ${r.numero || ''}.`,
    }).catch(() => {});
    // Al negocio solo se le confirma lo necesario.
    return json({ ok: true, numero: r.numero, nombre: r.nombre });
  },
};
