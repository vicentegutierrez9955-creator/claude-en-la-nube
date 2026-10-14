// Herramientas del CRM: clientes, leads (prospectos), pagos y trabajos. Leen y escriben panel/datos.json,
// el mismo archivo del panel, con el mismo formato que usa el panel para que ambos se entiendan.
import { z } from 'zod';
import { leer, modificar } from './almacen.js';
import { ETAPAS, ORIGENES, fecha, texto, url, id, paginacion, fallar, unidad, unidadFiltro } from './comun.js';
import { ESTADOS_TRABAJO, marcarTermino } from './acciones.js';
import { hoy, paginar, slug, nuevoId, diferencias, recortar } from './util.js';

const resumenLead = (p) => ({
  id: p.id, negocio: p.negocio, unidad: p.unidad, rubro: p.rubro, comuna: p.comuna, etapa: p.estado || 'por contactar', origen: p.origen,
  contactarEl: p.contactarEl, ultimoContacto: (p.mensajes || []).at(-1)?.fecha || p.contactado?.fecha,
  web: p.webActual ? 'tiene' : p.tieneWeb === 'no' ? 'no tiene' : undefined,
  google: p.googleNota !== '' && p.googleNota != null ? `${p.googleNota} (${p.googleResenas || 0})` : undefined,
  clienteId: p.clienteId,
});

const resumenCliente = (c) => ({
  id: c.id, negocio: c.negocio, unidad: c.unidad, contacto: c.contacto, ciudad: c.ciudad, estado: c.estado || 'activo',
  productos: (c.productos || []).map((p) => p.nombre), web: c.web,
  hosting: c.hosting?.activo ? `${c.hosting.monto} ${c.hosting.frecuencia}, próximo cobro ${c.hosting.proximoCobro || '?'}` : undefined,
});

const camposLead = {
  negocio: texto(80).optional(), rubro: texto(60).optional(), comuna: texto(60).optional(), direccion: texto(120).optional(),
  contacto: texto(60).optional().describe('Nombre del dueño o la dueña'), whatsapp: texto(20).optional().describe('Con código de país, ej. 56912345678'),
  email: z.string().trim().max(120).email().optional(), telefono: texto(30).optional(), redes: texto(200).optional(),
  webActual: url.optional().describe('Página web actual, si tiene'), googleNota: z.number().min(1).max(5).optional(),
  googleResenas: z.number().int().min(0).optional(), origen: z.enum(ORIGENES).optional().describe('De dónde vino el lead'),
  unidad_negocio: unidad.optional(),
  publicacionId: id.optional().describe('Publicación que trajo el lead (id de listar_publicaciones)'),
  responsable: texto(40).optional(), contactarEl: fecha.optional().describe('Próxima fecha para contactarlo'),
  mensaje: texto(1000).optional().describe('Primer mensaje personalizado'),
};

function limpiarLead(a) {
  const out = {};
  for (const k of Object.keys(camposLead)) if (a[k] !== undefined) out[k === 'unidad_negocio' ? 'unidad' : k] = a[k];
  if (out.whatsapp) out.whatsapp = out.whatsapp.replace(/\D/g, '');
  if (out.email) out.email = out.email.toLowerCase();
  if (out.webActual) out.tieneWeb = 'si';
  return out;
}

// Filtro de unidad para leads y clientes: exacto, o "sin_unidad" para los que aún no tienen.
const deUnidad = (x, u) => !u || (u === 'sin_unidad' ? !x.unidad : x.unidad === u);

const agregarNota = (actual, nota, usuario) => [actual, `[${hoy()} · ${usuario}] ${nota}`].filter(Boolean).join('\n').slice(-3000);

