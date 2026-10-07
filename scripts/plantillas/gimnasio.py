"""Plantilla para gimnasios.

Uso:  python3 scripts/plantillas/gimnasio.py [ficha.json]
Sin ficha usa datos/gimnasio-demo.json. La carpeta de salida es el "slug" de la ficha.
"""
from comun import (cargar, e, ic, px, wa, tel, estrellas, tbd, head, aviso_demo, cabecera,
                   resenas, preguntas, contacto, pie, config_js, escribir, DIAS)

d = cargar('gimnasio-demo.json')
N, C = d['nombre_corto'], d['comuna']
PRUEBA = f'Hola, quiero agendar mi clase de prueba gratis en {N}. ¿Qué horarios tienen?'
FUENTES = 'https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700;800&family=Barlow+Condensed:wght@700;800&display=swap'
clp = lambda n: '$' + f'{round(n):,}'.replace(',', '.')

h = head(d, f'Gimnasio en {C} | {d["nombre"]}',
         f'Gimnasio en {C} con máquinas, peso libre y clases de funcional, spinning, yoga y box. Precios claros y clase de prueba gratis.',
         FUENTES)
h += aviso_demo(d)
h += cabecera(d, 'i-dumbbell', [('planes', 'Planes'), ('clases', 'Clases'), ('instalaciones', 'Instalaciones'), ('contacto', 'Ubicación')],
              'gratis', 'Clase de prueba', PRUEBA)

datos = ''.join(f'<div class="fact">{ic(i)}<div><b>{e(t)}</b><span>{e(s)}</span></div></div>' for i, t, s in d['datos'])
h += f'''
<main id="inicio">

  <section class="hero" aria-labelledby="hero-title">
    <div class="wrap">
      <div>
        <span class="status" id="status"><i></i>Horario</span>
        <h1 id="hero-title">Gimnasio en {e(C)}: entrena con <em>guía desde el primer día</em></h1>
        <p class="lead">Máquinas, peso libre y más de 40 clases a la semana. Te armamos un plan según tu objetivo y nunca entrenas solo.</p>
        <div class="cta-row">
          <a class="btn btn-primary" href="{wa(d, PRUEBA)}" target="_blank" rel="noopener">{ic('i-zap')}Agenda tu clase gratis</a>
          <a class="btn btn-ghost" href="#planes">Ver planes y precios</a>
        </div>
        <ul class="trust">
          <li>{estrellas()}<a href="#resenas" style="color:inherit">{e(d['google']['nota'])} · {e(d['google']['cantidad'])} reseñas</a></li>
          <li>{ic('i-clock')}Abierto de {e(d['horario'][0][0])} a {e(d['horario'][0][1])}</li>
          <li>{ic('i-users')}Clases incluidas en tu plan</li>
          <li>{ic('i-award')}Profesores titulados</li>
        </ul>
      </div>
      <div class="hero-media">
        <div class="ph hero-ph"><img src="{px(d['fotos']['hero'], 900)}" alt="{e(d['fotos']['hero_alt'])}" width="520" height="650" fetchpriority="high"></div>
        {f'<span class="promo">{ic("i-flame")}{e(d["promo"])}</span>' if d.get('promo') else ''}
      </div>
    </div>
  </section>

  <div class="facts"><div class="wrap">{datos}</div></div>
'''

# Planes
def plan(p):
    top = ' top' if p.get('top') else ''
    items = ''.join(f'<li>{ic("i-check")}{e(i)}</li>' for i in p['items'])
    mes = f'<small class="pm" data-base="{p["precio"]}" data-meses="{p["meses"]}">{clp(p["precio"] / p["meses"])} al mes</small>' if p['meses'] > 1 else '<small class="pm">&nbsp;</small>'
    nota = f'<span class="badge">{e(p["nota"])}</span>' if p.get('nota') else ''
    return f'''<article class="plan{top}" data-plan="{e(p['t'])}">{nota}
          <h3>{e(p['t'])}</h3>
          <p class="amount" data-base="{p['precio']}">{clp(p['precio'])}</p>{mes}
          <ul>{items}</ul>
          <a class="btn {'btn-primary' if top else 'btn-ghost'} plan-btn" href="{wa(d, f'Hola, quiero inscribirme en el plan {p["t"]} de {N}. ¿Cómo lo hago?')}" target="_blank" rel="noopener">Quiero este plan</a>
        </article>'''

