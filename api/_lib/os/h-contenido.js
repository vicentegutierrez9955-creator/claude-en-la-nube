// Herramientas de marca y contenido (panel/contenido.json): publicaciones, métricas semanales de redes,
// biblioteca de archivos, briefings del estratega y rutina de comunidad. Además, el reporte que cruza
// el contenido con los leads del CRM para ver qué termina en ventas.
import { z } from 'zod';
import { leer, modificar } from './almacen.js';
import { ESTADOS_PUB, ORIGENES, fecha, texto, url, id, paginacion, fallar } from './comun.js';
import { hoy, paginar, nuevoId, diferencias, recortar, lunesDe, sumarDias } from './util.js';

const resumenPub = (p) => ({ id: p.id, n: p.n, fecha: p.fecha, estado: p.estado, formato: p.formato, pilar: p.pilar, titulo: p.titulo, redes: p.redes });

const camposPub = {
  fecha: fecha.optional().describe('Fecha de publicación (planificada o real)'),
  estado: z.enum(ESTADOS_PUB).optional(),
  formato: texto(40).optional().describe('ej. Reel, Carrusel, Historia, TikTok, Post'),
  pilar: texto(60).optional().describe('Pilar de contenido'),
  titulo: texto(200).optional(), gancho: texto(500).optional().describe('Primera frase o idea que engancha'),
  contenido: texto(5000).optional(), guion: texto(10000).optional(), notas: texto(3000).optional(),
  redes: z.array(texto(30)).max(10).optional().describe('ej. ["instagram","tiktok"]'),
  archivos: z.array(z.union([texto(500), z.object({ nombre: texto(120), url: texto(500) })])).max(20).optional().describe('Links o {nombre,url}'),
};

const camposSemana = {
  seguidoresIg: z.number().int().min(0).optional(), seguidoresTiktok: z.number().int().min(0).optional(),
  guardados: z.number().int().min(0).optional(), compartidos: z.number().int().min(0).optional(), comentarios: z.number().int().min(0).optional(),
  mensajes: z.number().int().min(0).optional(), diagnosticos: z.number().int().min(0).optional().describe('Diagnósticos/consultas que llegaron por redes'),
  mejorPost: texto(200).optional(), mejorPostId: id.optional(), nota: texto(1000).optional(),
};

// Semana de la rutina: si no existe todavía, se arma desde la plantilla (sin guardarla).
const semanaRutina = (rutina, semana) => rutina.semanas.find((s) => s.semana === semana)
  || { semana, items: (rutina.plantilla || []).map((tarea) => ({ tarea, hecho: false })) };

