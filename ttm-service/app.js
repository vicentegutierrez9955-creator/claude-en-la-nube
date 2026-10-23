(() => {
  const WA = '56977612133';
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const wa = (texto) => `https://wa.me/${WA}?text=${encodeURIComponent(texto)}`;
  const miles = (n) => n.toLocaleString('es-CL');
  const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hayGsap = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';

  $$('[data-wa]').forEach((a) => { a.href = wa(a.dataset.wa); a.target = '_blank'; a.rel = 'noopener'; });

  /* ---------- Abierto / cerrado (hora de Chile) ---------- */
  const HORARIO = { 1: [9, 18], 2: [9, 18], 3: [9, 18], 4: [9, 18], 5: [9, 18], 6: [9, 13], 0: null };
  function ahoraChile() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Santiago', weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { d: dias[p.weekday], h: (+p.hour % 24) + (+p.minute) / 60 };
  }
  const fmtH = (h) => `${Math.floor(h)}:${h % 1 ? '30' : '00'}`;
  (() => {
    const { d, h } = ahoraChile();
    const hoy = HORARIO[d];
    const abierto = hoy && h >= hoy[0] && h < hoy[1];
    const est = $('#estado');
    est.classList.add(abierto ? 'abierto' : 'cerrado');
    est.querySelector('span').textContent = abierto ? `Abierto · cierra ${fmtH(hoy[1])}` : 'Cerrado ahora';
    $('#estado-hero').textContent = abierto ? `Abierto ahora · hasta las ${fmtH(hoy[1])}` : 'Cerrado ahora · lunes a sábado desde las 9:00';
    $$('#horario tr').forEach((tr) => {
      const dd = +tr.dataset.d;
      if (dd === d || (dd === 1 && d >= 1 && d <= 5)) tr.classList.add('hoy');
    });
  })();

  /* ---------- Cotizador ---------- */
  const rango = (a, b, p) => Array.from({ length: Math.floor((b - a) / p) + 1 }, (_, i) => a + i * p);
  const llenar = (sel, vals, def) => { sel.innerHTML = vals.map((v) => `<option${v === def ? ' selected' : ''}>${v}</option>`).join(''); };
  llenar($('#c-ancho'), rango(155, 285, 10), 205);
  llenar($('#c-perfil'), rango(30, 80, 5), 55);
  llenar($('#c-aro'), rango(13, 21, 1), 16);
  function elegirUno(cont) {
    cont.addEventListener('click', (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      $$('.chip', cont).forEach((c) => c.classList.toggle('on', c === b));
      cotizar();
    });
  }
  elegirUno($('#c-cant')); elegirUno($('#c-pref'));
  $$('#c-extra input').forEach((i) => i.addEventListener('change', () => { i.parentElement.classList.toggle('on', i.checked); cotizar(); }));
  ['#c-ancho', '#c-perfil', '#c-aro'].forEach((s) => $(s).addEventListener('change', cotizar));
  $('#c-auto').addEventListener('input', cotizar);

  function cotizar() {
    const an = +$('#c-ancho').value, pe = +$('#c-perfil').value, aro = +$('#c-aro').value;
    const cant = $('#c-cant .on').dataset.v, pref = $('#c-pref .on').dataset.v;
    const extras = $$('#c-extra input:checked').map((i) => i.value);
    const autoTxt = $('#c-auto').value.trim();
    const costado = Math.round(an * pe / 100), llantaMm = Math.round(aro * 25.4), total = llantaMm + 2 * costado;
    const medida = `${an}/${pe} R${aro}`;
    $('#v-medida').textContent = medida;
    $('#v-dims').innerHTML = `<span>Costado <b>${costado} mm</b></span><span>Llanta <b>${llantaMm} mm</b></span><span>Diámetro total <b>${total} mm</b></span>`;
    // dibujo a escala: el diámetro más grande posible (~860 mm) ocupa todo el círculo
    const k = 140 / 430, rExt = total / 2 * k, rLl = llantaMm / 2 * k;
    const radios = { '#v-ext': rExt, '#v-banda': rExt - 6, '#v-cost': rExt - 18, '#v-llanta': rLl, '#v-centro': rLl - 7 };
    Object.entries(radios).forEach(([s, r]) => {
      if (hayGsap && !reducir) gsap.to(s, { attr: { r }, duration: .6, ease: 'back.out(1.6)' });
      else $(s).setAttribute('r', r);
    });
    let msg = `Hola TTM Service 👋 Quiero cotizar ${cant} neumático${cant === '1' ? '' : 's'} ${medida}, ${pref}.`;
    if (extras.length) msg += ` Con ${extras.join(', ').replace(/, ([^,]*)$/, ' y $1')}.`;
    if (autoTxt) msg += ` Mi auto es un ${autoTxt}.`;
    $('#c-enviar').href = wa(msg);
  }
  cotizar();

  /* ---------- Reserva ---------- */
  const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const res = { serv: null, dia: null, hora: null };
  const servCont = $('#r-serv');
  function elegirServicio(nombre) {
    $$('.chip', servCont).forEach((c) => c.classList.toggle('on', c.textContent === nombre));
    res.serv = nombre; resumen();
  }
  servCont.addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) elegirServicio(b.textContent); });
  $$('[data-servicio]').forEach((b) => b.addEventListener('click', () => {
    elegirServicio(b.dataset.servicio);
    $('#reserva').scrollIntoView({ behavior: reducir ? 'auto' : 'smooth' });
  }));

  const diasCont = $('#r-dias');
  const hoy = new Date();
  const fechas = [];
  for (let i = 0; fechas.length < 10; i++) {
    const f = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
    if (f.getDay() !== 0) fechas.push(f);
  }
  diasCont.innerHTML = fechas.map((f, i) => `<button type="button" class="dia" data-i="${i}"><small>${i === 0 && f.getDay() === hoy.getDay() ? 'Hoy' : DIAS[f.getDay()]}</small><b>${f.getDate()}</b></button>`).join('');
  diasCont.addEventListener('click', (e) => {
    const b = e.target.closest('.dia'); if (!b) return;
    $$('.dia', diasCont).forEach((d) => d.classList.toggle('on', d === b));
    res.dia = fechas[+b.dataset.i]; res.hora = null;
    pintarHoras(); resumen();
  });
  // horas ocupadas de ejemplo, siempre las mismas para el mismo día
  const ocupada = (f, h) => ((f.getDate() * 7 + f.getMonth() * 3 + h * 5) % 9) < 3;
  function pintarHoras() {
    const f = res.dia, cierre = f.getDay() === 6 ? 12.5 : 17.5;
    const esHoy = f.toDateString() === hoy.toDateString();
    const ahora = hoy.getHours() + hoy.getMinutes() / 60;
    const horas = [];
    for (let h = 9; h <= cierre; h += .5) horas.push(h);
    $('#r-horas').innerHTML = horas.map((h) => {
      const no = ocupada(f, h * 2) || (esHoy && h <= ahora + .5);
      return `<button type="button" class="hora" data-h="${h}" ${no ? 'disabled' : ''}>${fmtH(h)}</button>`;
    }).join('');
    if (hayGsap && !reducir) gsap.from('#r-horas .hora', { y: 12, opacity: 0, duration: .3, stagger: .02, ease: 'power2.out' });
  }
  $('#r-horas').addEventListener('click', (e) => {
    const b = e.target.closest('.hora'); if (!b || b.disabled) return;
    $$('.hora', $('#r-horas')).forEach((x) => x.classList.toggle('on', x === b));
    res.hora = +b.dataset.h; resumen();
  });
  ['#r-nombre', '#r-patente', '#r-tel'].forEach((s) => $(s).addEventListener('input', resumen));
  const fechaLarga = (f) => `${DIAS_LARGOS[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]}`;
  function resumen() {
    const nombre = $('#r-nombre').value.trim(), patente = $('#r-patente').value.trim().toUpperCase();
    $('#s-serv').textContent = res.serv || '—';
    $('#s-dia').textContent = res.dia ? fechaLarga(res.dia) : '—';
    $('#s-hora').textContent = res.hora != null ? fmtH(res.hora) : '—';
    $('#s-nombre').textContent = nombre || '—';
    $('#s-patente').textContent = patente || '—';
    const ok = res.serv && res.dia && res.hora != null && nombre;
    $('#r-confirmar').disabled = !ok;
    $('#r-falta').style.display = ok ? 'none' : '';
  }
  $('#r-confirmar').addEventListener('click', () => {
    const nombre = $('#r-nombre').value.trim(), patente = $('#r-patente').value.trim().toUpperCase(), tel = $('#r-tel').value.trim();
    const cuando = `el ${fechaLarga(res.dia)} a las ${fmtH(res.hora)}`;
    $('#l-nombre').textContent = nombre.split(' ')[0];
    $('#l-texto').textContent = `Tu hora para ${res.serv.toLowerCase()} quedó ${cuando}. Te esperamos en Av. Vicuña Mackenna 609.`;
    let msg = `Hola TTM Service 👋 Reservé una hora en la web: ${res.serv}, ${cuando}. Nombre: ${nombre}.`;
    if (patente) msg += ` Patente: ${patente}.`;
    if (tel) msg += ` Teléfono: ${tel}.`;
    $('#l-wa').href = wa(msg);
    $('#res-form').style.display = 'none';
    $('#res-listo').style.display = 'block';
    if (hayGsap && !reducir) {
      gsap.timeline()
        .from('#res-listo', { scale: .9, opacity: 0, duration: .35, ease: 'back.out(2)' })
        .fromTo('#ok-c', { attr: { 'stroke-dasharray': '0 1' } }, { attr: { 'stroke-dasharray': '1 0' }, duration: .5, ease: 'power2.out' }, '<.1')
        .fromTo('#ok-p', { attr: { 'stroke-dasharray': '0 1' } }, { attr: { 'stroke-dasharray': '1 0' }, duration: .35, ease: 'power2.out' }, '-=.15');
    }
    if (innerWidth < 900) $('#resumen').scrollIntoView({ behavior: reducir ? 'auto' : 'smooth', block: 'center' });
  });
  $('#l-otra').addEventListener('click', () => { $('#res-listo').style.display = 'none'; $('#res-form').style.display = ''; });

  /* ---------- Cuándo me toca ---------- */
  const TAREAS = [
    { n: 'Cambio de aceite y filtros', cada: 10000, serv: 'Mantención (aceite y filtros)' },
    { n: 'Revisión de frenos', cada: 20000, serv: 'Frenos y pastillas' },
    { n: 'Revisión de suspensión', cada: 20000, serv: 'Suspensión y amortiguadores' },
    { n: 'Alineación y balanceo', cada: 10000, serv: 'Alineación y balanceo' },
    { n: 'Revisión general', cada: 15000, serv: 'Revisión general' },
  ];
  $('#barras').innerHTML = TAREAS.map((t) => `<div class="barra"><div class="top"><span>${t.n}</span><span></span></div><div class="riel"><div class="lleno"></div></div></div>`).join('');
  const color = (p) => p < .6 ? '#2bd576' : p < .9 ? '#fdcc17' : '#ff4d2e';
  function km() {
    const v = +$('#km').value;
    $('#km-v').textContent = miles(v);
    $$('#barras .barra').forEach((b, i) => {
      const t = TAREAS[i], p = Math.min(v / t.cada, 1), falta = t.cada - v;
      b.classList.toggle('toca-ya', falta <= 0);
      b.querySelector('.top span:last-child').textContent = falta <= 0 ? '¡Ya te toca!' : `faltan ${miles(falta)} km`;
      const l = b.querySelector('.lleno');
      if (hayGsap && !reducir) gsap.to(l, { width: `${p * 100}%`, backgroundColor: color(p), duration: .5, ease: 'power3.out' });
      else { l.style.width = `${p * 100}%`; l.style.background = color(p); }
    });
  }
  $('#km').addEventListener('input', km);
  $('#km-agendar').addEventListener('click', () => {
    const v = +$('#km').value;
    const urgente = TAREAS.map((t) => ({ ...t, p: v / t.cada })).sort((a, b) => b.p - a.p)[0];
    elegirServicio(urgente.serv);
    $('#reserva').scrollIntoView({ behavior: reducir ? 'auto' : 'smooth' });
  });

  /* ---------- Movimiento ---------- */
  if (!hayGsap || reducir) {
    document.documentElement.classList.remove('anima');
    km();
    $$('.hito').forEach((h) => h.classList.add('hecho'));
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  // Portada: el auto entra andando desde la izquierda y frena suave hasta detenerse
  const auto = $('#auto-hero'), ruedas = ['#rd-1', '#rd-2'].map((id) => $(id));
  const distancia = () => auto.getBoundingClientRect().right + 80;
  // la rueda mide ~15% del largo del auto: los giros calzan con lo que avanza
  const vueltas = (px) => px / (auto.getBoundingClientRect().width * .149 * Math.PI) * 360;
  const hero = gsap.timeline({ defaults: { ease: 'power3.out' } });
  hero.from('.hero-fondo img', { scale: 1.12, opacity: 0, duration: 1.8, ease: 'power2.out' }, 0)
      .from('#titulo .l span', { yPercent: 110, duration: .8, stagger: .12 }, 0)
      .from('.hero .kicker, .hero p.lead, .hero .cta-row, .datos-hero', { y: 24, opacity: 0, duration: .6, stagger: .08 }, .55)
      .from(auto, { x: () => -distancia(), duration: 2.4, ease: 'power2.out' }, .1)
      .from(ruedas, { rotation: () => -vueltas(distancia()), duration: 2.4, ease: 'power2.out' }, .1);
  document.documentElement.classList.remove('anima');
  // al bajar, el auto avanza un poco y la línea de la calle corre
  gsap.to('.hero-fondo img', { yPercent: 12, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: .6 } });
  gsap.to(auto, { x: 90, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: .6 } });
  gsap.to(ruedas, { rotation: () => `+=${vueltas(90)}`, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: .6 } });
  gsap.fromTo('#linea', { backgroundPositionX: 0 }, { backgroundPositionX: -480, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: .6 } });

  // Títulos y tarjetas aparecen al entrar
  $$('.revela').forEach((el) => gsap.from(el.children, { y: 34, opacity: 0, duration: .7, stagger: .1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 82%' } }));
  ScrollTrigger.batch('.serv', { start: 'top 88%', onEnter: (els) => gsap.from(els, { y: 50, opacity: 0, duration: .7, stagger: .12, ease: 'power3.out' }) });
  gsap.fromTo('.mec-foto img', { yPercent: -10 }, { yPercent: 0, ease: 'none', scrollTrigger: { trigger: '.mec-foto', start: 'top bottom', end: 'bottom top', scrub: .5 } });
  gsap.from('.mec-foto', { clipPath: 'inset(0 100% 0 0 round 18px)', duration: 1.1, ease: 'power3.inOut', scrollTrigger: { trigger: '.mec', start: 'top 80%' } });
  gsap.from('.sello', { scale: 0, rotation: -25, duration: .5, ease: 'back.out(2.2)', delay: .8, scrollTrigger: { trigger: '.mec', start: 'top 80%' } });
  gsap.from('.mec-lista li', { x: -24, opacity: 0, duration: .45, stagger: .07, ease: 'power3.out', scrollTrigger: { trigger: '.mec-lista', start: 'top 85%' } });
  gsap.from('.cotiza .panel', { y: 40, opacity: 0, duration: .7, stagger: .15, ease: 'power3.out', scrollTrigger: { trigger: '.cotiza', start: 'top 82%' } });
  gsap.from('.reserva .panel', { y: 40, opacity: 0, duration: .7, stagger: .15, ease: 'power3.out', scrollTrigger: { trigger: '.reserva', start: 'top 82%' } });
  gsap.from('.faq details', { y: 24, opacity: 0, duration: .5, stagger: .08, ease: 'power2.out', scrollTrigger: { trigger: '.faq', start: 'top 85%' } });
  gsap.from('.ubica > *', { y: 40, opacity: 0, duration: .7, stagger: .15, ease: 'power3.out', scrollTrigger: { trigger: '.ubica', start: 'top 82%' } });

  // Barras de "¿cuándo me toca?" se llenan al aparecer
  ScrollTrigger.create({ trigger: '#toca', start: 'top 70%', once: true, onEnter: km });

  // Camino entre los pasos
  gsap.to('#camino', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: '#pasos', start: 'top 75%', end: 'bottom 55%', scrub: .5 } });
  gsap.from('.paso', { y: 40, opacity: 0, duration: .6, stagger: .15, ease: 'back.out(1.6)', scrollTrigger: { trigger: '#pasos', start: 'top 80%' } });

  // Seguimiento: el auto avanza por los estados y llega el aviso de WhatsApp
  const hitos = $$('.hito');
  const seg = gsap.timeline({ repeat: -1, repeatDelay: 1.2, paused: true });
  seg.add(() => hitos.forEach((h) => h.classList.remove('hecho'))).set('#lt-avance', { height: 0 }).set('#aviso', { opacity: 0, y: -30 });
  hitos.forEach((h, i) => {
    seg.to('#lt-avance', { height: () => h.offsetTop + 10, duration: .7, ease: 'power2.inOut' }, i ? '+=.5' : 0)
       .add(() => h.classList.add('hecho'))
       .from(h, { x: -8, duration: .3, ease: 'back.out(3)' });
  });
  seg.to('#aviso', { opacity: 1, y: 0, duration: .5, ease: 'back.out(1.8)' }, '+=.2').to('#aviso', { opacity: 0, y: -30, duration: .4, ease: 'power2.in' }, '+=2.2');
  ScrollTrigger.create({ trigger: '#seguimiento', start: 'top 75%', end: 'bottom top', onToggle: (s) => s.isActive ? seg.play() : seg.pause() });

})();