planes = ''.join(plan(p) for p in d['planes'])
letra = ''.join(f'<li>{ic("i-check")}{e(x)}</li>' for x in d['letra_chica'])
h += f'''
  <section id="planes" aria-labelledby="plans-title">
    <div class="wrap">
      <div class="section-head reveal">
        <span class="kicker">Planes</span>
        <h2 id="plans-title">Elige cómo quieres entrenar{tbd(d, 'Valores de ejemplo')}</h2>
        <p>Todos los planes incluyen sala de máquinas y clases grupales. Matrícula {clp(d['matricula'])}{f" · <b style='color:var(--brand-text)'>{e(d['promo'].lower())}</b>" if d.get('promo') else ''}.</p>
      </div>
      <div class="tabs reveal" role="tablist" aria-label="Tipo de precio" id="tarifa">
        <button class="tab" role="tab" aria-selected="true" data-d="0">Precio general</button>
        <button class="tab" role="tab" aria-selected="false" data-d="{d['descuento']}">Estudiante o adulto mayor (-{d['descuento']}%)</button>
      </div>
      <div class="plans reveal">{planes}</div>
      <div class="fine-print reveal">
        <h3>Sin letra chica</h3>
        <ul>{letra}</ul>
      </div>
    </div>
  </section>
'''

# Clases y horario
disc = ''.join(f'''<button type="button" class="disc" data-k="{e(x['k'])}"><span class="thumb"><img src="{px(x['foto'], 500)}" alt="{e(x['alt'])}" width="400" height="300" loading="lazy" onerror="this.remove()"></span><span class="dtxt"><b>{e(x['k'])}</b><small>{e(x['d'])}</small></span></button>''' for x in d['disciplinas'])
dias = ''.join(f'<button class="tab" role="tab" aria-selected="false" data-dia="{i}">{DIAS[i][:3]}</button>' for i in range(7))
filtros = '<button class="chip-f" aria-pressed="true" data-k="">Todas</button>' + ''.join(f'<button class="chip-f" aria-pressed="false" data-k="{e(x["k"])}">{e(x["k"])}</button>' for x in d['disciplinas'])
h += f'''
  <section id="clases" class="alt" aria-labelledby="class-title">
    <div class="wrap">
      <div class="section-head reveal">
        <span class="kicker">Clases grupales</span>
        <h2 id="class-title">Más de 40 clases a la semana, incluidas en tu plan</h2>
        <p>Elige una disciplina para ver sus horarios. Reserva tu cupo por WhatsApp en un toque.</p>
      </div>
      <div class="discs reveal">{disc}</div>
      <div class="sched reveal" id="horario">
        <div class="sched-top">
          <div class="tabs" role="tablist" aria-label="Día" id="dias">{dias}</div>
          <div class="chips" id="filtros">{filtros}</div>
        </div>
        <ul class="slots" id="slots" aria-live="polite"></ul>
        <p class="note">Horario de ejemplo. Los cupos son limitados: reserva antes de venir.</p>
      </div>
    </div>
  </section>
'''

# ¿Qué quieres lograr?
obj = [('bajar', 'Bajar de peso', 'Quemar grasa y sentirme mejor'), ('musculo', 'Ganar músculo', 'Fuerza y definición'),
       ('salud', 'Salud y movilidad', 'Moverme sin dolor'), ('rendimiento', 'Rendimiento', 'Mejorar en mi deporte')]
