// Pestaña Tienda: ventas de los mini cursos y ebooks, embudo (vio → tocó comprar → llegó al pago → pagó),
// de dónde vienen las ventas, pagos abandonados para recuperar y el PDF de cada producto.
// Los datos vienen de /api/publico/tienda?op=panel (ventas y pasos que registra la propia web).

const PASOS = [['vista', 'Vieron el producto'], ['comprar', 'Tocaron "Comprar"'], ['pago', 'Llegaron al pago'], ['compra', 'Pagaron']];
const CANAL = { meta: 'Meta (Facebook)', instagram: 'Instagram', google: 'Google', tiktok: 'TikTok', youtube: 'YouTube', whatsapp: 'WhatsApp', correo: 'Correo', otro: 'Otros sitios', directo: 'Directo o sin dato' };
const RANGOS = [['hoy', 'Hoy', 0], ['7', '7 días', 6], ['30', '30 días', 29], ['90', '90 días', 89]];
const ESTADO = { pagado: ['ok', 'Pagado'], pendiente: ['pronto', 'Pendiente'], rechazado: ['atrasado', 'Rechazado'], revisar: ['atrasado', 'Revisar monto'] };

export function iniciarTienda({ h, $, toast, badge }) {
  let rango = '30';
  try { rango = localStorage.getItem('panel-tienda-rango') || '30'; } catch { /* sin storage */ }
  let datos = null, cargando = false, cargadoEn = 0, error = '';
  const raiz = () => $('#tienda');
  const pesos = (n) => '$' + Math.round(n || 0).toLocaleString('es-CL');
  const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '—');
  const diaChile = (d) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Santiago' });
  const fecha = (iso) => new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });

  async function cargar(forzar) {
    if (cargando || (!forzar && datos && Date.now() - cargadoEn < 60000)) return;
    cargando = true; error = '';
    const r0 = RANGOS.find((r) => r[0] === rango) || RANGOS[2];
    const hasta = diaChile(new Date()), desde = diaChile(new Date(Date.now() - r0[2] * 864e5));
    try {
      const r = await fetch(`/api/publico/tienda?op=panel&desde=${desde}&hasta=${hasta}`, { credentials: 'same-origin' });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || 'No se pudieron cargar las métricas');
      datos = b; cargadoEn = Date.now();
    } catch (e) { error = e.message === 'Failed to fetch' ? 'Sin conexión' : e.message; }
    cargando = false;
    pintar();
  }

  function render() {
    if ($('#tab-tienda')?.hidden) return;
    if (!datos || Date.now() - cargadoEn > 60000) cargar();
    pintar();
  }

  function sumar(filtro) { return (datos?.pasos || []).filter(filtro).reduce((s, x) => s + x.n, 0); }

  function pintar() {
    const el = raiz();
    if (!el) return;
    el.replaceChildren();
    const barra = h('div', { class: 'tienda-barra' },
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Período' }, RANGOS.map(([k, t]) => h('button', {
        class: 'btn btn-sm' + (k === rango ? ' btn-primary' : ''), type: 'button',
        onclick: () => { rango = k; try { localStorage.setItem('panel-tienda-rango', k); } catch { /* */ } cargadoEn = 0; datos = null; cargar(true); },
      }, t))),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: () => cargar(true) }, cargando ? 'Cargando…' : 'Actualizar'));
    el.append(barra);
    if (error) { el.append(h('p', { class: 'error' }, error)); return; }
    if (!datos) { el.append(h('div', { class: 'empty' }, 'Cargando las métricas de la tienda…')); return; }

    // Avisos de configuración
    const c = datos.config || {};
    const faltan = [];
    if (!c.pagos) faltan.push(['atrasado', 'Mercado Pago sin conectar', 'Falta MP_ACCESS_TOKEN en Vercel. Mientras tanto el botón usa el link de pago antiguo y las ventas no quedan registradas aquí.']);
    if (!c.meta) faltan.push(['pronto', 'Píxel de Meta sin conectar', 'Falta META_PIXEL_ID en Vercel.']);
    else if (!c.capi) faltan.push(['pronto', 'API de Conversiones sin conectar', 'Falta META_CAPI_TOKEN en Vercel: Meta solo recibe lo que ve el navegador.']);
    if (!c.google) faltan.push(['pronto', 'Google sin conectar', 'Faltan GOOGLE_TAG_ID y/o GOOGLE_ADS_ID en Vercel.']);
    if (!c.clarity) faltan.push(['mes', 'Clarity sin conectar', 'Falta CLARITY_ID en Vercel para ver grabaciones y mapas de calor.']);
    for (const [id, ok] of Object.entries(datos.archivos || {})) if (!ok) faltan.push(['atrasado', `Falta el PDF de ${datos.productos[id]?.nombre || id}`, 'Súbelo abajo, en "Archivos de los productos": sin él, los compradores no pueden descargar.']);
    if (faltan.length) el.append(h('div', { class: 'list tienda-avisos' }, faltan.map(([n, t, d]) => h('div', { class: 'item' }, badge(n, n === 'atrasado' ? 'Falta' : 'Pendiente'), h('div', { class: 'main' }, h('b', {}, t), h('small', {}, d))))));

    // Resumen
    const pagadas = datos.ordenes.filter((o) => o.estado === 'pagado');
    const ventas = pagadas.reduce((s, o) => s + o.monto, 0);
    const vistas = sumar((x) => x.paso === 'vista');
    const compras = pagadas.length;
    el.append(h('div', { class: 'kpis' },
      kpi('Ventas', pesos(ventas)), kpi('Compras', String(compras)), kpi('Visitas a productos', String(vistas)),
      kpi('Conversión', pct(compras, vistas)), kpi('Ticket promedio', compras ? pesos(ventas / compras) : '—')));

    // Embudo
    const totPasos = PASOS.map(([p]) => sumar((x) => x.paso === p));
    const max = Math.max(1, ...totPasos);
    el.append(h('div', { class: 'card' }, h('h2', {}, 'Embudo'),
      h('p', { class: 'muted' }, 'Cuántas personas pasan de un paso al siguiente. Donde más se caen es lo primero que hay que mejorar.'),
      h('div', { class: 'embudo' }, PASOS.map(([, nombre], i) => h('div', { class: 'paso' },
        h('div', { class: 'paso-top' }, h('span', {}, nombre), h('b', {}, String(totPasos[i])), i ? h('small', { class: 'muted' }, `${pct(totPasos[i], totPasos[i - 1])} del paso anterior`) : null),
        h('div', { class: 'barra-fondo' }, h('div', { class: 'barra-llena', style: `width:${(totPasos[i] / max) * 100}%` })))))));

    // Ventas por día
    const dias = [];
    for (let d = new Date(datos.desde + 'T12:00:00'); diaChile(d) <= datos.hasta; d = new Date(d.getTime() + 864e5)) dias.push(diaChile(d));
    const porDia = Object.fromEntries(dias.map((d) => [d, 0]));
    for (const o of pagadas) { const d = diaChile(new Date(o.pagado || o.creado)); if (d in porDia) porDia[d] += o.monto; }
    const maxDia = Math.max(1, ...Object.values(porDia));
    el.append(h('div', { class: 'card' }, h('h2', {}, 'Ventas por día'),
      h('div', { class: 'grafico-dias', role: 'img', 'aria-label': 'Ventas por día' }, dias.map((d, i) => h('div', { class: 'col-dia', title: `${d}: ${pesos(porDia[d])}` },
        h('div', { class: 'col-barra', style: `height:${Math.max(porDia[d] ? 4 : 1, (porDia[d] / maxDia) * 100)}%` }),
        h('small', {}, dias.length <= 10 || i % Math.ceil(dias.length / 8) === 0 || i === dias.length - 1 ? d.slice(8) : ' '))))));

    // Por canal
    const canales = Object.keys(CANAL).map((k) => {
      const v = sumar((x) => x.canal === k && x.paso === 'vista'), p = sumar((x) => x.canal === k && x.paso === 'pago');
      const ps = pagadas.filter((o) => o.canal === k);
      return { k, v, p, n: ps.length, m: ps.reduce((s, o) => s + o.monto, 0) };
    }).filter((x) => x.v || x.p || x.n).sort((a, b) => b.m - a.m || b.v - a.v);
    el.append(h('div', { class: 'card' }, h('h2', {}, 'De dónde vienen'),
      canales.length ? tabla(['Canal', 'Visitas', 'Llegaron al pago', 'Compras', 'Ventas', 'Conversión'], canales.map((x) => [CANAL[x.k], x.v, x.p, x.n, pesos(x.m), pct(x.n, x.v)])) : h('p', { class: 'muted' }, 'Todavía no hay visitas en este período.'),
      h('p', { class: 'muted chico' }, 'El canal sale de los links de los anuncios (utm_source, fbclid, gclid, ttclid) o de la página desde donde llegaron.')));

    // Por producto y dispositivo
    const prods = Object.entries(datos.productos).map(([id, p]) => {
      const ps = pagadas.filter((o) => o.producto === id);
      const v = sumar((x) => x.producto === id && x.paso === 'vista');
      return [p.nombre, pesos(p.precio), v, ps.length, pesos(ps.reduce((s, o) => s + o.monto, 0)), pct(ps.length, v)];
    });
    const movil = sumar((x) => x.paso === 'vista' && x.disp === 'movil');
    el.append(h('div', { class: 'card' }, h('h2', {}, 'Productos'), tabla(['Producto', 'Precio', 'Visitas', 'Compras', 'Ventas', 'Conversión'], prods),
      vistas ? h('p', { class: 'muted chico' }, `Desde el celular: ${pct(movil, vistas)} de las visitas · desde computador: ${pct(vistas - movil, vistas)}.`) : null));

    // Ventas
    el.append(h('div', { class: 'card' }, h('h2', {}, `Ventas (${pagadas.length})`),
      pagadas.length ? tabla(['Fecha', 'Producto', 'Comprador', 'Monto', 'Canal'], pagadas.map((o) => [fecha(o.pagado || o.creado), datos.productos[o.producto]?.nombre || o.producto, `${o.nombre} · ${o.email}`, pesos(o.monto), CANAL[o.canal] || o.canal])) : h('p', { class: 'muted' }, 'Todavía no hay ventas en este período.')));

    // Otras órdenes (revisar, rechazadas, pendientes recientes)
    const otras = datos.ordenes.filter((o) => o.estado !== 'pagado');
    // Pagos abandonados
    el.append(h('div', { class: 'card' }, h('h2', {}, `Pagos abandonados (${datos.abandonadas.length})`),
      h('p', { class: 'muted' }, 'Llegaron al pago con su correo y no pagaron (hace más de 30 minutos). Un recordatorio amable recupera varias de estas ventas.'),
      datos.abandonadas.length ? h('div', { class: 'list' }, datos.abandonadas.map((o) => {
        const p = datos.productos[o.producto]?.nombre || o.producto;
        const msj = `Hola ${o.nombre.split(' ')[0]}, vi que te interesó "${p}" y el pago quedó a medias. ¿Te puedo ayudar en algo? Aquí lo puedes terminar: ${o.linkPago}`;
        const wa = o.telefono ? `https://wa.me/${o.telefono.replace(/\D/g, '').replace(/^9(\d{8})$/, '569$1')}?text=${encodeURIComponent(msj)}` : null;
        return h('div', { class: 'item' }, h('div', { class: 'main' }, h('b', {}, o.nombre), h('small', {}, `${p} · ${pesos(o.monto)} · ${fecha(o.creado)} · ${CANAL[o.canal] || o.canal}`), h('small', {}, o.email + (o.telefono ? ` · ${o.telefono}` : ''))),
          h('div', { class: 'row' }, h('a', { class: 'btn btn-sm btn-correo', href: `mailto:${o.email}?subject=${encodeURIComponent('Tu compra en STPyme')}&body=${encodeURIComponent(msj)}` }, 'Correo'), wa ? h('a', { class: 'btn btn-sm btn-wa', href: wa, target: '_blank', rel: 'noopener' }, 'WhatsApp') : null));
      })) : h('p', { class: 'muted' }, 'No hay pagos abandonados en este período.'),
      otras.some((o) => o.estado === 'revisar') ? h('p', { class: 'error' }, 'Hay órdenes con un monto pagado distinto al precio: revísalas en Mercado Pago.') : null));

    // Archivos
    el.append(h('div', { class: 'card' }, h('h2', {}, 'Archivos de los productos'),
      h('p', { class: 'muted' }, 'El PDF que se descarga cada comprador. Se guarda privado: solo lo bajan las compras pagadas. Máximo 4 MB.'),
      h('div', { class: 'list' }, Object.entries(datos.productos).map(([id, p]) => {
        const input = h('input', { type: 'file', accept: 'application/pdf', hidden: true, onchange: (e) => subir(id, e.target.files[0], e.target) });
        return h('div', { class: 'item' }, h('div', { class: 'main' }, h('b', {}, p.nombre), h('small', {}, datos.archivos?.[id] ? 'PDF cargado ✓' : 'Falta subir el PDF')),
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => input.click() }, datos.archivos?.[id] ? 'Reemplazar PDF' : 'Subir PDF'), input);
      }))));

    if (c.clarity) el.append(h('div', { class: 'card' }, h('h2', {}, 'Grabaciones y mapas de calor'), h('p', { class: 'muted' }, 'En Clarity ves qué hizo cada persona en la página: dónde tocó, hasta dónde bajó y dónde se fue.'),
      h('a', { class: 'btn', href: `https://clarity.microsoft.com/projects/view/${encodeURIComponent(c.clarity)}/dashboard`, target: '_blank', rel: 'noopener' }, 'Abrir Clarity')));
  }

  async function subir(id, archivo, input) {
    if (!archivo) return;
    if (archivo.size > 4.3 * 1024 * 1024) { toast('El PDF pesa más de 4 MB. Comprímelo y vuelve a intentar.'); input.value = ''; return; }
    toast('Subiendo PDF…');
    try {
      const r = await fetch(`/api/publico/tienda?op=archivo&producto=${encodeURIComponent(id)}`, { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/pdf' }, body: archivo });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error || 'No se pudo subir');
      toast('PDF subido ✓');
      cargar(true);
    } catch (e) { toast(e.message); }
    input.value = '';
  }

  function kpi(t, v) { return h('div', { class: 'kpi' }, h('span', {}, t), h('b', {}, v)); }
  function tabla(cab, filas) {
    const num = (x) => /^(\$[\d.]+|-?[\d.,]+%?|—)$/.test(String(x));
    const numCol = cab.map((_, i) => filas.length > 0 && filas.every((f) => num(f[i])));
    return h('div', { class: 'tabla-scroll' }, h('table', { class: 'tabla' }, h('thead', {}, h('tr', {}, cab.map((c, i) => h('th', { class: numCol[i] ? 'num' : null }, c)))),
      h('tbody', {}, filas.map((f) => h('tr', {}, f.map((x, i) => h('td', { class: numCol[i] ? 'num' : null }, String(x))))))));
  }

  return { render, recargar: () => cargar(true) };
}