export function registrarCrm(definir) {
  definir('listar_clientes', {
    titulo: 'Listar clientes',
    descripcion: 'Lista los clientes de Optimind con su estado, unidad de negocio, productos contratados y hosting. Devuelve {total, pagina, siguiente?, items[]}. Usa ver_cliente para el detalle.',
    entrada: z.object({ estado: z.enum(['activo', 'inactivo']).optional(), unidad_negocio: unidadFiltro.optional(), buscar: texto(60).optional().describe('Texto en nombre, contacto o ciudad'), ...paginacion }),
  }, async ({ estado, unidad_negocio: u, buscar, pagina, limite }) => {
    const { clientes } = await leer('crm');
    const q = buscar?.toLowerCase();
    const lista = clientes.filter((c) => (!estado || (c.estado || 'activo') === estado) && deUnidad(c, u)
      && (!q || [c.negocio, c.contacto, c.ciudad].some((v) => String(v || '').toLowerCase().includes(q))));
    return paginar(lista.map(resumenCliente), pagina, limite);
  });

  definir('ver_cliente', {
    titulo: 'Ver cliente',
    descripcion: 'Detalle de un cliente: datos, dominio, hosting, productos, accesos, notas, sus últimos 10 pagos y trabajos realizados.',
    entrada: z.object({ id }),
  }, async ({ id: cid }) => {
    const d = await leer('crm');
    const c = d.clientes.find((x) => x.id === cid) || fallar(`No existe el cliente "${cid}". Usa listar_clientes para ver los ids.`);
    return {
      ...c,
      pagos: d.pagos.filter((p) => p.clienteId === cid).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 10),
      trabajos: d.trabajos.filter((t) => t.clienteId === cid).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 10)
        .map((t) => ({ fecha: t.fecha, titulo: t.titulo, estado: t.estado })),
      leadOriginal: d.prospectos.find((p) => p.clienteId === cid)?.id,
    };
  });

  definir('actualizar_cliente', {
    titulo: 'Actualizar cliente',
    descripcion: 'Cambia datos de contacto, estado, unidad de negocio o responsable de un cliente, agrega una nota fechada o un producto contratado. No toca cobros ni dominio (eso se maneja en el panel). Devuelve los campos cambiados.',
    escritura: true,
    entrada: z.object({
      id, unidad_negocio: unidad.optional(),
      contacto: texto(60).optional(), whatsapp: texto(20).optional(), email: z.string().trim().max(120).email().optional(),
      ciudad: texto(60).optional(), web: url.optional(), responsable: texto(40).optional(), estado: z.enum(['activo', 'inactivo']).optional(),
      agregar_nota: texto(1000).optional().describe('Se agrega al final de las notas con fecha y autor'),
      agregar_producto: z.object({ nombre: texto(80).min(1), precio: z.number().min(0).optional(), fecha: fecha.optional(), nota: texto(300).optional() }).optional(),
    }),
  }, async ({ id: cid, agregar_nota, agregar_producto, unidad_negocio, ...campos }, { usuario, auditar }) => {
    const cambios = await modificar('crm', (d) => {
      const c = d.clientes.find((x) => x.id === cid) || fallar(`No existe el cliente "${cid}".`);
      const antes = structuredClone(c);
      if (unidad_negocio) c.unidad = unidad_negocio;
      for (const [k, v] of Object.entries(campos)) if (v !== undefined) c[k] = k === 'whatsapp' ? v.replace(/\D/g, '') : v;
      if (agregar_nota) c.notas = agregarNota(c.notas, agregar_nota, usuario);
      if (agregar_producto) c.productos = [...(c.productos || []), { nombre: agregar_producto.nombre, precio: agregar_producto.precio ?? null, fecha: agregar_producto.fecha || hoy(), nota: agregar_producto.nota || '' }];
      return diferencias(antes, c);
    }, usuario);
    await auditar({ entidad: 'cliente', id: cid, cambios });
    return { ok: true, id: cid, cambios: Object.keys(cambios) };
  });

  definir('listar_leads', {
    titulo: 'Listar leads',
    descripcion: `Lista leads (prospectos) con etapa, unidad de negocio, origen, próxima fecha de contacto y reseñas de Google. Etapas: ${ETAPAS.join(', ')}. Ordena por fecha para contactar (los atrasados primero). Devuelve {total, pagina, siguiente?, items[]}.`,
    entrada: z.object({
      etapa: z.enum(ETAPAS).optional(), unidad_negocio: unidadFiltro.optional(), origen: z.enum(ORIGENES).optional(), comuna: texto(60).optional(), rubro: texto(60).optional(),
      buscar: texto(60).optional().describe('Texto en negocio, contacto o notas'),
      contactar_hasta: fecha.optional().describe('Solo los que hay que contactar hasta esa fecha (incluye atrasados)'),
      ...paginacion,
    }),
  }, async ({ etapa, unidad_negocio: u, origen, comuna, rubro, buscar, contactar_hasta, pagina, limite }) => {
    const { prospectos } = await leer('crm');
    const q = buscar?.toLowerCase();
    const has = (v, s) => String(v || '').toLowerCase().includes(s.toLowerCase());
    const lista = prospectos.filter((p) => (!etapa || (p.estado || 'por contactar') === etapa) && (!origen || p.origen === origen) && deUnidad(p, u)
      && (!comuna || has(p.comuna, comuna)) && (!rubro || has(p.rubro, rubro))
      && (!q || [p.negocio, p.contacto, p.notas].some((v) => has(v, q)))
      && (!contactar_hasta || (p.contactarEl && p.contactarEl <= contactar_hasta)))
      .sort((a, b) => String(a.contactarEl || '9999').localeCompare(String(b.contactarEl || '9999')) || String(b.desde || '').localeCompare(String(a.desde || '')));
    return paginar(lista.map(resumenLead), pagina, limite);
  });

  definir('ver_lead', {
    titulo: 'Ver lead',
    descripcion: 'Detalle de un lead: datos de contacto, Google, web, notas, mensaje personalizado, lo que le creamos (maquetas), historial de contactos y de etapas, y la publicación que lo trajo.',
    entrada: z.object({ id }),
  }, async ({ id: lid }) => {
    const [d, cont] = await Promise.all([leer('crm'), leer('contenido')]);
    const p = d.prospectos.find((x) => x.id === lid) || fallar(`No existe el lead "${lid}". Usa listar_leads o buscar.`);
    const pub = p.publicacionId && cont.publicaciones.find((x) => x.id === p.publicacionId);
    return {
      ...p, etapa: p.estado || 'por contactar', estado: undefined, mensajes: (p.mensajes || []).slice(-10),
      publicacion: pub ? { id: pub.id, n: pub.n, titulo: pub.titulo } : undefined,
      trabajos: d.trabajos.filter((t) => t.prospectoId === lid).map((t) => ({ fecha: t.fecha, titulo: t.titulo })),
    };
  });

  definir('crear_lead', {
    titulo: 'Crear lead',
    descripcion: 'Agrega un lead nuevo en etapa "por contactar". Pide el origen (para medir qué canal trae ventas) y la unidad de negocio (web_agenda o erp_talleres). Si ya existe uno con el mismo WhatsApp o el mismo negocio y comuna, no lo duplica y devuelve el existente. Devuelve {id}.',
    escritura: true,
    entrada: z.object({ ...camposLead, negocio: texto(80).min(1), origen: z.enum(ORIGENES), unidad_negocio: unidad, notas: texto(3000).optional() }),
  }, async (a, { usuario, auditar }) => {
    const datos = limpiarLead(a);
    const r = await modificar('crm', (d) => {
      const clave = (p) => `${slug(p.negocio)}|${slug(p.comuna)}`;
      const igual = d.prospectos.find((p) => (datos.whatsapp && p.whatsapp === datos.whatsapp) || clave(p) === clave(datos));
      if (igual) return { repetido: true, id: igual.id };
      let lid = `p-${slug(datos.negocio)}${datos.comuna ? '-' + slug(datos.comuna) : ''}`.slice(0, 60);
      if (d.prospectos.some((p) => p.id === lid)) lid = `${lid.slice(0, 52)}-${nuevoId('x').slice(2)}`;
      d.prospectos.push({
        id: lid, ...datos, notas: a.notas || '', estado: 'por contactar', desde: hoy(), responsable: datos.responsable || usuario,
        creado: [], historialEtapas: [{ estado: 'por contactar', fecha: hoy(), por: usuario }],
      });
      return { id: lid };
    }, usuario);
    if (!r.repetido) await auditar({ entidad: 'lead', id: r.id, accion: 'crear', cambios: datos });
    return r.repetido ? { ok: true, id: r.id, aviso: 'Ya existía un lead igual; no se creó otro.' } : { ok: true, id: r.id };
  });

  definir('actualizar_lead', {
    titulo: 'Actualizar lead',
    descripcion: 'Cambia datos de un lead (contacto, origen, unidad de negocio, publicación que lo trajo, próxima fecha de contacto, etc.), agrega una nota fechada o un link de algo que le creamos (maqueta). Para cambiar la etapa usa actualizar_etapa_lead. Devuelve los campos cambiados.',
    escritura: true,
    entrada: z.object({
      id, ...camposLead,
      agregar_nota: texto(1000).optional(), agregar_link: z.object({ nombre: texto(60).min(1), url }).optional().describe('Algo que le creamos, ej. {nombre:"Maqueta", url}'),
    }),
  }, async ({ id: lid, agregar_nota, agregar_link, ...a }, { usuario, auditar }) => {
    const datos = limpiarLead(a);
    const cambios = await modificar('crm', (d) => {
      const p = d.prospectos.find((x) => x.id === lid) || fallar(`No existe el lead "${lid}".`);
      const antes = structuredClone(p);
      Object.assign(p, datos);
      if (agregar_nota) p.notas = agregarNota(p.notas, agregar_nota, usuario);
      if (agregar_link && !(p.creado || []).some((l) => l.url === agregar_link.url)) p.creado = [...(p.creado || []), agregar_link];
      return diferencias(antes, p);
    }, usuario);
    await auditar({ entidad: 'lead', id: lid, cambios });
    return { ok: true, id: lid, cambios: Object.keys(cambios) };
  });

  definir('actualizar_etapa_lead', {
    titulo: 'Cambiar etapa de un lead',
    descripcion: `Mueve un lead a otra etapa del embudo (${ETAPAS.join(' → ')}) y lo deja en su historial con fecha, para medir conversión. Para convertirlo en cliente usa convertir_lead_en_cliente.`,
    escritura: true,
    entrada: z.object({ id, etapa: z.enum(ETAPAS), nota: texto(1000).optional().describe('Motivo o contexto, se agrega a las notas') }),
  }, async ({ id: lid, etapa, nota }, { usuario, auditar }) => {
    const antes = await modificar('crm', (d) => {
      const p = d.prospectos.find((x) => x.id === lid) || fallar(`No existe el lead "${lid}".`);
      const previa = p.estado || 'por contactar';
      if (previa !== etapa) {
        p.estado = etapa;
        p.historialEtapas = [...(p.historialEtapas || []), { estado: etapa, fecha: hoy(), por: usuario }];
      }
      if (nota) p.notas = agregarNota(p.notas, nota, usuario);
      return previa;
    }, usuario);
    await auditar({ entidad: 'lead', id: lid, cambios: { etapa: [antes, etapa] } });
    return { ok: true, id: lid, etapa, antes };
  });

  definir('registrar_contacto_lead', {
    titulo: 'Registrar contacto con un lead',
    descripcion: 'Anota que se le escribió o llamó a un lead (vía y mensaje o código usado, ej. A1, B2, S1) y opcionalmente la próxima fecha de contacto. Si estaba "por contactar", pasa a "contactado". Es el mismo registro que deja el botón Contactar del panel.',
    escritura: true,
    entrada: z.object({
      id, via: z.enum(['WhatsApp', 'Correo', 'Llamada', 'Instagram', 'TikTok', 'Presencial', 'Otro']),
      mensaje: texto(300).min(1).describe('Código del mensaje (A1, B2, S1…) o resumen corto'),
      fecha: fecha.optional(), proximo_contacto: fecha.optional(),
    }),
  }, async ({ id: lid, via, mensaje, fecha: f, proximo_contacto }, { usuario, auditar }) => {
    const r = await modificar('crm', (d) => {
      const p = d.prospectos.find((x) => x.id === lid) || fallar(`No existe el lead "${lid}".`);
      const marca = { fecha: f || hoy(), por: usuario, via, mensaje };
      const etapaAntes = p.estado || 'por contactar';
      if (etapaAntes === 'por contactar') {
        p.estado = 'contactado';
        p.contactado = marca;
        p.historialEtapas = [...(p.historialEtapas || []), { estado: 'contactado', fecha: marca.fecha, por: usuario }];
      }
      if (/^S\d/i.test(mensaje)) p.seguimiento = marca;
      p.mensajes = [...(p.mensajes || []), marca].slice(-20);
      if (proximo_contacto) p.contactarEl = proximo_contacto;
      return { etapa: p.estado, etapaAntes };
    }, usuario);
    await auditar({ entidad: 'lead', id: lid, accion: 'contacto', cambios: { via, mensaje, ...(r.etapa !== r.etapaAntes ? { etapa: [r.etapaAntes, r.etapa] } : {}) } });
    return { ok: true, id: lid, etapa: r.etapa };
  });

  definir('convertir_lead_en_cliente', {
    titulo: 'Convertir lead en cliente',
    descripcion: 'Cierra un lead (etapa "cerrado") y crea el cliente con sus datos y su misma unidad de negocio, igual que "Pasar a cliente" del panel. Opcionalmente agrega productos contratados y el hosting. Devuelve {clienteId}.',
    escritura: true,
    entrada: z.object({
      leadId: id,
      productos: z.array(z.object({ nombre: texto(80).min(1), precio: z.number().min(0).optional() })).max(10).optional(),
      hosting: z.object({ monto: z.number().min(0), frecuencia: z.enum(['mensual', 'anual']), proximoCobro: fecha }).optional(),
    }),
  }, async ({ leadId, productos = [], hosting }, { usuario, auditar }) => {
    const r = await modificar('crm', (d) => {
      const p = d.prospectos.find((x) => x.id === leadId) || fallar(`No existe el lead "${leadId}".`);
      if (p.clienteId) fallar(`Ese lead ya es el cliente "${p.clienteId}".`);
      let cid = slug(p.negocio) || nuevoId('cliente');
      if (d.clientes.some((c) => c.id === cid)) cid = `${cid}-${nuevoId('x').slice(2)}`;
      const web = (p.creado || []).map((l) => l.url).find((u) => /^https:\/\//.test(u)) || p.webActual || '';
      d.clientes.push({
        id: cid, negocio: p.negocio, ...(p.unidad ? { unidad: p.unidad } : {}), contacto: p.contacto || '', whatsapp: p.whatsapp || '', email: p.email || '', ciudad: p.comuna || '', web,
        estado: 'activo', responsable: p.responsable || usuario, desde: hoy(),
        dominio: { registrador: 'NIC Chile', dns: 'Cloudflare' },
        hosting: hosting ? { proveedor: 'Vercel', ...hosting, dia: Number(hosting.proximoCobro.slice(8)), activo: true } : { proveedor: 'Vercel', frecuencia: 'mensual', activo: false },
        productos: productos.map((x) => ({ nombre: x.nombre, precio: x.precio ?? null, fecha: hoy(), nota: '' })),
        accesos: (p.creado || []).filter((l) => /^https:\/\//.test(l.url)),
        notas: [p.notas, `Viene de prospectos (${p.rubro || ''}${p.origen ? ', origen ' + p.origen : ''}).`].filter(Boolean).join('\n'),
      });
      if ((p.estado || '') !== 'cerrado') p.historialEtapas = [...(p.historialEtapas || []), { estado: 'cerrado', fecha: hoy(), por: usuario }];
      p.estado = 'cerrado';
      p.clienteId = cid;
      return { clienteId: cid };
    }, usuario);
    await auditar({ entidad: 'cliente', id: r.clienteId, accion: 'crear desde lead', cambios: { leadId, productos: productos.map((x) => x.nombre) } });
    return { ok: true, ...r };
  });

  definir('listar_pagos', {
    titulo: 'Listar pagos',
    descripcion: 'Pagos recibidos (más recientes primero), con filtros por cliente y rango de fechas. Devuelve también la suma total del filtro en CLP.',
    entrada: z.object({ clienteId: id.optional(), desde: fecha.optional(), hasta: fecha.optional(), ...paginacion }),
  }, async ({ clienteId, desde, hasta, pagina, limite }) => {
    const d = await leer('crm');
    const nombre = Object.fromEntries(d.clientes.map((c) => [c.id, c.negocio]));
    const lista = d.pagos.filter((p) => (!clienteId || p.clienteId === clienteId) && (!desde || p.fecha >= desde) && (!hasta || p.fecha <= hasta))
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    return { suma: lista.reduce((t, p) => t + (Number(p.monto) || 0), 0), ...paginar(lista.map((p) => ({ fecha: p.fecha, cliente: nombre[p.clienteId] || p.clienteId, concepto: p.concepto, monto: p.monto, periodo: p.periodo, nota: p.nota })), pagina, limite) };
  });

  definir('registrar_pago', {
    titulo: 'Registrar pago',
    descripcion: 'Anota un pago recibido de un cliente. Ojo: no mueve la fecha del próximo cobro de hosting (eso se hace con el botón "Registrar pago" del panel). Devuelve {id}.',
    escritura: true,
    entrada: z.object({ clienteId: id, concepto: texto(80).min(1), monto: z.number().min(0), fecha: fecha.optional(), periodo: fecha.optional(), nota: texto(300).optional() }),
  }, async ({ clienteId, concepto, monto, fecha: f, periodo, nota }, { usuario, auditar }) => {
    const pid = nuevoId('pago');
    await modificar('crm', (d) => {
      if (!d.clientes.some((c) => c.id === clienteId)) fallar(`No existe el cliente "${clienteId}".`);
      d.pagos.push({ id: pid, clienteId, concepto, periodo: periodo || '', monto, fecha: f || hoy(), nota: nota || '', por: usuario });
    }, usuario);
    await auditar({ entidad: 'pago', id: pid, accion: 'crear', cambios: { clienteId, concepto, monto } });
    return { ok: true, id: pid };
  });

  definir('listar_trabajos', {
    titulo: 'Listar trabajos',
    descripcion: 'Trabajos (maquetas, páginas, cambios para clientes), más recientes primero, con sus links. Filtra por cliente, lead o estado (pendiente / en curso / hecho).',
    entrada: z.object({ clienteId: id.optional(), leadId: id.optional(), estado: z.enum(ESTADOS_TRABAJO).optional(), ...paginacion }),
  }, async ({ clienteId, leadId, estado, pagina, limite }) => {
    const d = await leer('crm');
    const lista = d.trabajos.filter((t) => (!clienteId || t.clienteId === clienteId) && (!leadId || t.prospectoId === leadId) && (!estado || t.estado === estado))
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    return paginar(lista.map((t) => ({ id: t.id, fecha: t.fecha, titulo: t.titulo, estado: t.estado, terminadoEl: t.terminadoEl, clienteId: t.clienteId, leadId: t.prospectoId, detalle: recortar(t.detalle, 160), links: t.links })), pagina, limite);
  });

  definir('registrar_trabajo', {
    titulo: 'Registrar trabajo',
    descripcion: 'Anota un trabajo hecho o en curso (maqueta, página, cambio) en la pestaña Trabajos del panel, ligado a un cliente o lead. Devuelve {id}.',
    escritura: true,
    entrada: z.object({
      titulo: texto(160).min(1), fecha: fecha.optional(), clienteId: id.optional(), leadId: id.optional(), detalle: texto(2000).optional(),
      estado: z.enum(ESTADOS_TRABAJO).default('hecho'), links: z.array(z.object({ nombre: texto(60), url })).max(10).optional(),
    }),
  }, async ({ titulo, fecha: f, clienteId, leadId, detalle, estado, links = [] }, { usuario, auditar }) => {
    const tid = nuevoId('t');
    await modificar('crm', (d) => {
      if (clienteId && !d.clientes.some((c) => c.id === clienteId)) fallar(`No existe el cliente "${clienteId}".`);
      if (leadId && !d.prospectos.some((p) => p.id === leadId)) fallar(`No existe el lead "${leadId}".`);
      const t = { id: tid, clienteId: clienteId || null, prospectoId: leadId || null, cliente: '', fecha: f || hoy(), titulo, detalle: detalle || '', estado, links, por: usuario };
      marcarTermino(t, 'hecho', 'terminadoEl');
      d.trabajos.push(t);
    }, usuario);
    await auditar({ entidad: 'trabajo', id: tid, accion: 'crear', cambios: { titulo, clienteId, leadId } });
    return { ok: true, id: tid };
  });

  definir('actualizar_trabajo', {
    titulo: 'Actualizar trabajo',
    descripcion: 'Cambia un trabajo de la pestaña Trabajos: estado (pendiente / en curso / hecho; "hecho" guarda la fecha de término), título, detalle, fecha o links. "links" reemplaza la lista completa (incluye los que ya tenía, ver listar_trabajos); "agregar_link" suma uno sin tocar los demás. Devuelve los campos cambiados.',
    escritura: true,
    entrada: z.object({
      id, estado: z.enum(ESTADOS_TRABAJO).optional(), titulo: texto(160).min(1).optional(), detalle: texto(2000).optional(), fecha: fecha.optional(),
      links: z.array(z.object({ nombre: texto(60), url })).max(10).optional(), agregar_link: z.object({ nombre: texto(60).min(1), url }).optional(),
    }),
  }, async ({ id: tid, links, agregar_link, ...campos }, { usuario, auditar }) => {
    const cambios = await modificar('crm', (d) => {
      const t = d.trabajos.find((x) => x.id === tid) || fallar(`No existe el trabajo "${tid}". Usa listar_trabajos para ver los ids.`);
      const antes = structuredClone(t);
      for (const [k, v] of Object.entries(campos)) if (v !== undefined) t[k] = v;
      if (links) t.links = links;
      if (agregar_link && !(t.links || []).some((l) => l.url === agregar_link.url)) t.links = [...(t.links || []), agregar_link].slice(-10);
      if (campos.estado) marcarTermino(t, 'hecho', 'terminadoEl');
      return diferencias(antes, t);
    }, usuario);
    await auditar({ entidad: 'trabajo', id: tid, cambios });
    return { ok: true, id: tid, cambios: Object.keys(cambios) };
  });
}
