// Motor de la carta para restaurantes: lo usan la herramienta (/herramientas/menu-restaurante) y las cartas
// publicadas (/carta/<local>). Arma la carta como una lista de dibujos en milímetros por hoja, y la convierte
// en vista previa (SVG) o en PDF (jsPDF). También dibuja el QR (qrcode-generator) en imagen y en PDF.
(() => {
  const PT = 0.3528; // 1 punto tipográfico en mm
  const ESTILOS = {
    clasico: { nombre: 'Clásico', bg: '#fbf6ec', ink: '#2b2118', muted: '#76675a', acc: '#9c2f22', cab: 'times', txt: 'times', marco: true, mayus: true, centro: true },
    moderno: { nombre: 'Moderno', bg: '#ffffff', ink: '#1d1d1f', muted: '#6b6b70', acc: '#e4572e', cab: 'helvetica', txt: 'helvetica', barra: true },
    pizarra: { nombre: 'Pizarra', bg: '#23272b', ink: '#f4f1ea', muted: '#b8b2a7', acc: '#f2c14e', cab: 'helvetica', txt: 'helvetica', mayus: true },
    fresco: { nombre: 'Fresco', bg: '#f2f7ee', ink: '#1f3324', muted: '#5d7262', acc: '#3f8f3a', cab: 'helvetica', txt: 'helvetica', pildora: true, barra: true },
  };
  const COLORES = ['', '#9c2f22', '#e4572e', '#d4a017', '#3f8f3a', '#1f6fb2', '#7b3fa0', '#c2185b'];
  const HOJAS = { a4: [210, 297], carta: [215.9, 279.4] };
  const FAMILIA = { helvetica: 'Helvetica, Arial, "Liberation Sans", sans-serif', times: '"Times New Roman", Times, "Liberation Serif", serif' };
  const SITIO = 'stpyme.cl';

  // El PDF usa las letras estándar (Helvetica y Times), que traen tildes, ñ, ¿ y ¡, pero no emojis.
  const limpiar = (s) => String(s || '').replace(/[“”«»]/g, '"').replace(/[‘’´]/g, "'").replace(/[–—]/g, '-').replace(/…/g, '...').replace(/[•·]/g, '·')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '').replace(/\s+/g, ' ').trim();
  const miles = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const precioTxt = (p) => {
    const t = limpiar(p);
    if (!t) return '';
    const d = t.replace(/[$.\s]/g, '');
    return /^\d+$/.test(d) ? '$' + miles(Number(d)) : t;
  };
  const estiloDe = (e) => {
    const est = { ...(ESTILOS[e.diseno && e.diseno.estilo] || ESTILOS.clasico) };
    if (e.diseno && e.diseno.color) est.acc = e.diseno.color;
    return est;
  };

  // Medidas de texto: con jsPDF si ya cargó (exactas para el PDF); si no, con un canvas (casi iguales).
  let medidor = null;
  let lienzo = null;
  const ancho = (s, fuente, estilo, tam) => {
    if (!medidor && window.jspdf) { try { medidor = new window.jspdf.jsPDF({ unit: 'mm' }); } catch { medidor = null; } }
    if (medidor) { medidor.setFont(fuente, estilo); medidor.setFontSize(tam); return medidor.getTextWidth(s); }
    lienzo = lienzo || document.createElement('canvas').getContext('2d');
    lienzo.font = (estilo.includes('italic') ? 'italic ' : '') + (estilo.includes('bold') ? 'bold ' : '') + (tam * PT * 10) + 'px ' + FAMILIA[fuente];
    return lienzo.measureText(s).width / 10;
  };
  const partir = (s, w, f) => {
    const lineas = [];
    let l = '';
    for (const p of String(s).split(' ').filter(Boolean)) {
      const prueba = l ? l + ' ' + p : p;
      if (!l || ancho(prueba, ...f) <= w) l = prueba;
      else { lineas.push(l); l = p; }
    }
    if (l) lineas.push(l);
    return lineas;
  };

  // ---------- La carta en hojas ----------
  function componer(e) {
    const est = estiloDe(e);
    const [W, H] = HOJAS[e.diseno.hoja] || HOJAS.a4;
    const cols = Number(e.diseno.cols) === 2 ? 2 : 1;
    const M = est.marco ? 18 : 16;
    const GAP = 12;
    const colW = (W - 2 * M - (cols - 1) * GAP) / cols;
    const L = e.local;
    const nombre = limpiar(L.nombre) || 'Nombre de tu local';
    const contacto = [L.dir, L.tel, L.ig, L.horario].map(limpiar).filter(Boolean);
    const fPie = [est.txt, 'normal', 9];
    const pieL = contacto.length ? partir(contacto.join('   ·   '), W - 2 * M, fPie).slice(0, 3) : [];
    const abajo = est.marco ? H - 12.5 : H - 7;
    const pie1 = abajo - 5.5 - (pieL.length - 1) * 4.2;
    const yMax = pieL.length ? pie1 - 9 : abajo - 8;
    const arriba = est.marco ? 20 : 17;
    const fNom = [est.txt, 'bold', 11.5];
    const fPr = [est.txt, 'bold', 11.5];
    const fDesc = [est.txt, est.marco ? 'italic' : 'normal', 9.5];

    const paginas = [];
    let ops, col, y, yCuerpo;
    const T = (x, yy, s, f, color, align) => ops.push({ t: 'text', x, y: yy, s, font: f[0], style: f[1], size: f[2], color, align: align || 'left' });

    const nuevaHoja = (primera) => {
      ops = [];
      paginas.push(ops);
      col = 0;
      ops.push({ t: 'rect', x: 0, y: 0, w: W, h: H, fill: est.bg });
      if (est.marco) {
        ops.push({ t: 'rect', x: 7, y: 7, w: W - 14, h: H - 14, stroke: est.acc, lw: 0.8 });
        ops.push({ t: 'rect', x: 9, y: 9, w: W - 18, h: H - 18, stroke: est.acc, lw: 0.25 });
      }
      if (est.barra) ops.push({ t: 'rect', x: 0, y: 0, w: W, h: 4, fill: est.acc });
      if (pieL.length) {
        ops.push({ t: 'line', x1: W / 2 - 18, y1: pie1 - 5.5, x2: W / 2 + 18, y2: pie1 - 5.5, color: est.acc, lw: 0.4 });
        pieL.forEach((l, i) => T(W / 2, pie1 + i * 4.2, l, fPie, est.muted, 'center'));
      }
      T(W / 2, abajo, 'Carta hecha gratis en ' + SITIO + '/herramientas/menu-restaurante', ['helvetica', 'normal', 6.5], est.muted, 'center');
      y = arriba;
      if (primera) {
        if (L.logo) {
          const r = Number(L.logoR) || 1;
          let h = 26, w = h * r;
          if (w > 70) { w = 70; h = w / r; }
          ops.push({ t: 'img', x: (W - w) / 2, y, w, h, src: L.logo });
          y += h + 6;
        }
        let tam = 32;
        while (tam > 20 && ancho(nombre, est.cab, 'bold', tam) > W - 2 * M) tam -= 1;
        for (const l of partir(nombre, W - 2 * M, [est.cab, 'bold', tam])) {
          T(W / 2, y + tam * PT * 0.78, l, [est.cab, 'bold', tam], est.ink, 'center');
          y += tam * PT * 1.12;
        }
        const frase = limpiar(L.frase);
        if (frase) { y += 1.5; T(W / 2, y + 4, frase, [est.txt, 'italic', 12], est.muted, 'center'); y += 6.5; }
        y += 4;
        ops.push({ t: 'line', x1: W / 2 - 20, y1: y, x2: W / 2 + 20, y2: y, color: est.acc, lw: 0.7 });
        y += 10;
      } else {
        T(W / 2, y + 3, nombre, [est.cab, 'bold', 11], est.muted, 'center');
        y += 11;
      }
      yCuerpo = y;
    };
    const xCol = () => M + col * (colW + GAP);
    const hacerEspacio = (h) => {
      if (y + h <= yMax || y === yCuerpo) return;
      if (col < cols - 1) { col += 1; y = yCuerpo; }
      else nuevaHoja(false);
    };
    const medir = (it) => {
      const pr = precioTxt(it.precio);
      const prW = pr ? ancho(pr, ...fPr) : 0;
      const nomL = partir(limpiar(it.nombre) || ' ', colW - prW - (pr ? 9 : 0), fNom);
      const descL = it.desc ? partir(limpiar(it.desc), colW - (pr ? 12 : 0), fDesc) : [];
      const alto = 4 + (nomL.length - 1) * 4.9 + (descL.length ? 4.4 + (descL.length - 1) * 4.2 : 0) + 4.4;
      return { pr, prW, nomL, descL, alto };
    };

    nuevaHoja(true);
    let alguno = false;
    for (const s of e.secciones) {
      const items = s.items.filter((it) => limpiar(it.nombre) || precioTxt(it.precio)).map(medir);
      let tit = limpiar(s.titulo);
      if (!tit && !items.length) continue;
      alguno = true;
      if (est.mayus) tit = tit.toUpperCase();
      const fTit = [est.cab, 'bold', est.mayus ? 13.5 : 15];
      const notaL = s.nota && limpiar(s.nota) ? partir(limpiar(s.nota), colW, [est.txt, 'italic', 9.5]) : [];
      const altoTit = (tit ? 11 : 0) + notaL.length * 4.2 + (notaL.length ? 2 : 0);
      if (y !== yCuerpo) y += 5;
      // Si la sección completa cabe en una columna nueva pero no en lo que queda, empieza en la siguiente columna.
      const altoSec = altoTit + items.reduce((t, m) => t + m.alto, 0);
      if (y + altoSec > yMax && yCuerpo + altoSec <= yMax) hacerEspacio(altoSec);
      else hacerEspacio(altoTit + (items[0] ? items[0].alto : 0));
      let x = xCol();
      if (tit) {
        if (est.pildora) {
          const tw = ancho(tit, ...fTit);
          ops.push({ t: 'rect', x, y, w: Math.min(colW, tw + 9), h: 8.4, fill: est.acc, r: 4.2 });
          T(x + 4.5, y + 5.9, tit, fTit, '#ffffff');
        } else if (est.centro) {
          const tw = ancho(tit, ...fTit);
          const cx = x + colW / 2;
          T(cx, y + 6, tit, fTit, est.acc, 'center');
          const lado = Math.min(22, (colW - tw) / 2 - 4);
          if (lado > 4) {
            ops.push({ t: 'line', x1: cx - tw / 2 - 3 - lado, y1: y + 4.6, x2: cx - tw / 2 - 3, y2: y + 4.6, color: est.acc, lw: 0.3 });
            ops.push({ t: 'line', x1: cx + tw / 2 + 3, y1: y + 4.6, x2: cx + tw / 2 + 3 + lado, y2: y + 4.6, color: est.acc, lw: 0.3 });
          }
        } else {
          T(x, y + 6, tit, fTit, est.acc);
          ops.push({ t: 'line', x1: x, y1: y + 8.8, x2: x + colW, y2: y + 8.8, color: est.acc, lw: 0.35 });
        }
        y += 11;
      }
      notaL.forEach((l) => { T(est.centro ? x + colW / 2 : x, y + 2.6, l, [est.txt, 'italic', 9.5], est.muted, est.centro ? 'center' : 'left'); y += 4.2; });
      if (notaL.length) y += 2;
      for (const m of items) {
        hacerEspacio(m.alto);
        x = xCol();
        const b = y + 4;
        m.nomL.forEach((l, i) => T(x, b + i * 4.9, l, fNom, est.ink));
        const bl = b + (m.nomL.length - 1) * 4.9;
        if (m.pr) {
          T(x + colW, bl, m.pr, fPr, est.acc, 'right');
          const fin = x + ancho(m.nomL[m.nomL.length - 1], ...fNom) + 2;
          const ini = x + colW - m.prW - 2;
          if (ini - fin > 4) ops.push({ t: 'line', x1: fin, y1: bl - 0.5, x2: ini, y2: bl - 0.5, color: est.muted, lw: 0.4, dash: [0.01, 1.4] });
        }
        m.descL.forEach((l, i) => T(x, bl + 4.4 + i * 4.2, l, fDesc, est.muted));
        y += m.alto;
      }
    }
    if (!alguno) T(W / 2, yCuerpo + 20, 'Agrega tus platos y aquí aparece tu carta', [est.txt, 'italic', 12], est.muted, 'center');
    return { paginas, W, H, nombre };
  }

  // ---------- Vista previa en SVG ----------
  const NS = 'http://www.w3.org/2000/svg';
  function aSVG(ops, W, H) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'hoja');
    svg.setAttribute('role', 'img');
    for (const o of ops) {
      let el;
      const a = (k, v) => el.setAttribute(k, v);
      if (o.t === 'rect') {
        el = document.createElementNS(NS, 'rect');
        a('x', o.x); a('y', o.y); a('width', o.w); a('height', o.h);
        if (o.r) { a('rx', o.r); a('ry', o.r); }
        a('fill', o.fill || 'none');
        if (o.stroke) { a('stroke', o.stroke); a('stroke-width', o.lw); }
      } else if (o.t === 'line') {
        el = document.createElementNS(NS, 'line');
        a('x1', o.x1); a('y1', o.y1); a('x2', o.x2); a('y2', o.y2);
        a('stroke', o.color); a('stroke-width', o.lw);
        if (o.dash) { a('stroke-dasharray', o.dash.join(' ')); a('stroke-linecap', 'round'); }
      } else if (o.t === 'text') {
        el = document.createElementNS(NS, 'text');
        a('x', o.x); a('y', o.y); a('fill', o.color);
        a('font-family', FAMILIA[o.font]); a('font-size', o.size * PT);
        if (o.style.includes('bold')) a('font-weight', 'bold');
        if (o.style.includes('italic')) a('font-style', 'italic');
        a('text-anchor', { left: 'start', center: 'middle', right: 'end' }[o.align]);
        el.textContent = o.s;
      } else if (o.t === 'img') {
        el = document.createElementNS(NS, 'image');
        a('x', o.x); a('y', o.y); a('width', o.w); a('height', o.h);
        a('preserveAspectRatio', 'none'); a('href', o.src);
      }
      if (el) svg.append(el);
    }
    return svg;
  }

  // ---------- PDF ----------
  const formatoImg = (src) => (/^data:image\/jpe?g/.test(src) ? 'JPEG' : 'PNG');
  function dibujarPDF(doc, ops) {
    for (const o of ops) {
      if (o.t === 'rect') {
        if (o.fill) doc.setFillColor(o.fill);
        if (o.stroke) { doc.setDrawColor(o.stroke); doc.setLineWidth(o.lw); }
        const modo = o.fill && o.stroke ? 'FD' : o.fill ? 'F' : 'S';
        if (o.r) doc.roundedRect(o.x, o.y, o.w, o.h, o.r, o.r, modo); else doc.rect(o.x, o.y, o.w, o.h, modo);
      } else if (o.t === 'line') {
        doc.setDrawColor(o.color); doc.setLineWidth(o.lw);
        doc.setLineCap(o.dash ? 'round' : 'butt');
        doc.setLineDashPattern(o.dash || [], 0);
        doc.line(o.x1, o.y1, o.x2, o.y2);
        doc.setLineDashPattern([], 0);
      } else if (o.t === 'text') {
        doc.setFont(o.font, o.style); doc.setFontSize(o.size); doc.setTextColor(o.color);
        doc.text(o.s, o.x, o.y, { align: o.align });
      } else if (o.t === 'img') {
        doc.addImage(o.src, formatoImg(o.src), o.x, o.y, o.w, o.h, 'logo', 'FAST');
      }
    }
  }
  function aPDF(e) {
    const { paginas, W, H } = componer(e);
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: [W, H], orientation: 'portrait', compress: true });
    paginas.forEach((ops, i) => { if (i) doc.addPage([W, H], 'portrait'); dibujarPDF(doc, ops); });
    doc.setProperties({ title: 'Carta - ' + (limpiar(e.local.nombre) || 'mi local'), creator: 'STPyme - ' + SITIO + '/herramientas/menu-restaurante' });
    return doc;
  }
  const archivo = (e, ext = 'pdf') => 'carta-' + (limpiar(e.local.nombre).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mi-local') + '.' + ext;

  // ---------- QR ----------
  // Devuelve los cuadros oscuros del QR, juntando los que van seguidos en la misma fila.
  function qrTramos(texto) {
    const q = window.qrcode(0, 'M');
    q.addData(texto);
    q.make();
    const n = q.getModuleCount();
    const tramos = [];
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!q.isDark(r, c)) { c++; continue; }
        const ini = c;
        while (c < n && q.isDark(r, c)) c++;
        tramos.push([ini, r, c - ini]);
      }
    }
    return { n, tramos };
  }
  function qrSVG(texto, color = '#111111') {
    const { n, tramos } = qrTramos(texto);
    const svg = document.createElementNS(NS, 'svg');
    const m = 4;
    svg.setAttribute('viewBox', `${-m} ${-m} ${n + 2 * m} ${n + 2 * m}`);
    svg.setAttribute('shape-rendering', 'crispEdges');
    const fondo = document.createElementNS(NS, 'rect');
    fondo.setAttribute('x', -m); fondo.setAttribute('y', -m); fondo.setAttribute('width', n + 2 * m); fondo.setAttribute('height', n + 2 * m); fondo.setAttribute('fill', '#fff');
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', tramos.map(([x, y, w]) => `M${x} ${y}h${w}v1h-${w}z`).join(''));
    p.setAttribute('fill', color);
    svg.append(fondo, p);
    return svg;
  }
  // Imagen PNG lista para imprimir o mandar: nombre del local, el QR y el link.
  function qrPNG(texto, e) {
    const est = estiloDe(e);
    const W = 1200, H = 1560;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = est.acc; g.fillRect(0, 0, W, 28);
    g.textAlign = 'center'; g.fillStyle = '#1d1d1f';
    let tam = 92;
    const nombre = limpiar(e.local.nombre) || 'Nuestra carta';
    do { g.font = `bold ${tam}px ${FAMILIA[est.cab]}`; tam -= 4; } while (g.measureText(nombre).width > W - 140 && tam > 40);
    g.fillText(nombre, W / 2, 190);
    g.font = `600 52px ${FAMILIA.helvetica}`; g.fillStyle = est.acc;
    g.fillText('Escanea y mira nuestra carta', W / 2, 290);
    const { n, tramos } = qrTramos(texto);
    const lado = 860, celda = lado / n, x0 = (W - lado) / 2, y0 = 360;
    g.fillStyle = '#111111';
    for (const [x, y, w] of tramos) g.fillRect(x0 + x * celda, y0 + y * celda, w * celda + 0.6, celda + 0.6);
    g.font = `500 40px ${FAMILIA.helvetica}`; g.fillStyle = '#444444';
    g.fillText(texto.replace(/^https?:\/\//, ''), W / 2, y0 + lado + 110);
    g.font = `400 26px ${FAMILIA.helvetica}`; g.fillStyle = '#8a8a8a';
    g.fillText('Carta digital gratis de ' + SITIO, W / 2, H - 50);
    return c.toDataURL('image/png');
  }
  // Hoja A4 con 4 tarjetas de mesa (para recortar), con el QR en vector para que se imprima nítido.
  function tarjetasPDF(texto, e) {
    const est = estiloDe(e);
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    const W = 210, H = 297, cw = W / 2, ch = H / 2;
    const nombre = limpiar(e.local.nombre) || 'Nuestra carta';
    const { n, tramos } = qrTramos(texto);
    const enlace = limpiar(texto.replace(/^https?:\/\//, ''));
    for (let i = 0; i < 4; i++) {
      const ox = (i % 2) * cw, oy = Math.floor(i / 2) * ch, cx = ox + cw / 2;
      doc.setFillColor(est.acc); doc.rect(ox + 8, oy + 8, cw - 16, 2.5, 'F');
      doc.setTextColor('#1d1d1f'); doc.setFont(est.cab, 'bold');
      let tam = 22;
      doc.setFontSize(tam);
      while (doc.getTextWidth(nombre) > cw - 22 && tam > 11) { tam -= 1; doc.setFontSize(tam); }
      doc.text(nombre, cx, oy + 24, { align: 'center' });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(est.acc);
      doc.text('Escanea y mira nuestra carta', cx, oy + 33, { align: 'center' });
      const lado = 72, celda = lado / n, x0 = cx - lado / 2, y0 = oy + 40;
      doc.setFillColor('#111111');
      for (const [x, y, w] of tramos) doc.rect(x0 + x * celda, y0 + y * celda, w * celda + 0.05, celda + 0.05, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor('#444444');
      doc.text(enlace, cx, y0 + lado + 9, { align: 'center' });
      doc.setFontSize(6.5); doc.setTextColor('#8a8a8a');
      doc.text('Carta digital gratis de ' + SITIO, cx, oy + ch - 8, { align: 'center' });
    }
    doc.setDrawColor('#bbbbbb'); doc.setLineWidth(0.2); doc.setLineDashPattern([2, 2], 0);
    doc.line(cw, 4, cw, H - 4); doc.line(4, ch, W - 4, ch);
    doc.setProperties({ title: 'QR de la carta - ' + nombre, creator: 'STPyme' });
    return doc;
  }

  // Carga un script una sola vez (jsPDF y el QR en la página pública, solo cuando se necesitan).
  const cargados = {};
  const cargar = (src) => (cargados[src] ??= new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => { delete cargados[src]; mal(new Error('No se pudo cargar ' + src)); };
    document.head.append(s);
  }));
  const LIB = {
    pdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    qr: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  };

  window.CartaMotor = { PT, ESTILOS, COLORES, HOJAS, FAMILIA, limpiar, precioTxt, estiloDe, componer, aSVG, aPDF, archivo, qrSVG, qrPNG, tarjetasPDF, cargar, LIB };
})();
