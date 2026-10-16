// Prueba del formulario público de las herramientas gratuitas, en memoria. Uso: npm run test:contacto
import { leerDatos } from '../api/_lib/panel.js';
const { default: api, celular } = await import('../api/publico/contacto.js');
const O = 'https://sitio.test';
const ok = (c, m) => { console.log(c ? 'OK  ' : 'FALLA', m); if (!c) process.exitCode = 1; };
const enviar = (body, { origin = O, method = 'POST' } = {}) => api.fetch(new Request(O + '/api/publico/contacto', {
  method, headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
}));
const base = { herramienta: 'boleta-honorarios', nombre: 'Ana Pérez', whatsapp: '9 8765 4321', rubro: 'Podología', comuna: 'Maipú' };
const prospectos = async () => (await leerDatos()).data?.prospectos || [];

ok(celular('+56 9 8765 4321') === '56987654321' && celular('987654321') === '56987654321' && celular('22345678') === '', 'normaliza celulares chilenos');
ok((await enviar(base, { method: 'GET' })).status === 405, 'solo POST');
ok((await enviar(base, { origin: null })).status === 403, 'rechaza sin origen');
ok((await enviar(base, { origin: 'https://otro.com' })).status === 403, 'rechaza otro sitio');
ok((await enviar({ ...base, whatsapp: '1234' })).status === 400, 'rechaza WhatsApp inválido');
ok((await enviar({ ...base, herramienta: 'otra' })).status === 400, 'rechaza herramienta desconocida');
let r = await enviar({ ...base, web: 'http://spam' });
ok(r.status === 200 && (await prospectos()).length === 0, 'trampa para bots: responde ok y no guarda');
r = await enviar({ ...base, nombre: '<b>Ana</b> Pérez' });
let p = (await prospectos()).find((x) => x.id === 'web-56987654321');
ok(r.status === 200 && p && p.origen === 'web' && p.unidad === 'web_agenda' && p.estado === 'por contactar' && p.contactarEl === p.desde && p.rubro === 'Podología' && p.notas.includes('Calculadora'), 'crea el prospecto para contactar hoy');
ok(p.negocio === '<b>Ana</b> Pérez', 'guarda el texto tal cual (el panel lo muestra como texto)');
r = await enviar({ ...base, whatsapp: '+56987654321', negocio: 'Otro nombre' });
p = (await prospectos()).filter((x) => x.whatsapp === '56987654321');
ok(r.status === 200 && p.length === 1, 'no duplica si vuelve a dejar sus datos');
r = await enviar({ ...base, rubro: 'Inventado', whatsapp: '911111111' });
ok((await prospectos()).find((x) => x.id === 'web-56911111111').rubro === '', 'ignora rubros fuera de la lista');
r = await enviar({ herramienta: 'presupuesto-taller', nombre: 'Pedro', whatsapp: '922222222', negocio: 'Taller Don Pedro' });
p = (await prospectos()).find((x) => x.id === 'web-56922222222');
ok(r.status === 200 && p.unidad === 'erp_talleres' && p.rubro === 'Taller mecánico' && p.negocio === 'Taller Don Pedro' && p.notas.includes('Tuerkit'), 'presupuestos: crea el prospecto del taller en erp_talleres');
r = await enviar({ herramienta: 'sitio-tuerkit', nombre: 'Rosa', whatsapp: '933333333', negocio: 'Taller Rosa', mensaje: 'Tengo 3 mecánicos' });
p = (await prospectos()).find((x) => x.id === 'web-56933333333');
ok(r.status === 200 && p.unidad === 'erp_talleres' && p.notas.includes('stpyme.cl') && p.notas.includes('demo de Tuerkit') && p.notas.includes('Tengo 3 mecánicos'), 'web de la empresa: guarda lo que pidió y el mensaje');
for (let i = 0; i < 40; i++) r = await enviar({ ...base, whatsapp: '95' + String(i).padStart(7, '0') });
ok(r.status === 429 && (await prospectos()).filter((x) => x.origen === 'web').length === 30, 'tope de 30 prospectos nuevos por día');
