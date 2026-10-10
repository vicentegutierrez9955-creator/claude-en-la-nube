// Maquetas: todas las páginas que hemos hecho (plantillas por rubro, maquetas para prospectos y
// páginas de clientes), con una vista previa para mirarlas sin salir del panel.
// La lista base está aquí; además se suman solas las maquetas que se anoten en "Lo que le creamos"
// de un prospecto y la página web de cada cliente.
const CATALOGO = [
  { tipo: 'plantilla', nombre: 'Veterinaria', detalle: 'Clínica Veterinaria Huellas del Sur · datos de ejemplo', url: '/plantilla-veterinaria' },
  { tipo: 'plantilla', nombre: 'Gimnasio', detalle: 'Pulso Gym Maipú · datos de ejemplo', url: '/plantilla-gimnasio' },
  { tipo: 'plantilla', nombre: 'Barbería de barrio', detalle: 'Barbería Los Robles · datos de ejemplo', url: '/barrio' },
  { tipo: 'plantilla', nombre: 'Barbería premium', detalle: 'Casa Bruno Barbería · datos de ejemplo', url: '/premium' },
  { tipo: 'plantilla', nombre: 'Barbería urbana', detalle: 'Trece Barbershop · datos de ejemplo', url: '/urbana' },
  { tipo: 'prospecto', nombre: 'Hospital Veterinario San Agustín', detalle: 'Veterinaria · Melipilla', url: '/veterinaria-san-agustin' },
  { tipo: 'prospecto', nombre: 'Kine Rehabilita Sports', detalle: 'Kinesiología · Melipilla', url: '/kine-rehabilita-sports' },
  { tipo: 'prospecto', nombre: '5 Stars Barber Shop', detalle: 'Barbería · Melipilla', url: '/5-stars-barber-shop' },
  { tipo: 'prospecto', nombre: 'Clínica Dental Costa Dent', detalle: 'Clínica dental · Melipilla', url: '/costa-dent' },
  { tipo: 'prospecto', nombre: 'Active Gym', detalle: 'Gimnasio · Melipilla', url: '/active-gym' },
  { tipo: 'prospecto', nombre: 'ST Motor', detalle: 'Taller mecánico · Melipilla', url: '/st-motor' },
  { tipo: 'prospecto', nombre: 'Buddha Sushi', detalle: 'Sushi y delivery · Melipilla', url: '/buddha-sushi' },
  { tipo: 'prospecto', nombre: 'Centro Veterinario PetCare', detalle: 'Veterinaria · Puente Alto', url: '/petcare-puente-alto' },
  { tipo: 'cliente', nombre: 'Gustavo Parra Podología', detalle: 'Podología · Estación Central', url: 'https://gparrapodologia.cl', alias: ['/gustavo-parra-podologia'] },
  { tipo: 'cliente', nombre: 'Asesorías Contables JC', detalle: 'Contador · Melipilla', url: 'https://asesoriascontables-jc.cl', alias: ['/asesorias-contables-jc'] },
];
const SECCIONES = [
  ['cliente', 'Páginas de clientes', 'Están en línea con su dominio.'],
  ['prospecto', 'Maquetas para prospectos', 'Hechas con los datos reales de cada negocio, para mostrárselas.'],
  ['plantilla', 'Plantillas por rubro', 'Con datos de ejemplo. Sirven para mostrar cómo quedaría y para armar maquetas nuevas rápido.'],
];
const ANCHO_CEL = 390;
const ALTO_CEL = 844;
const ANCHO_PC = 1280;
const ALTO_PC = 800;