dd = [('2', '2 días', 'a la semana'), ('3', '3 días', 'a la semana'), ('5', '4 o 5 días', 'a la semana')]
niv = [('nunca', 'Nunca he entrenado', 'Parto de cero'), ('algo', 'He entrenado algo', 'Pero hace tiempo'), ('seguido', 'Entreno seguido', 'Quiero más')]
opts = lambda lst, attr: ''.join(f'<button type="button" class="opt" aria-pressed="false" data-{attr}="{k}">{e(t)}<small>{e(s)}</small></button>' for k, t, s in lst)
h += f'''
  <section id="objetivo" aria-labelledby="goal-title">
    <div class="wrap">
      <div class="section-head reveal">
        <span class="kicker">Tu plan en 10 segundos</span>
        <h2 id="goal-title">¿Qué quieres lograr?</h2>
        <p>Cuéntanos tu objetivo y te mostramos una semana tipo y el plan que más te conviene.</p>
      </div>
      <div class="tool reveal">
        <div class="panel">
          <div class="step"><h3><i>1</i>Tu objetivo</h3><div class="opts opts-2" id="g-obj">{opts(obj, 'o')}</div></div>
          <div class="step"><h3><i>2</i>¿Cuántos días puedes venir?</h3><div class="opts" id="g-dias">{opts(dd, 'd')}</div></div>
          <div class="step"><h3><i>3</i>Tu experiencia</h3><div class="opts" id="g-niv">{opts(niv, 'n')}</div></div>
        </div>
        <aside class="result" aria-live="polite">
          <span class="kicker">Tu semana tipo</span>
          <h3 id="g-title">Elige tu objetivo</h3>
          <p id="g-text">Marca las tres preguntas y te armamos una propuesta.</p>
          <ul class="list-plain" id="g-week"></ul>
          <div class="bubble"><small>Mensaje que nos llega</small><span id="g-msg">{e(PRUEBA)}</span></div>
          <a class="btn btn-primary" id="g-wa" href="{wa(d, PRUEBA)}" target="_blank" rel="noopener">{ic('i-wa', True)}Agendar clase de prueba</a>
          <span class="fine">Tu profesor ajusta el plan en la evaluación inicial.</span>
        </aside>
      </div>
    </div>
  </section>
'''

# Instalaciones, equipo y primera vez
gal = ''.join(f'<figure><img src="{px(f, 700)}" alt="{e(t)}" width="600" height="450" loading="lazy" onerror="this.remove()"><figcaption>{e(t)}</figcaption></figure>' for f, t in d['galeria'])
team = ''.join(f'<article class="member"><span class="avatar">{e(m["i"])}</span><div><h3>{e(m["n"])}</h3><p>{e(m["r"])}</p></div></article>' for m in d['equipo'])
h += f'''
  <section id="instalaciones" class="alt" aria-labelledby="gal-title">
    <div class="wrap">
      <div class="section-head reveal">
        <span class="kicker">Instalaciones</span>
        <h2 id="gal-title">Todo lo que necesitas para entrenar</h2>
        <p>Sala de máquinas, peso libre, zona de cardio, salas para clases, duchas y lockers.</p>
      </div>
      <div class="gallery reveal">{gal}</div>
    </div>
  </section>

  <section aria-labelledby="team-title">
    <div class="wrap">
      <div class="section-head reveal">
        <span class="kicker">Tu equipo</span>
        <h2 id="team-title">Aquí nadie entrena solo{tbd(d)}</h2>
        <p>Profesores titulados en la sala y en cada clase, para corregirte la técnica y ayudarte a avanzar.</p>
      </div>
      <div class="team reveal">{team}</div>
      <div class="section-head center reveal" style="margin-top:64px">
        <span class="kicker">¿Primera vez en un gimnasio?</span>
        <h2>Partir es más fácil de lo que crees</h2>
      </div>
      <div class="steps3 reveal">
        <article><h3>Agenda tu prueba</h3><p>Escríbenos por WhatsApp y elige el día. La primera clase es gratis y sin compromiso.</p></article>
        <article><h3>Evaluación inicial</h3><p>Conversamos tu objetivo, revisamos cómo te mueves y vemos si tienes alguna lesión.</p></article>
        <article><h3>Tu plan</h3><p>Te armamos una rutina a tu medida y te acompañamos las primeras semanas en la sala.</p></article>
      </div>
    </div>
  </section>
'''

h += resenas(d, f'Socios de {C} que ya entrenan con nosotros', 'Lo que dicen nuestros socios')
h += preguntas(d, [
    ('¿Tengo que firmar un contrato de permanencia?', 'No. El plan mensual no tiene permanencia. Los planes más largos te dan un mejor precio por mes.'),
    ('¿Nunca he entrenado, puedo ir igual?', 'Claro. Partimos con una evaluación y un profesor te enseña la técnica de cada ejercicio. Muchos de nuestros socios partieron de cero.'),
    ('¿Puedo congelar mi plan?', 'Sí, en los planes semestral y anual. Si te enfermas o viajas, lo pausas y no pierdes tus días.'),
    ('¿Qué llevo a la clase de prueba?', 'Ropa cómoda, zapatillas, una toalla y una botella de agua. Si tienes alguna lesión, cuéntanos al agendar.'),
    ('¿Desde qué edad se puede entrenar?', 'Desde los 15 años con autorización de un adulto responsable. Para menores armamos rutinas adaptadas.'),
    ('¿Qué medios de pago aceptan?', 'Efectivo, transferencia, débito y crédito.'),
])
h += contacto(d, 'Tu primera clase es gratis', 'Ven a probar sin compromiso',
              f'Escríbenos y agenda tu clase de prueba en {C}. Te mostramos el gimnasio y te armamos tu plan.', 'Agendar clase gratis', PRUEBA)