export function registrarContenido(definir) {
  definir('listar_publicaciones', {
    titulo: 'Listar publicaciones',
    descripcion: `Calendario de contenido de la marca. Estados: ${ESTADOS_PUB.join(' → ')}. Filtra por estado, pilar, formato, rango de fechas o texto. Ordena por fecha. Devuelve {total, pagina, siguiente?, items[]}; usa ver_publicacion para el guion completo.`,
    entrada: z.object({ estado: z.enum(ESTADOS_PUB).optional(), pilar: texto(60).optional(), formato: texto(40).optional(), desde: fecha.optional(), hasta: fecha.optional(), buscar: texto(60).optional(), ...paginacion }),
  }, async ({ estado, pilar, formato, desde, hasta, buscar, pagina, limite }) => {
    const { publicaciones } = await leer('contenido');
    const has = (v, s) => String(v || '').toLowerCase().includes(s.toLowerCase());
    const lista = publicaciones.filter((p) => (!estado || p.estado === estado) && (!pilar || has(p.pilar, pilar)) && (!formato || has(p.formato, formato))
      && (!desde || (p.fecha && p.fecha >= desde)) && (!hasta || (p.fecha && p.fecha <= hasta))
      && (!buscar || [p.titulo, p.gancho, p.contenido].some((v) => has(v, buscar))))
      .sort((a, b) => String(a.fecha || '9999').localeCompare(String(b.fecha || '9999')) || a.n - b.n);
    return paginar(lista.map(resumenPub), pagina, limite);
  });

  definir('ver_publicacion', {
    titulo: 'Ver publicación',
    descripcion: 'Publicación completa (gancho, contenido, guion, notas, redes, archivos) y cuántos leads trajo. Busca por id o por número n.',
    entrada: z.object({ id: id.optional(), n: z.number().int().optional() }),
  }, async ({ id: pid, n }) => {
    const [c, crm] = await Promise.all([leer('contenido'), leer('crm')]);
    const p = c.publicaciones.find((x) => (pid && x.id === pid) || (n && x.n === n)) || fallar('No existe esa publicación. Usa listar_publicaciones.');
    const leads = crm.prospectos.filter((x) => x.publicacionId === p.id);
    return { ...p, leads: leads.length, leadsCerrados: leads.filter((x) => x.estado === 'cerrado').length };
  });

  definir('crear_publicacion', {
    titulo: 'Crear publicación',
    descripcion: 'Agrega una publicación al calendario (por defecto en estado Idea) con número correlativo n. Devuelve {id, n}.',
    escritura: true,
    entrada: z.object({ ...camposPub, titulo: texto(200).min(1) }),
  }, async (a, { usuario, auditar }) => {
    const pid = nuevoId('pub');
    const n = await modificar('contenido', (d) => {
      const sig = d.publicaciones.reduce((m, p) => Math.max(m, Number(p.n) || 0), 0) + 1;
      d.publicaciones.push({ id: pid, n: sig, estado: 'Idea', redes: [], archivos: [], ...a, creado: hoy(), por: usuario });
      return sig;
    }, usuario);
    await auditar({ entidad: 'publicacion', id: pid, accion: 'crear', cambios: { n, titulo: a.titulo, estado: a.estado || 'Idea' } });
    return { ok: true, id: pid, n };
  });

  definir('actualizar_publicacion', {
    titulo: 'Actualizar publicación',
    descripcion: 'Cambia cualquier campo de una publicación: estado (Idea/Guion/Grabado/Editado/Publicado), fecha, guion, gancho, contenido, notas, redes o archivos. Devuelve los campos cambiados.',
    escritura: true,
    entrada: z.object({ id, ...camposPub }),
  }, async ({ id: pid, ...c }, { usuario, auditar }) => {
    const cambios = await modificar('contenido', (d) => {
      const p = d.publicaciones.find((x) => x.id === pid) || fallar(`No existe la publicación "${pid}".`);
      const antes = structuredClone(p);
      for (const [k, v] of Object.entries(c)) if (v !== undefined) p[k] = v;
      if (c.estado === 'Publicado' && !p.fecha) p.fecha = hoy();
      return diferencias(antes, p);
    }, usuario);
    await auditar({ entidad: 'publicacion', id: pid, cambios });
    return { ok: true, id: pid, cambios: Object.keys(cambios) };
  });

  definir('ver_metricas_redes', {
    titulo: 'Ver métricas de redes',
    descripcion: 'Métricas semanales de Instagram y TikTok (seguidores, guardados, compartidos, comentarios, mensajes, diagnósticos, mejor post), de la más reciente a la más antigua, con la variación de seguidores contra la semana anterior.',
    entrada: z.object({ semanas: z.number().int().min(1).max(52).default(8) }),
  }, async ({ semanas }) => {
    const { metricasRedes } = await leer('contenido');
    const lista = [...metricasRedes].sort((a, b) => b.semana.localeCompare(a.semana));
    return {
      items: lista.slice(0, semanas).map((s, i) => {
        const prev = lista[i + 1];
        const delta = (k) => (prev && s[k] != null && prev[k] != null ? s[k] - prev[k] : undefined);
        return { ...s, deltaIg: delta('seguidoresIg'), deltaTiktok: delta('seguidoresTiktok') };
      }),
    };
  });

  definir('registrar_metricas_redes', {
    titulo: 'Registrar métricas de redes',
    descripcion: 'Guarda las métricas de una semana (se normaliza al lunes). Si la semana ya existe, solo cambia los campos que envíes.',
    escritura: true,
    entrada: z.object({ semana: fecha.describe('Cualquier día de la semana; se guarda como el lunes'), ...camposSemana }),
  }, async ({ semana, ...c }, { usuario, auditar }) => {
    const lunes = lunesDe(semana);
    const cambios = await modificar('contenido', (d) => {
      let s = d.metricasRedes.find((x) => x.semana === lunes);
      const antes = structuredClone(s || {});
      if (!s) { s = { semana: lunes }; d.metricasRedes.push(s); }
      for (const [k, v] of Object.entries(c)) if (v !== undefined) s[k] = v;
      s.por = usuario;
      return diferencias(antes, s);
    }, usuario);
    delete cambios.por;
    await auditar({ entidad: 'metricas_redes', id: lunes, cambios });
    return { ok: true, semana: lunes };
  });

  definir('listar_biblioteca', {
    titulo: 'Listar biblioteca',
    descripcion: 'Archivos de la biblioteca de marca (logos, plantillas, fotos, documentos) con nombre, tipo, categoría y url.',
    entrada: z.object({ categoria: texto(60).optional(), tipo: texto(40).optional(), buscar: texto(60).optional(), ...paginacion }),
  }, async ({ categoria, tipo, buscar, pagina, limite }) => {
    const { biblioteca } = await leer('contenido');
    const has = (v, s) => String(v || '').toLowerCase().includes(s.toLowerCase());
    return paginar(biblioteca.filter((a) => (!categoria || has(a.categoria, categoria)) && (!tipo || has(a.tipo, tipo)) && (!buscar || has(a.nombre, buscar))), pagina, limite);
  });

  definir('guardar_archivo_biblioteca', {
    titulo: 'Guardar archivo en biblioteca',
    descripcion: 'Agrega un archivo (link) a la biblioteca de marca, o lo actualiza si envías su id. Devuelve {id}.',
    escritura: true,
    entrada: z.object({ id: id.optional(), nombre: texto(160).min(1), tipo: texto(40).optional().describe('ej. logo, plantilla, foto, video, documento'), categoria: texto(60).optional(), url }),
  }, async ({ id: aid, ...a }, { usuario, auditar }) => {
    const r = await modificar('contenido', (d) => {
      if (aid) {
        const x = d.biblioteca.find((y) => y.id === aid) || fallar(`No existe el archivo "${aid}".`);
        const antes = structuredClone(x);
        Object.assign(x, a);
        return { id: aid, cambios: diferencias(antes, x) };
      }
      const nid = nuevoId('arc');
      d.biblioteca.push({ id: nid, ...a, creado: hoy(), por: usuario });
      return { id: nid, cambios: a };
    }, usuario);
    await auditar({ entidad: 'archivo', id: r.id, accion: aid ? 'actualizar' : 'crear', cambios: r.cambios });
    return { ok: true, id: r.id };
  });

  definir('ver_briefings', {
    titulo: 'Ver briefings',
    descripcion: 'Últimos briefings semanales del estratega (título, fecha y texto). Con completo=false el texto se recorta a 400 caracteres.',
    entrada: z.object({ limite: z.number().int().min(1).max(20).default(3), completo: z.boolean().default(false) }),
  }, async ({ limite, completo }) => {
    const { briefings } = await leer('contenido');
    return { items: [...briefings].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, limite).map((b) => ({ ...b, texto: completo ? b.texto : recortar(b.texto, 400) })) };
  });

  definir('crear_briefing', {
    titulo: 'Crear briefing',
    descripcion: 'Guarda el briefing semanal del estratega: qué funcionó, qué publicar, prioridades de la semana. Devuelve {id}.',
    escritura: true,
    entrada: z.object({ titulo: texto(200).min(1), texto: texto(10000).min(1), fecha: fecha.optional() }),
  }, async ({ titulo, texto: t, fecha: f }, { usuario, auditar }) => {
    const bid = nuevoId('bri');
    await modificar('contenido', (d) => { d.briefings.push({ id: bid, titulo, texto: t, fecha: f || hoy(), por: usuario }); }, usuario);
    await auditar({ entidad: 'briefing', id: bid, accion: 'crear', cambios: { titulo } });
    return { ok: true, id: bid };
  });

  definir('ver_rutina_comunidad', {
    titulo: 'Ver rutina de comunidad',
    descripcion: 'Checklist semanal de comunidad (responder comentarios, mensajes, interactuar con cuentas, etc.) de una semana, con lo hecho y lo pendiente, y la plantilla base.',
    entrada: z.object({ semana: fecha.optional().describe('Cualquier día de la semana; por defecto la actual') }),
  }, async ({ semana }) => {
    const { rutina } = await leer('contenido');
    const s = semanaRutina(rutina, lunesDe(semana || hoy()));
    return { ...s, hechas: s.items.filter((i) => i.hecho).length, total: s.items.length, plantilla: rutina.plantilla };
  });

  definir('actualizar_rutina_comunidad', {
    titulo: 'Actualizar rutina de comunidad',
    descripcion: 'Marca o desmarca tareas de la rutina de una semana, agrega tareas sueltas a esa semana, o reemplaza la plantilla base (la lista que se repite cada semana).',
    escritura: true,
    entrada: z.object({
      semana: fecha.optional(),
      marcar: z.array(z.object({ tarea: texto(200).min(1), hecho: z.boolean() })).max(30).optional().describe('Si la tarea no existe en la semana, se agrega'),
      plantilla: z.array(texto(200).min(1)).max(30).optional(),
    }),
  }, async ({ semana, marcar = [], plantilla }, { usuario, auditar }) => {
    const lunes = lunesDe(semana || hoy());
    const r = await modificar('contenido', (d) => {
      if (plantilla) d.rutina.plantilla = plantilla;
      if (marcar.length) {
        let s = d.rutina.semanas.find((x) => x.semana === lunes);
        if (!s) { s = semanaRutina(d.rutina, lunes); d.rutina.semanas.push(s); }
        for (const m of marcar) {
          const it = s.items.find((i) => i.tarea.toLowerCase() === m.tarea.toLowerCase());
          if (it) it.hecho = m.hecho; else s.items.push({ tarea: m.tarea, hecho: m.hecho });
        }
        d.rutina.semanas = d.rutina.semanas.filter((x) => x.semana >= sumarDias(hoy(), -365));
        return { hechas: s.items.filter((i) => i.hecho).length, total: s.items.length };
      }
      return {};
    }, usuario);
    await auditar({ entidad: 'rutina', id: lunes, cambios: { ...(plantilla ? { plantilla } : {}), ...(marcar.length ? { marcar } : {}) } });
    return { ok: true, semana: lunes, ...r };
  });

  definir('reporte_contenido_a_ventas', {
    titulo: 'Reporte contenido → ventas',
    descripcion: `Cruza el contenido con el CRM: por origen (${ORIGENES.join(', ')}) cuántos leads llegaron, se contactaron, se interesaron y se cerraron; y por publicación, cuántos leads y cierres trajo. Sirve para decidir qué contenido y qué canal repetir.`,
    entrada: z.object({ desde: fecha.optional(), hasta: fecha.optional() }),
  }, async ({ desde, hasta }) => {
    const [crm, c] = await Promise.all([leer('crm'), leer('contenido')]);
    const leads = crm.prospectos.filter((p) => (!desde || (p.desde && p.desde >= desde)) && (!hasta || (p.desde && p.desde <= hasta)));
    const etapa = (p) => p.estado || 'por contactar';
    const fila = (lista) => ({
      leads: lista.length, contactados: lista.filter((p) => etapa(p) !== 'por contactar').length,
      interesados: lista.filter((p) => ['interesado', 'cerrado'].includes(etapa(p))).length, cerrados: lista.filter((p) => etapa(p) === 'cerrado').length,
    });
    const porOrigen = {};
    for (const o of [...ORIGENES, 'sin_dato']) {
      const lista = leads.filter((p) => (p.origen || 'sin_dato') === o);
      if (lista.length) porOrigen[o] = fila(lista);
    }
    const porPublicacion = c.publicaciones.map((pub) => ({ n: pub.n, titulo: pub.titulo, ...fila(leads.filter((p) => p.publicacionId === pub.id)) }))
      .filter((x) => x.leads).sort((a, b) => b.cerrados - a.cerrados || b.leads - a.leads).slice(0, 20);
    return { periodo: { desde: desde || 'inicio', hasta: hasta || hoy() }, total: fila(leads), porOrigen, porPublicacion };
  });
}
