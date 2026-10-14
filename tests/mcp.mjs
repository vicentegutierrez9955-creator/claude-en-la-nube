// Prueba funcional del MCP por HTTP contra el servidor local (scripts/dev-os.mjs).
// Uso: BASE=http://localhost:8790 TOKEN=<token de acceso> node tests/mcp.mjs
const BASE = process.env.BASE || 'http://localhost:8790';
let n = 0;
async function llamar(name, args = {}) {
  const r = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.TOKEN}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name, arguments: args } }),
  });
  const t = await r.text();
  const linea = t.includes('data:') ? t.split('\n').find((l) => l.startsWith('data:')).slice(5) : t;
  const res = JSON.parse(linea);
  if (res.error) return { error: res.error.message };
  const texto = res.result.content[0].text;
  return res.result.isError ? { error: texto } : JSON.parse(texto);
}
const ok = (c, m, extra) => { console.log(c ? 'OK  ' : 'FALLA', m, c ? '' : JSON.stringify(extra)); if (!c) process.exitCode = 1; };

let r = await llamar('actualizar_vision', { texto: 'Ser el socio tecnológico de las pymes chilenas.' }); ok(r.ok, 'actualizar_vision', r);
r = await llamar('crear_objetivo', { titulo: 'Llegar a 5 clientes activos', fecha_limite: '2027-03-31', meta: 5, unidad: 'clientes', valor_inicial: 1, fuente: 'clientes_activos', area: 'ventas' });
ok(r.ok && r.id && r.metricaId, 'crear_objetivo automático', r); const obj = r.id;
r = await llamar('crear_objetivo', { titulo: '1.000 seguidores en Instagram', fecha_limite: '2027-01-31', meta: 1000, unidad: 'seguidores', fuente: 'seguidores_instagram', area: 'marca_contenido' }); const objMarca = r.id;
r = await llamar('crear_estrategia', { objetivoId: obj, area: 'ventas', titulo: 'Prospección en frío a emprendedores con ficha de Google' }); ok(r.ok, 'crear_estrategia', r); const est = r.id;
r = await llamar('crear_estrategia', { objetivoId: 'obj-noexiste', area: 'ventas', titulo: 'x' }); ok(r.error?.includes('No existe'), 'valida objetivo inexistente', r);
r = await llamar('crear_iniciativa', { estrategiaId: est, titulo: 'Contactar 30 negocios de Maipú', estado: 'en curso', fin: '2026-10-31' }); ok(r.ok, 'crear_iniciativa', r); const ini = r.id;
r = await llamar('crear_tarea', { iniciativaId: ini, titulo: 'Mandar mensaje A1 a 10 negocios', vence: '2026-10-01', prioridad: 'alta' }); ok(r.ok, 'crear_tarea', r); const tar = r.id;
r = await llamar('actualizar_tarea', { id: tar, estado: 'hecha' }); ok(r.cambios?.includes('estado') && r.cambios.includes('completadaEl'), 'actualizar_tarea hecha', r);
r = await llamar('crear_producto', { nombre: 'Página web pyme', tipo: 'servicio', estado: 'activo', precioTexto: 'desde $150.000', entregables: ['Página', 'Ficha de Google'] }); ok(r.ok, 'crear_producto', r);
r = await llamar('crear_publicacion', { titulo: '3 errores de las páginas de pymes', formato: 'Reel', pilar: 'Educación', estado: 'Guion', fecha: '2026-10-20', redes: ['instagram'] }); ok(r.ok && r.n === 1, 'crear_publicacion n=1', r); const pub = r.id;
r = await llamar('crear_lead', { negocio: 'Barbería Prueba', comuna: 'Maipú', whatsapp: '+56 9 1111 2222', origen: 'instagram', publicacionId: pub }); ok(r.ok && r.id, 'crear_lead', r); const lead = r.id;
r = await llamar('crear_lead', { negocio: 'Barbería Prueba', comuna: 'Maipú', origen: 'instagram' }); ok(r.aviso, 'crear_lead no duplica', r);
r = await llamar('crear_lead', { negocio: 'X', origen: 'facebook' }); ok(r.error, 'zod rechaza origen inválido', r);
r = await llamar('registrar_contacto_lead', { id: lead, via: 'WhatsApp', mensaje: 'A1', proximo_contacto: '2026-10-16' }); ok(r.etapa === 'contactado', 'registrar_contacto_lead → contactado', r);
r = await llamar('actualizar_etapa_lead', { id: lead, etapa: 'interesado', nota: 'Pidió ejemplo' }); ok(r.etapa === 'interesado' && r.antes === 'contactado', 'actualizar_etapa_lead', r);
r = await llamar('convertir_lead_en_cliente', { leadId: lead, productos: [{ nombre: 'Página web pyme', precio: 150000 }], hosting: { monto: 5000, frecuencia: 'mensual', proximoCobro: '2026-11-15' } }); ok(r.clienteId, 'convertir_lead_en_cliente', r); const cli = r.clienteId;
r = await llamar('registrar_pago', { clienteId: cli, concepto: 'Página web', monto: 150000 }); ok(r.ok, 'registrar_pago', r);
r = await llamar('registrar_trabajo', { titulo: 'Maqueta barbería', leadId: lead }); ok(r.ok, 'registrar_trabajo', r);
r = await llamar('registrar_metricas_redes', { semana: '2026-10-14', seguidoresIg: 320, seguidoresTiktok: 90, diagnosticos: 2 }); ok(r.semana === '2026-10-12', 'métricas normaliza al lunes', r);
r = await llamar('actualizar_rutina_comunidad', { plantilla: ['Responder comentarios', 'Responder mensajes', 'Comentar 10 cuentas'], marcar: [{ tarea: 'Responder comentarios', hecho: true }] }); ok(r.hechas === 1 && r.total === 3, 'rutina', r);
r = await llamar('crear_briefing', { titulo: 'Semana 42', texto: 'Priorizar reels educativos.' }); ok(r.ok, 'crear_briefing', r);
r = await llamar('guardar_archivo_biblioteca', { nombre: 'Logo', tipo: 'logo', url: 'https://ejemplo.cl/logo.png' }); ok(r.ok, 'biblioteca', r);
r = await llamar('guardar_archivo_biblioteca', { nombre: 'Logo', url: 'http://inseguro.cl' }); ok(r.error, 'rechaza url sin https', r);