h += pie(d, [('Clases', '<br>'.join(e(x['k']) for x in d['disciplinas'][:4])),
             ('Contacto', f'{e(d["direccion"])}, {e(C)}<br><a href="{wa(d, PRUEBA)}" target="_blank" rel="noopener">WhatsApp {e(d.get("telefono_txt", ""))}</a>')],
         'Clase de prueba gratis', PRUEBA)

SEMANA = {
    'bajar': ['Spinning', 'Funcional', 'Máquinas y cardio', 'Zumba', 'Funcional'],
    'musculo': ['Pierna y glúteo en máquinas', 'Pecho y espalda', 'Hombros y brazos', 'Pierna con peso libre', 'Funcional'],
    'salud': ['Yoga', 'Funcional suave', 'Máquinas y caminata', 'Yoga', 'Movilidad'],
    'rendimiento': ['Funcional', 'Box', 'Fuerza con peso libre', 'Spinning', 'Box'],
}
DIAS_SEM = {'2': ['Lunes', 'Jueves'], '3': ['Lunes', 'Miércoles', 'Viernes'], '5': ['Lunes', 'Martes', 'Jueves', 'Viernes', 'Sábado']}
extra = {
    'nombre': N, 'icons': '{B}/icons.svg', 'clases': d['clases'], 'dias': DIAS, 'semana': SEMANA, 'diasSem': DIAS_SEM,
    'objTxt': {'bajar': 'bajar de peso', 'musculo': 'ganar músculo', 'salud': 'mejorar mi salud y movilidad', 'rendimiento': 'mejorar mi rendimiento'},
    'nivTxt': {'nunca': 'Partimos con técnica básica y cargas suaves las primeras dos semanas.', 'algo': 'Retomamos de a poco y en un mes subimos la intensidad.', 'seguido': 'Subimos la intensidad desde el inicio y medimos tu progreso cada mes.'},
}
js = r'''
  var fmt = function (n) { return "$" + (Math.round(n / 10) * 10).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."); };
  // Planes: precio general o con descuento
  var tarifa = $("tarifa");
  if (tarifa) tarifa.addEventListener("click", function (ev) {
    var b = ev.target.closest(".tab"); if (!b) return;
    tarifa.querySelectorAll(".tab").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
    var dc = +b.getAttribute("data-d"), k = 1 - dc / 100;
    document.querySelectorAll(".plan").forEach(function (p) {
      var a = p.querySelector(".amount"), base = +a.getAttribute("data-base"), pm = p.querySelector(".pm[data-meses]");
      a.textContent = fmt(base * k);
      if (pm) pm.textContent = fmt(base * k / +pm.getAttribute("data-meses")) + " al mes";
      var msg = "Hola, quiero inscribirme en el plan " + p.getAttribute("data-plan") + " de " + C.nombre + (dc ? " con precio de estudiante o adulto mayor" : "") + ". ¿Cómo lo hago?";
      p.querySelector(".plan-btn").href = WA(msg);
    });
  });
  // Horario de clases
  var dia = (new Date().getDay() + 6) % 7, filtro = "";
  function pinta() {
    document.querySelectorAll("#dias .tab").forEach(function (t) { t.setAttribute("aria-selected", +t.getAttribute("data-dia") === dia ? "true" : "false"); });
    document.querySelectorAll("#filtros .chip-f").forEach(function (c) { c.setAttribute("aria-pressed", c.getAttribute("data-k") === filtro ? "true" : "false"); });
    var hoy = C.clases.filter(function (c) { return c[0] === dia && (!filtro || c[2] === filtro); });
    $("slots").innerHTML = hoy.length ? hoy.map(function (c) {
      var msg = "Hola, quiero reservar un cupo en " + c[2] + " el " + C.dias[c[0]].toLowerCase() + " a las " + c[1] + " en " + C.nombre + ".";
      return '<li><span class="t">' + c[1] + '</span><span class="n"><b>' + c[2] + '</b><small>Con ' + c[3] + ' · ' + c[4] + ' min</small></span><a class="btn btn-ghost btn-sm" href="' + WA(msg) + '" target="_blank" rel="noopener">Reservar</a></li>';
    }).join("") : '<li class="empty">No hay clases de ' + (filtro || "este tipo") + ' este día. Prueba con otro día.</li>';
  }
  if ($("slots")) {
    $("dias").addEventListener("click", function (ev) { var t = ev.target.closest(".tab"); if (t) { dia = +t.getAttribute("data-dia"); pinta(); } });
    $("filtros").addEventListener("click", function (ev) { var c = ev.target.closest(".chip-f"); if (c) { filtro = c.getAttribute("data-k"); pinta(); } });
    document.querySelectorAll(".disc").forEach(function (b) {
      b.addEventListener("click", function () { filtro = b.getAttribute("data-k"); pinta(); $("horario").scrollIntoView({ behavior: "smooth", block: "start" }); });
    });
    pinta();
  }
  // ¿Qué quieres lograr?
  var g = { o: "", d: "", n: "" };
  if ($("g-obj")) {
    single($("g-obj"), function (b) { g.o = b ? b.getAttribute("data-o") : ""; plan(); });
    single($("g-dias"), function (b) { g.d = b ? b.getAttribute("data-d") : ""; plan(); });
    single($("g-niv"), function (b) { g.n = b ? b.getAttribute("data-n") : ""; plan(); });
  }
  function plan() {
    var ok = g.o && g.d, week = $("g-week");
    if (!ok) { $("g-title").textContent = g.o ? "¿Cuántos días puedes venir?" : "Elige tu objetivo"; $("g-text").textContent = "Marca las tres preguntas y te armamos una propuesta."; week.innerHTML = ""; }
    else {
      var dias = C.diasSem[g.d], act = C.semana[g.o];
      var rec = g.d === "2" ? "Plan Mensual" : "Plan Trimestral";
      $("g-title").textContent = "Te recomendamos el " + rec;
      $("g-text").textContent = (g.n ? C.nivTxt[g.n] + " " : "") + "Así podría ser tu semana:";
      week.innerHTML = dias.map(function (x, i) { return '<li><svg class="icon"><use href="' + C.icons + '#i-check"/></svg><span><b>' + x + ':</b> ' + act[i] + '</span></li>'; }).join("");
    }
    var msg = "Hola, quiero agendar mi clase de prueba gratis en " + C.nombre + ".";
    if (g.o) msg += " Mi objetivo es " + C.objTxt[g.o] + ".";
    if (g.d) msg += " Puedo ir " + (g.d === "5" ? "4 o 5" : g.d) + " días a la semana.";
    if (g.n === "nunca") msg += " Nunca he entrenado.";
    msg += " ¿Qué horarios tienen?";
    $("g-msg").textContent = msg;
    $("g-wa").href = WA(msg);
  }
'''
h += config_js(d, extra)
h += '<script src="{B}/app.js"></script>\n</body>\n</html>\n'

