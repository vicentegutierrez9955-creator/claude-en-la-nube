// Formulario público de las herramientas gratuitas (/herramientas/...) y de la web stpyme.cl: quien deja sus datos queda como
// prospecto "por contactar" en el panel, con origen "web" y de dónde llegó en las notas.
// Es lo único del sitio que escribe sin sesión, así que es estricto: solo POST del mismo sitio, campos
// cortos y validados, trampa para bots, tope diario y nunca pisa lo que ya escribió el equipo.
// Avisa por correo al equipo si están configurados RESEND_API_KEY y ALERT_EMAILS.
import { leerDatos, guardarDatos, datosIniciales, enviarCorreo, escapar, json } from '../panel.js';

// De dónde puede venir un formulario: cada herramienta gratuita y la web de la empresa (según lo que pidió).
const HERRAMIENTAS = {
  'boleta-honorarios': { nombre: 'Calculadora de boleta de honorarios', desde: 'la herramienta Calculadora de boleta de honorarios', unidad: 'web_agenda', pide: 'una maqueta gratis' },
  'presupuesto-taller': { nombre: 'Generador de presupuestos para talleres', desde: 'la herramienta Generador de presupuestos para talleres', unidad: 'erp_talleres', pide: 'conocer Tuerkit', rubro: 'Taller mecánico' },
  'sitio-web': { nombre: 'stpyme.cl', desde: 'la web stpyme.cl', unidad: 'web_agenda', pide: 'una maqueta gratis de su web con agenda' },
  'sitio-tuerkit': { nombre: 'stpyme.cl', desde: 'la web stpyme.cl', unidad: 'erp_talleres', pide: 'una demo de Tuerkit', rubro: 'Taller mecánico' },
  'sitio-bot': { nombre: 'stpyme.cl', desde: 'la web stpyme.cl (Bot de WhatsApp)', unidad: 'web_agenda', pide: 'la prueba gratis del bot de WhatsApp' },
  'sitio-otro': { nombre: 'stpyme.cl', desde: 'la web stpyme.cl', unidad: 'web_agenda', pide: 'que lo contacten (otra consulta)' },
};
const RUBROS = ['Podología', 'Kinesiología', 'Psicología', 'Nutrición', 'Fonoaudiología', 'Odontología', 'Estética', 'Barbería o peluquería', 'Veterinaria', 'Taller mecánico', 'Otro'];
const TOPE_DIARIO = 30;
const texto = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });

// Celular chileno: 9XXXXXXXX, 569XXXXXXXX o +56 9 XXXX XXXX. Devuelve 569XXXXXXXX o ''.
export function celular(v) {
  const d = String(v ?? '').replace(/\D/g, '');
  const n = d.length === 9 ? '56' + d : d;
  return /^569\d{8}$/.test(n) ? n : '';
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
    const origen = request.headers.get('origin');
    if (!origen || origen !== new URL(request.url).origin) return json({ error: 'No autorizado' }, 403);
    const crudo = await request.text();
    if (crudo.length > 2000) return json({ error: 'Demasiados datos' }, 413);
    let b;
    try { b = JSON.parse(crudo); } catch { return json({ error: 'Datos inválidos' }, 400); }
    // Trampa: los bots llenan el campo oculto "web"; se les responde como si todo saliera bien.
    if (texto(b?.web, 200)) return json({ ok: true });

    const herramienta = HERRAMIENTAS[b.herramienta];
    const nombre = texto(b.nombre, 60);
    const whatsapp = celular(b.whatsapp);
    if (!herramienta || !nombre || !whatsapp) return json({ error: 'Revisa tu nombre y tu WhatsApp (celular chileno).' }, 400);
    const rubro = RUBROS.includes(b.rubro) ? b.rubro : herramienta.rubro || '';
    const negocio = texto(b.negocio, 80) || nombre;
    const comuna = texto(b.comuna, 60);
    const mensaje = texto(b.mensaje, 500);
    const fecha = hoy();
    const nota = `Llegó solo por ${herramienta.desde} (${fecha}) y pidió ${herramienta.pide}.` + (mensaje ? ` Mensaje: "${mensaje}"` : '');
    const id = 'web-' + whatsapp;

    for (let intento = 0; intento < 3; intento++) {
      const { data, etag } = await leerDatos();
      const d = data || datosIniciales();
      d.prospectos = Array.isArray(d.prospectos) ? d.prospectos : [];
      const actual = d.prospectos.find((x) => x.id === id || (x.whatsapp && celular(x.whatsapp) === whatsapp));
      if (actual) {
        // Ya lo tenemos: solo se completan campos vacíos y se deja constancia de que volvió.
        let cambios = 0;
        for (const [k, v] of Object.entries({ contacto: nombre, rubro, comuna })) if (v && !actual[k]) { actual[k] = v; cambios++; }
        if (!String(actual.notas || '').includes(nota)) { actual.notas = texto([actual.notas, nota].filter(Boolean).join('\n'), 3000); cambios++; }
        if (!cambios) return json({ ok: true });
      } else {
        const nuevosHoy = d.prospectos.filter((x) => x.origen === 'web' && x.desde === fecha && String(x.id).startsWith('web-')).length;
        if (nuevosHoy >= TOPE_DIARIO) return json({ error: 'Hoy recibimos muchas solicitudes. Escríbenos mañana, por favor.' }, 429);
        d.prospectos.push({
          id, negocio, contacto: nombre, whatsapp, rubro, comuna, origen: 'web', unidad: herramienta.unidad,
          estado: 'por contactar', desde: fecha, contactarEl: fecha, notas: nota, creado: [],
        });
      }
      d.actualizado = new Date().toISOString();
      d.actualizadoPor = 'Formulario web';
      const r = await guardarDatos(d, etag);
      if (r.ok) {
        if (!actual) {
          const filas = [['Nombre', nombre], ['Negocio', negocio], ['Rubro', rubro], ['Comuna', comuna], ['WhatsApp', '+' + whatsapp], ['Mensaje', mensaje]].filter(([, v]) => v);
          await enviarCorreo({
            asunto: `Nuevo lead desde ${herramienta.nombre}: ${negocio}`,
            html: `<p>Llegó un lead nuevo desde ${escapar(herramienta.desde)}; pidió ${herramienta.pide}. Ya está en el panel, en Prospectos, para contactar hoy.</p><ul>${filas.map(([k, v]) => `<li><b>${k}:</b> ${escapar(v)}</li>`).join('')}</ul><p><a href="https://wa.me/${whatsapp}">Escribirle por WhatsApp</a></p>`,
            texto: `Lead nuevo desde ${herramienta.desde} (pidió ${herramienta.pide}):\n${filas.map(([k, v]) => `${k}: ${v}`).join('\n')}\nhttps://wa.me/${whatsapp}`,
          }).catch(() => {});
        }
        return json({ ok: true });
      }
    }
    return json({ error: 'No se pudo enviar, intenta de nuevo.' }, 409);
  },
};