r = await llamar('listar_objetivos', {}); const o1 = r.items.find((x) => x.id === obj);
ok(o1 && o1.avance === 25 && o1.meta === '2 de 5 clientes', 'avance automático (2 activos, inicial 1 → 25%)', r);
const o2 = r.items.find((x) => x.id === objMarca); ok(o2?.meta === '320 de 1000 seguidores', 'avance desde métricas de redes', o2);
r = await llamar('resumen_empresa', { enfoque: 'ventas' });
ok(r.ventas?.embudo?.cerrado === 1 && r.ventas.clientes.activos === 2 && !r.marca && r.objetivos.every((o) => o.id !== objMarca), 'resumen ventas', r);
r = await llamar('resumen_empresa', { enfoque: 'marca' }); ok(r.marca?.redes?.seguidoresIg === 320 && r.marca.leadsDesdeRedes.cerrados === 1 && !r.ventas, 'resumen marca', r);
r = await llamar('reporte_contenido_a_ventas', {}); ok(r.porOrigen?.instagram?.cerrados === 1 && r.porPublicacion?.[0]?.n === 1, 'reporte contenido → ventas', r);
r = await llamar('ver_lead', { id: lead }); ok(r.historialEtapas?.length === 4 && r.publicacion?.n === 1 && r.clienteId === cli, 'ver_lead con historial y publicación', r);
r = await llamar('listar_leads', { etapa: 'cerrado' }); ok(r.total === 1, 'listar_leads filtro', r);
r = await llamar('buscar', { texto: 'barbería' }); ok(r.items.some((x) => x.tipo === 'lead') && r.items.some((x) => x.tipo === 'cliente'), 'buscar', r);
r = await llamar('ver_estrategia', { enfoque: 'ventas' }); ok(r.objetivos?.[0]?.estrategias?.[0]?.iniciativas?.[0]?.tareas === '1/1 hechas', 'ver_estrategia', r);
r = await llamar('registrar_metrica', { metricaId: 'met-x', valor: 3 }); ok(r.error, 'registrar_metrica inexistente', r);
r = await llamar('ver_auditoria', { limite: 100 }); ok(r.items.length >= 20 && r.items.every((e) => e.usuario === 'prueba'), 'auditoría registra cada escritura con usuario', { n: r.items.length });
const txt = JSON.stringify(r); ok(!/secreto-local|scrypt|PANEL_SECRET/.test(txt), 'sin secretos en respuestas');