CSS = '''
/* Gimnasio */
.hero h1{font-size:clamp(42px,7.2vw,78px);line-height:.98}
.promo{position:absolute;left:-8px;bottom:24px;display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:#fff;font-weight:800;padding:12px 18px;border-radius:14px;box-shadow:var(--shadow)}
.promo .icon{width:20px;height:20px}
.facts{border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--surface-2)}
.facts .wrap{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;padding-top:22px;padding-bottom:22px}
.fact{display:flex;gap:12px;align-items:center}
.fact .icon{width:34px;height:34px;padding:7px;border-radius:10px;background:var(--brand-soft);color:var(--brand-text)}
.fact b{display:block;font-size:15.5px}
.fact span{display:block;font-size:13.5px;color:var(--muted)}
.plans{display:grid;gap:14px}
.plan{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:26px 22px;display:flex;flex-direction:column}
.plan.top{border:2px solid var(--brand);box-shadow:0 30px 60px -36px rgba(200,240,49,.55)}
.plan h3{margin:0;font-size:24px}
.plan .badge{position:absolute;top:-12px;right:18px;background:var(--surface-2);border:1px solid var(--line);color:var(--muted);font-size:12px;font-weight:800;padding:3px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em}
.plan.top .badge{background:var(--brand);border-color:var(--brand);color:var(--on-brand)}
.amount{font-family:var(--font-head);font-size:44px;font-weight:800;line-height:1;margin:12px 0 4px}
.pm{color:var(--muted);font-size:14px;font-weight:600}
.plan ul{list-style:none;margin:18px 0 22px;padding:0;display:grid;gap:9px}
.plan li{display:flex;gap:9px;font-size:15px;color:var(--muted)}
.plan li .icon{width:18px;height:18px;margin-top:3px;color:var(--brand-text)}
.plan .btn{margin-top:auto}
.fine-print{margin-top:22px;background:var(--surface);border:1px dashed var(--line);border-radius:var(--radius);padding:20px 22px}
.fine-print h3{margin:0 0 10px;font-size:20px}
.fine-print ul{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.fine-print li{display:flex;gap:9px;color:var(--muted);font-size:15px}
.fine-print .icon{width:18px;height:18px;margin-top:3px;color:var(--brand-text)}
.discs{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:22px}
.disc{all:unset;box-sizing:border-box;cursor:pointer;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden;display:flex;flex-direction:column;transition:border-color .15s ease}
.disc:hover,.disc:focus-visible{border-color:var(--brand)}
.disc .thumb{aspect-ratio:4/3;background:var(--brand-soft);overflow:hidden}
.disc img{width:100%;height:100%;object-fit:cover}
.dtxt{padding:12px 14px}
.dtxt b{display:block;font-family:var(--font-head);text-transform:uppercase;font-size:20px;letter-spacing:.01em}
.dtxt small{color:var(--muted);font-size:13.5px}
.sched{background:var(--surface);border:1px solid var(--line);border-radius:24px;padding:20px}
.sched-top{display:grid;gap:12px;margin-bottom:8px}
.sched .tabs{margin:0}
.sched .tab{padding:8px 13px}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chip-f{all:unset;box-sizing:border-box;cursor:pointer;padding:6px 13px;border-radius:999px;border:1px solid var(--line);font-size:14px;font-weight:700;color:var(--muted)}
.chip-f[aria-pressed="true"]{border-color:var(--brand);color:var(--brand-text);background:var(--brand-soft)}
.chip-f:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.slots{list-style:none;margin:0;padding:0}
.slots li{display:flex;align-items:center;gap:14px;padding:14px 4px;border-bottom:1px solid var(--line)}
.slots li:last-child{border-bottom:0}
.slots .t{font-family:var(--font-head);font-size:24px;font-weight:800;min-width:64px;color:var(--brand-text)}
.slots .n{flex:1}
.slots .n b{display:block;font-size:16.5px}
.slots .n small{color:var(--muted)}
.slots .empty{color:var(--muted);justify-content:center}
.opts-2{grid-template-columns:repeat(2,minmax(0,1fr))!important}
.list-plain li span b{color:#fff}
.gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.gallery figure{margin:0;position:relative;aspect-ratio:4/3;border-radius:16px;overflow:hidden;background:var(--brand-soft)}
.gallery img{width:100%;height:100%;object-fit:cover}
.gallery figcaption{position:absolute;inset:auto 0 0 0;padding:26px 12px 10px;background:linear-gradient(transparent,rgba(0,0,0,.8));color:#fff;font-weight:800;font-size:14.5px}
.result .bubble small{color:#15803d}
@media (max-width:639px){.fact{flex-direction:column;align-items:flex-start;gap:8px}}
@media (min-width:640px){
  .facts .wrap{grid-template-columns:repeat(4,1fr)}
  .plans{grid-template-columns:repeat(2,1fr)}
  .discs{grid-template-columns:repeat(5,1fr)}
  .gallery{grid-template-columns:repeat(3,1fr);gap:14px}
}
@media (min-width:1000px){
  .plans{grid-template-columns:repeat(4,1fr)}
  .sched{padding:26px 30px}
  .sched-top{grid-template-columns:auto 1fr;align-items:center}
  .chips{justify-content:flex-end}
}
'''
escribir(d['slug'], d, h, CSS, js)
