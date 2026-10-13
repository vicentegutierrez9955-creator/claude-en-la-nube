// Contactar: acceso rápido para mandar por WhatsApp uno de los mensajes que estamos probando.
// Se elige el mensaje (A1, B2…), después el prospecto o cliente, se revisa el texto y se abre WhatsApp.
// Los textos son los del documento "Mensajes de WhatsApp para pymes (pruebas)": A = ya tienen página,
// B = no tienen, S = seguimiento, C = respuestas cuando contestan.
const MENSAJES = [
  { codigo: 'A1', grupo: 'A', nombre: 'Directo', texto: 'Hola, ¿hablo con [nombre]? Soy [tu nombre], de Optimind Partners. Vi la página de [negocio] y noté que [detalle]. Le ofrecemos una maqueta gratis para que vea cómo podría quedar renovada. ¿Se la envío? Es sin compromiso.' },
  { codigo: 'A2', grupo: 'A', nombre: 'Elogio y mejora', texto: 'Hola [nombre], ¿cómo está? Soy [tu nombre]. Vi las reseñas de [negocio] en Google y se nota que sus clientes los recomiendan. En su página vi que [detalle], y ahí se pueden perder consultas. Le puedo preparar una maqueta gratis con esa mejora. ¿Le interesa verla?' },
  { codigo: 'A3', grupo: 'A', nombre: 'Pregunta rápida', texto: 'Hola [nombre], soy [tu nombre]. Una pregunta rápida: ¿le llegan clientes desde la página de [negocio]? Lo pregunto porque en el celular [detalle]. Hacemos páginas para pymes y le puedo mostrar una maqueta gratis de cómo quedaría. ¿Se la mando?' },
  { codigo: 'A4', grupo: 'A', nombre: 'Comparación con la zona', texto: 'Hola [nombre], soy [tu nombre], de Optimind Partners. Buscando [rubro] en [comuna], encontré [negocio]; tiene muy buenas reseñas, pero su página [detalle] al lado de otras de la zona. Podemos prepararle una maqueta gratis de cómo quedaría. ¿Quiere verla?' },
  { codigo: 'B1', grupo: 'B', nombre: 'Directo', texto: 'Hola, ¿hablo con [nombre]? Soy [tu nombre], de Optimind Partners. Vi [negocio] en Google y noté que todavía no tiene página web. Le ofrecemos una maqueta gratis para que vea cómo quedaría la suya, con sus servicios y un botón de WhatsApp. ¿Se la envío? Es sin compromiso.' },
  { codigo: 'B2', grupo: 'B', nombre: 'Sus reseñas', texto: 'Hola [nombre], ¿cómo está? Soy [tu nombre]. [negocio] tiene [nota] estrellas en Google, muy buenas reseñas. Pero quien lo busca no encuentra una página con sus servicios y precios. Le puedo armar una maqueta gratis para que vea cómo quedaría. ¿Le interesa?' },
  { codigo: 'B3', grupo: 'B', nombre: 'Clientes que se van', texto: 'Hola [nombre], soy [tu nombre]. Hoy mucha gente busca [rubro] en [comuna] desde el celular y le escribe al primero que tiene página con WhatsApp. [negocio] todavía no tiene una. Le hacemos una maqueta gratis para que vea cómo quedaría. ¿Se la mando?' },
  { codigo: 'B4', grupo: 'B', nombre: 'Ejemplo de su rubro', texto: 'Hola [nombre], soy [tu nombre], de Optimind Partners. Hacemos páginas para [rubro]; hace poco hicimos la de [ejemplo]. Me gustaría prepararle una maqueta gratis a [negocio] para que vea cómo quedaría. ¿Le interesa?' },
  { codigo: 'S1', grupo: 'S', nombre: 'Día 3', texto: 'Hola [nombre], le escribí hace unos días por la maqueta gratis para [negocio]. ¿Se la envío o prefiere que lo dejemos para otro momento?' },
  { codigo: 'S2', grupo: 'S', nombre: 'Día 7 (el último)', texto: 'Hola [nombre], último mensaje, prometido. Si algún día quiere ver cómo quedaría la página de [negocio], me escribe y se la preparo. ¡Que le vaya muy bien!' },
  { codigo: 'C1', grupo: 'C', nombre: 'Dijo "sí, mándela"', texto: '¡Buenísimo! Se la preparo y se la mando [hoy o mañana]. ¿Hay algo que le gustaría que sí o sí aparezca, como servicios, precios o fotos?' },
  { codigo: 'C2', grupo: 'C', nombre: 'Preguntó el precio', texto: 'Depende de lo que necesite. Primero véala sin compromiso y, si le gusta, le paso los valores. ¿Se la envío?' },
  { codigo: 'C3', grupo: 'C', nombre: 'Preguntó quién es', texto: 'Su número aparece en [Google o Instagram] de [negocio]. Soy [tu nombre], de Optimind Partners; hacemos páginas para pymes de la zona.' },
  { codigo: 'C4', grupo: 'C', nombre: 'No es el dueño', texto: 'Gracias. ¿Me podría decir con quién hablo sobre la página del negocio, o a qué hora le puedo escribir?' },
  { codigo: 'C5', grupo: 'C', nombre: 'Ya tiene página o no la necesita', texto: 'Perfecto. También ayudamos con otras cosas, como la ficha de Google Maps o las reservas por WhatsApp. ¿Algo de eso le serviría?' },
  { codigo: 'C6', grupo: 'C', nombre: 'No le interesa', texto: 'Entiendo, gracias por responder. Si más adelante lo necesita, aquí estoy.' },
];
const GRUPOS = { A: 'Ya tienen página web', B: 'No tienen página web', S: 'Seguimiento (no respondieron)', C: 'Respuestas (cuando contestan)' };