export function iniciarMaquetas(u) {
  const { h, $, badge, abrir, urlSegura, estado } = u;
  const COLOR_P = { 'por contactar': 'inactivo', contactado: 'mes', interesado: 'pronto', cerrado: 'ok', 'no interesado': 'atrasado' };
  let firma = '';

  // Clave para comparar links: el camino si es una página de este sitio, o el dominio si es otra.
  const clave = (url) => {
    try {
      const x = new URL(url, location.origin);
      const propio = x.origin === location.origin || /(^|\.)plantillas-omega\.vercel\.app$/.test(x.hostname);
      return propio ? x.pathname.replace(/\/$/, '') || '/' : x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, '');
    } catch { return ''; }
  };
  const completa = (url) => new URL(url, location.origin).href;

  function lista() {
    const d = estado().data;
    const items = CATALOGO.map((m) => ({ ...m, claves: [m.url, ...(m.alias || [])].map(clave) }));
    const buscarItem = (url) => { const k = clave(url); return items.find((m) => m.claves.includes(k)); };
    for (const p of d.prospectos || []) {
      for (const l of p.creado || []) {
        if (!urlSegura(l.url)) continue;
        let m = buscarItem(l.url);
        if (!m) { m = { tipo: 'prospecto', nombre: p.negocio, detalle: [l.nombre, p.rubro, p.comuna].filter(Boolean).join(' · '), url: l.url, claves: [clave(l.url)] }; items.push(m); }
        if (!m.prospecto && m.tipo !== 'plantilla') m.prospecto = p;
      }
    }
    for (const c of d.clientes || []) {
      if (!urlSegura(c.web)) continue;
      let m = buscarItem(c.web);
      if (!m) { m = { tipo: 'cliente', nombre: c.negocio, detalle: c.ciudad || '', url: c.web, claves: [clave(c.web)] }; items.push(m); }
      m.cliente = c;
    }
    return items;
  }

  function etiqueta(m) {
    if (m.cliente || m.tipo === 'cliente') return badge('ok', 'Cliente');
    if (m.prospecto) return badge(COLOR_P[m.prospecto.estado] || 'inactivo', m.prospecto.estado || 'por contactar');
    return m.tipo === 'plantilla' ? badge('inactivo', 'Ejemplo') : null;
  }

  // Vista previa: la página real en un iframe de celular, achicada para que quepa en la tarjeta.
  function previa(m, escala) {
    return h('div', { class: 'mprev', style: `width:${Math.round(ANCHO_CEL * escala)}px;height:${Math.round(ALTO_CEL * escala * 0.62)}px` },
      h('iframe', {
        src: m.url, title: `Vista previa de ${m.nombre}`, loading: 'lazy', tabindex: '-1', 'aria-hidden': 'true',
        sandbox: 'allow-scripts allow-same-origin',
        style: `width:${ANCHO_CEL}px;height:${ALTO_CEL}px;transform:scale(${escala})`,
      }));
  }

  function copiar(m) {
    return (e) => { navigator.clipboard?.writeText(completa(m.url)).then(() => { e.target.textContent = 'Copiado'; }); };
  }

  function ver(m) {
    const marco = h('div', { class: 'mver' });
    const btnCel = h('button', { class: 'btn btn-sm', 'aria-pressed': 'true' }, 'Celular');
    const btnPc = h('button', { class: 'btn btn-sm', 'aria-pressed': 'false' }, 'Computador');
    const mostrar = (pc) => {
      btnCel.setAttribute('aria-pressed', String(!pc));
      btnPc.setAttribute('aria-pressed', String(pc));
      const ancho = marco.clientWidth || 640;
      const w = pc ? ANCHO_PC : ANCHO_CEL;
      const alto = pc ? ALTO_PC : ALTO_CEL;
      const escala = Math.min(1, ancho / w);
      const visible = Math.round(Math.min(alto * escala, window.innerHeight * 0.62));
      marco.style.height = `${visible}px`;
      marco.replaceChildren(h('iframe', {
        src: m.url, title: m.nombre, sandbox: 'allow-scripts allow-same-origin allow-forms',
        style: `width:${w}px;height:${Math.round(visible / escala)}px;transform:scale(${escala});margin-left:${Math.max(0, Math.round((ancho - w * escala) / 2))}px`,
      }));
    };
    btnCel.addEventListener('click', () => mostrar(false));
    btnPc.addEventListener('click', () => mostrar(true));
    abrir(m.nombre, m.detalle, [
      h('div', { class: 'row' }, btnCel, btnPc, h('span', { class: 'muted', style: 'font-size:13px' }, completa(m.url).replace(/^https?:\/\//, ''))),
      marco,
    ], [
      h('button', { class: 'btn', onclick: copiar(m) }, 'Copiar link'),
      h('a', { class: 'btn btn-primary', href: completa(m.url), target: '_blank', rel: 'noopener' }, 'Abrir en pestaña nueva'),
    ]);
    requestAnimationFrame(() => mostrar(false));
  }

  function tarjeta(m) {
    return h('div', { class: 'ccard mcard' },
      h('button', { class: 'mprev-btn', 'aria-label': `Ver ${m.nombre}`, onclick: () => ver(m) }, previa(m, 0.55)),
      h('div', { class: 'row', style: 'justify-content:space-between;align-items:flex-start;flex-wrap:nowrap' },
        h('h3', {}, m.nombre), etiqueta(m)),
      m.detalle ? h('div', { class: 'muted', style: 'font-size:14px' }, m.detalle) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn btn-sm btn-primary', onclick: () => ver(m) }, 'Ver'),
        h('a', { class: 'btn btn-sm', href: completa(m.url), target: '_blank', rel: 'noopener' }, 'Abrir'),
        h('button', { class: 'btn btn-sm', onclick: copiar(m) }, 'Copiar link')),
    );
  }

  // Solo se dibuja con la pestaña a la vista y si algo cambió, para no recargar las vistas previas.
  function render() {
    if ($('#tab-maquetas').hidden) return;
    const items = lista();
    const nueva = JSON.stringify(items.map((m) => [m.tipo, m.nombre, m.detalle, m.url, m.prospecto?.estado, Boolean(m.cliente)]));
    if (nueva === firma) return;
    firma = nueva;
    $('#maquetas-resumen').textContent = SECCIONES.map(([t, titulo]) => `${items.filter((m) => m.tipo === t).length} ${titulo.split(' ')[0].toLowerCase()}`).join(' · ');
    const cont = $('#maquetas');
    cont.replaceChildren(...SECCIONES.map(([tipo, titulo, ayuda]) => {
      const grupo = items.filter((m) => m.tipo === tipo);
      return grupo.length ? h('div', { class: 'pgrupo' },
        h('div', { class: 'pgrupo-head' }, h('h3', {}, titulo), h('span', {}, `${grupo.length} · ${ayuda}`)),
        h('div', { class: 'grid mgrid' }, grupo.map(tarjeta))) : null;
    }).filter(Boolean));
  }

  return { render };
}