export function iniciarContactar(u) {
  const { h, $, abrir, cerrar, cambiar, waLink, hoy, estado } = u;
  let ultimo = null;

  // Prospectos y clientes con WhatsApp, en una sola lista.
  const contactos = () => {
    const d = estado().data;
    return [
      ...(d.prospectos || []).map((p) => ({ tipo: 'prospecto', id: p.id, negocio: p.negocio, nombre: p.contacto, whatsapp: p.whatsapp, rubro: p.rubro, comuna: p.comuna, nota: p.googleNota, estado: p.estado || 'por contactar' })),
      ...(d.clientes || []).map((c) => ({ tipo: 'cliente', id: c.id, negocio: c.negocio, nombre: c.contacto, whatsapp: c.whatsapp, rubro: '', comuna: c.ciudad, nota: '', estado: 'cliente' })),
    ].filter((x) => waLink(x.whatsapp));
  };

  // Rellena lo que el panel sabe; lo que no (ej. [detalle]) queda entre corchetes para completarlo a mano.
  function rellenar(texto, x) {
    const yo = String(estado().usuario || '').trim();
    const firma = yo && yo[0].toUpperCase() + yo.slice(1);
    const nombre = String(x.nombre || '').trim().split(/\s+/)[0];
    let t = texto;
    if (!nombre) {
      t = t.replace('¿hablo con [nombre]?', '¿hablo con el dueño o la dueña de [negocio]?').replace(/^Hola \[nombre\], /, 'Hola, ');
    }
    if (!firma) t = t.replace(/[Ss]oy \[tu nombre\], de Optimind Partners/, (m) => `${m[0] === 'S' ? 'Le' : 'le'} escribo de Optimind Partners`).replace(/[Ss]oy \[tu nombre\]\./, (m) => `${m[0] === 'S' ? 'Le' : 'le'} escribo de Optimind Partners.`);
    const valores = {
      nombre, 'tu nombre': firma, negocio: x.negocio, rubro: String(x.rubro || '').toLowerCase(), comuna: x.comuna,
      nota: x.nota === '' || x.nota == null ? '' : Number(x.nota).toFixed(1).replace('.', ','),
    };
    return t.replace(/\[([^\]]+)\]/g, (m, k) => (valores[k] ? valores[k] : m));
  }

  function elegirMensaje() {
    const lista = h('div', { class: 'cmsgs' }, Object.entries(GRUPOS).map(([g, titulo]) => h('div', { class: 'cgrupo' },
      h('div', { class: 'mini' }, `${g} · ${titulo}`),
      h('div', { class: 'ccods' }, MENSAJES.filter((m) => m.grupo === g).map((m) => h('button', {
        class: `btn ccod${ultimo === m.codigo ? ' ccod-ultimo' : ''}`, title: m.texto, onclick: () => elegirContacto(m),
      }, h('b', {}, m.codigo), h('span', {}, m.nombre)))))));
    abrir('Contactar', '1. Elige el mensaje', lista);
  }

  function elegirContacto(m) {
    ultimo = m.codigo;
    const buscar = h('input', { type: 'search', placeholder: 'Buscar negocio, comuna o rubro…', 'aria-label': 'Buscar' });
    const filtro = h('div', { class: 'row' }, ['todos', 'prospecto', 'cliente'].map((t) => h('button', { class: 'btn btn-sm', 'aria-pressed': String(t === 'todos'), 'data-t': t }, t === 'todos' ? 'Todos' : t === 'prospecto' ? 'Prospectos' : 'Clientes')));
    let tipo = m.grupo === 'A' || m.grupo === 'B' ? 'prospecto' : 'todos';
    const lista = h('div', { class: 'clista' });
    const dibujar = () => {
      for (const b of filtro.children) b.setAttribute('aria-pressed', String(b.dataset.t === tipo));
      const q = buscar.value.trim().toLowerCase();
      const xs = contactos().filter((x) => (tipo === 'todos' || x.tipo === tipo) && (!q || [x.negocio, x.comuna, x.rubro, x.nombre].some((v) => String(v || '').toLowerCase().includes(q))));
      lista.replaceChildren(...(xs.length ? xs.map((x) => h('button', { class: 'citem', onclick: () => revisar(m, x) },
        h('span', {}, h('b', {}, x.negocio), h('span', { class: 'muted' }, [x.rubro, x.comuna].filter(Boolean).join(' · '))),
        h('span', { class: 'badge b-inactivo' }, x.estado))) : [h('div', { class: 'empty' }, 'Nadie con WhatsApp coincide.')]));
    };
    filtro.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { tipo = b.dataset.t; dibujar(); } });
    buscar.addEventListener('input', dibujar);
    dibujar();
    abrir(`Contactar · ${m.codigo} ${m.nombre}`, '2. Elige a quién', [h('p', { class: 'muted cprev' }, m.texto), buscar, filtro, lista],
      [h('button', { class: 'btn', onclick: elegirMensaje }, '← Otro mensaje')]);
    buscar.focus();
  }

  function revisar(m, x) {
    const texto = h('textarea', { rows: 7, 'aria-label': 'Mensaje' });
    texto.value = rellenar(m.texto, x);
    const aviso = h('p', { class: 'error' });
    const enviar = h('a', { class: 'btn btn-wa', target: '_blank', rel: 'noopener' }, 'Abrir WhatsApp');
    const actualizar = () => {
      const falta = texto.value.match(/\[[^\]]+\]/g);
      aviso.textContent = falta ? `Completa lo que está entre corchetes: ${[...new Set(falta)].join(', ')}` : '';
      aviso.hidden = !falta;
      enviar.href = falta ? '#' : waLink(x.whatsapp, texto.value.trim());
      enviar.toggleAttribute('aria-disabled', Boolean(falta));
      enviar.classList.toggle('btn-off', Boolean(falta));
    };
    enviar.addEventListener('click', (e) => {
      if (enviar.hasAttribute('aria-disabled')) { e.preventDefault(); texto.focus(); return; }
      if (x.tipo === 'prospecto') anotar(m, x);
      cerrar();
    });
    texto.addEventListener('input', actualizar);
    actualizar();
    abrir(`${m.codigo} → ${x.negocio}`, '3. Revisa y envía', [texto, aviso],
      [h('button', { class: 'btn', onclick: () => elegirContacto(m) }, '← Otro contacto'), enviar]);
    const i = texto.value.indexOf('[');
    if (i >= 0) { texto.focus(); texto.setSelectionRange(i, texto.value.indexOf(']', i) + 1); }
  }

  // Deja anotado qué mensaje se usó, para después comparar cuál responde mejor.
  function anotar(m, x) {
    cambiar((d) => {
      const p = (d.prospectos || []).find((y) => y.id === x.id);
      if (!p) return;
      const marca = { fecha: hoy(), por: estado().usuario, via: 'WhatsApp', mensaje: m.codigo };
      if ((m.grupo === 'A' || m.grupo === 'B') && (p.estado || 'por contactar') === 'por contactar') { p.estado = 'contactado'; p.contactado = marca; }
      if (m.grupo === 'S') p.seguimiento = marca;
      p.mensajes = [...(p.mensajes || []), marca].slice(-20);
    }, `${x.negocio}: ${m.codigo} anotado`);
  }

  $('#contactar').addEventListener('click', elegirMensaje);
}
