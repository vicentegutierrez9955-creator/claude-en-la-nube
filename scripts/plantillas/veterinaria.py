"""Plantilla para veterinarias.

Uso:  python3 scripts/plantillas/veterinaria.py [ficha.json]
Sin ficha usa datos/veterinaria-demo.json. La carpeta de salida es el "slug" de la ficha.
"""
from comun import (cargar, e, ic, px, wa, tel, estrellas, tbd, head, aviso_demo, cabecera,
                   resenas, preguntas, contacto, pie, config_js, escribir)

d = cargar('veterinaria-demo.json')
N, C = d['nombre_corto'], d['comuna']
MSG = f'Hola, quiero pedir una hora en {N}. ¿Qué horas tienen disponibles?'
FUENTES = 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap'

h = head(d, f'Veterinaria en {C} | {d["nombre"]}',
         f'Clínica veterinaria en {C}: consultas, vacunas, esterilización, cirugía y atención a domicilio para perros y gatos. Pide tu hora por WhatsApp.',
         FUENTES)
h += aviso_demo(d)
h += cabecera(d, 'i-paw', [('servicios', 'Servicios'), ('precios', 'Precios'), ('vacunas', 'Vacunas'), ('contacto', 'Ubicación')],
              'por WhatsApp', 'Pedir hora', MSG)

# Portada
h += f'''
<main id="inicio">

  <section class="hero" aria-labelledby="hero-title">
    <div class="wrap">
      <div>
        <span class="status" id="status"><i></i>Horario de atención</span>
        <h1 id="hero-title">Veterinaria en {e(C)}: cuidamos a tu mascota <em>como si fuera nuestra</em></h1>
        <p class="lead">Consultas, vacunas, esterilización y cirugía para perros y gatos. Te explicamos todo antes de empezar y te decimos el valor sin sorpresas.</p>
        <div class="cta-row">
          <a class="btn btn-wa" href="{wa(d, MSG)}" target="_blank" rel="noopener">{ic('i-wa', True)}Pedir hora por WhatsApp</a>
          <a class="btn btn-ghost" href="#orientacion">{ic('i-paw')}¿Qué le pasa a tu mascota?</a>
        </div>
        <ul class="trust">
          <li>{estrellas()}<a href="#resenas" style="color:inherit">{e(d['google']['nota'])} · {e(d['google']['cantidad'])} reseñas en Google</a></li>
          <li>{ic('i-award')}Cuidando mascotas desde {e(d['desde'])}</li>
          <li>{ic('i-home')}Atención a domicilio</li>
          <li>{ic('i-cat')}Manejo amable para gatos</li>
        </ul>
      </div>
      <div class="hero-media">
        <div class="ph hero-ph"><img src="{px(d['fotos']['hero'], 900)}" alt="{e(d['fotos']['hero_alt'])}" width="520" height="650" fetchpriority="high"></div>
        <a class="rating" href="#resenas" aria-label="Calificación {e(d['google']['nota'])} de 5 en Google">
          <b>{e(d['google']['nota'])}</b>
          <div>{estrellas()}<small>{e(d['google']['cantidad'])} reseñas en Google</small></div>
        </a>
      </div>
    </div>
  </section>

  <div class="urgent-bar" role="note">
    <div class="wrap">
      <div class="u-ic">{ic('i-alert')}</div>
      <p><b>¿Es una urgencia?</b> {e(d['urgencias'])}</p>
      <a class="btn btn-danger btn-sm" href="{tel(d)}">{ic('i-phone')}Llamar ahora</a>
    </div>
  </div>
'''

# Servicios
cards = ''.join(f'''
        <a class="card" href="{wa(d, f'Hola, quiero pedir una hora en {N} para {s["msg"]}. ¿Qué horas tienen disponibles?')}" target="_blank" rel="noopener">
          <span class="thumb"><img src="{px(s['foto'], 600)}" alt="{e(s['alt'])}" width="600" height="375" loading="lazy" onerror="this.remove()"></span>
          <span class="body"><h3>{e(s['t'])}</h3><p>{e(s['d'])}</p><span class="price-tag">{s['precio']}</span><span class="more">Pedir hora{ic('i-arrow')}</span></span>
        </a>''' for s in d['servicios'])
h += f'''
  <section id="servicios" aria-labelledby="svc-title">
    <div class="wrap">
      <div class="section-head reveal">
        <span class="kicker">Servicios</span>
        <h2 id="svc-title">Todo lo que tu mascota necesita, en un solo lugar</h2>
        <p>Atendemos perros y gatos de {e(C)} y comunas cercanas. Toca un servicio y te queda el mensaje listo para pedir hora.</p>
      </div>
      <div class="cards reveal">{cards}
      </div>
    </div>
  </section>
'''

# Orientación rápida
URG = [('respira', 'Le cuesta respirar', 'Respira rápido o con la boca abierta'),
       ('toxico', 'Comió algo tóxico', 'Veneno, chocolate, remedios'),
       ('golpe', 'Atropello o golpe fuerte', 'Aunque se vea bien'),
       ('sangra', 'Sangra o tiene una herida', 'Herida profunda o que no para'),
       ('convulsion', 'Convulsiones', 'Temblores fuertes o se desmayó'),
       ('orina', 'No puede orinar', 'Sobre todo gatos machos')]
CON = [('vomito', 'Vómitos o diarrea', 'Más de una vez'),
       ('come', 'No quiere comer', 'Decaído o sin ánimo'),
       ('cojea', 'Cojea o le duele algo', 'Se queja al tocarlo'),
       ('piel', 'Piel u oídos', 'Se rasca, pierde pelo'),
       ('vacunas', 'Vacunas o control', 'Cachorro, gatito o adulto'),
       ('ester', 'Esterilización', 'Perro o gato')]
opts = lambda lst, cls: ''.join(f'<button type="button" class="opt{cls}" aria-pressed="false" data-k="{k}">{e(t)}<small>{e(s)}</small></button>' for k, t, s in lst)
h += f'''
  <section id="orientacion" class="alt" aria-labelledby="tool-title">
    <div class="wrap">
      <div class="section-head reveal">
        <span class="kicker">Orientación rápida</span>
        <h2 id="tool-title">¿Qué le pasa a tu mascota?</h2>
        <p>Marca lo que ves y te decimos qué tan urgente es. El mensaje para pedir hora te queda listo.</p>
      </div>
      <div class="tool reveal">
        <div class="panel">
          <div class="step">
            <h3><i>1</i>¿Quién es tu paciente?</h3>
            <div class="opts" id="esp">
              <button type="button" class="opt" aria-pressed="false" data-v="perro">Perro</button>
              <button type="button" class="opt" aria-pressed="false" data-v="gato">Gato</button>
              <button type="button" class="opt" aria-pressed="false" data-v="mascota">Otra mascota</button>
            </div>
          </div>
          <div class="step">
            <h3><i>2</i>¿Qué le pasa?</h3>
            <div id="prob">
              <p class="grp-label red">Urgencias</p>
              <div class="opts">{opts(URG, ' urg')}</div>
              <p class="grp-label">Consultas</p>
              <div class="opts">{opts(CON, '')}</div>
            </div>
          </div>
          <div class="step">
            <h3><i>3</i>¿Cómo se llama? <span style="font-weight:500;color:var(--muted)">(opcional)</span></h3>
            <input class="field" id="pet" type="text" placeholder="Ej: Toby" aria-label="Nombre de tu mascota">
          </div>
        </div>
        <aside class="result" id="res" aria-live="polite">
          <span class="kicker">Nuestra orientación</span>
          <h3 id="r-title">Marca lo que le pasa</h3>
          <span class="level" id="r-level" hidden></span>
          <p id="r-text">Elige una opción y te contamos qué hacer y cuánto puede esperar.</p>
          <a class="btn btn-danger" id="r-call" href="{tel(d)}" hidden>{ic('i-phone')}Llamar ahora</a>
          <div class="bubble"><small>Mensaje que nos llega</small><span id="r-msg">{e(MSG)}</span></div>
          <a class="btn btn-wa" id="r-wa" href="{wa(d, MSG)}" target="_blank" rel="noopener">{ic('i-wa', True)}Enviar por WhatsApp</a>
          <span class="fine">Es una orientación general y no reemplaza la evaluación del veterinario.</span>
        </aside>
      </div>
    </div>
  </section>
'''

# Precios
boxes = ''.join(
    f'<div class="price-box reveal"><h3>{e(p["t"])}</h3>' +
    ''.join(f'<div class="prow"><div><b>{e(a)}</b><small>{e(b)}</small></div><span class="val">{e(c)}</span></div>' for a, b, c in p['filas']) +
    '</div>' for p in d['precios'])
h += f'''
  <section id="precios" aria-labelledby="price-title">
    <div class="wrap">
      <div class="section-head reveal">
        <span class="kicker">Precios</span>
        <h2 id="price-title">Precios claros, antes de venir{tbd(d, 'Valores de ejemplo')}</h2>
        <p>Sabes cuánto vas a pagar antes de la atención. Si tu mascota necesita algo más, te lo decimos antes de hacerlo.</p>
      </div>
      <div class="price-grid">{boxes}</div>
      <p class="note">Medios de pago: {e(d['pagos'])}</p>
    </div>
  </section>
'''

# Calendario de vacunas
VAX = {
    'perro': [('6 a 8 semanas', 'Primera vacuna (parvovirus y distemper) y desparasitación.'),
              ('9 a 11 semanas', 'Vacuna óctuple, primera dosis.'),
              ('12 a 14 semanas', 'Vacuna óctuple, refuerzo.'),
              ('Desde los 3 meses', 'Vacuna antirrábica, obligatoria en Chile.'),
              ('Cada año', 'Refuerzo de óctuple y antirrábica, y control general.')],
    'gato': [('8 a 9 semanas', 'Vacuna triple felina, primera dosis, y desparasitación.'),
             ('12 semanas', 'Triple felina, refuerzo. Leucemia felina si sale a la calle.'),
             ('Desde los 3 meses', 'Vacuna antirrábica, obligatoria en Chile.'),
             ('Cada año', 'Refuerzo de vacunas y control general.')],
}
vax = ''.join(
    f'<ol class="vax" id="vax-{k}"{"" if k == "perro" else " hidden"}>' +
    ''.join(f'<li><b>{e(a)}</b><span>{e(b)}</span></li>' for a, b in v) + '</ol>' for k, v in VAX.items())
h += f'''
  <section id="vacunas" class="alt" aria-labelledby="vax-title">
    <div class="wrap vax-wrap">
      <div class="reveal">
        <span class="kicker">Calendario de vacunas</span>
        <h2 id="vax-title">¿Qué vacuna le toca a tu cachorro o gatito?</h2>
        <p class="vax-lead">Una guía para que sepas qué viene. En la primera consulta armamos el calendario exacto de tu mascota.</p>
        <div class="tabs" role="tablist" aria-label="Tipo de mascota">
          <button class="tab" role="tab" aria-selected="true" data-t="perro">Cachorro</button>
          <button class="tab" role="tab" aria-selected="false" data-t="gato">Gatito</button>
        </div>
        {vax}
        <p class="note">Calendario orientativo. Tu veterinario lo ajusta según la edad, la salud y el estilo de vida de tu mascota.</p>
      </div>
      <div class="chip-card reveal">
        <span class="chip-ic">{ic('i-chip')}</span>
        <h3>Microchip y registro (Ley Cholito)</h3>
        <p>La Ley 21.020 exige inscribir a perros y gatos en el Registro Nacional de Mascotas. Te implantamos el microchip en la consulta y te ayudamos con la inscripción.</p>
        <a class="btn btn-primary" href="{wa(d, f'Hola, quiero ponerle microchip a mi mascota en {N}. ¿Qué horas tienen disponibles?')}" target="_blank" rel="noopener">{ic('i-wa', True)}Agendar microchip</a>
      </div>
    </div>
  </section>
'''

# Primera visita y equipo
team = ''.join(f'<article class="member"><span class="avatar">{e(m["i"])}</span><div><h3>{e(m["n"])}</h3><p>{e(m["r"])}</p></div></article>' for m in d['equipo'])
h += f'''
  <section aria-labelledby="visit-title">
    <div class="wrap">
      <div class="section-head center reveal">
        <span class="kicker">Sin sorpresas</span>
        <h2 id="visit-title">Así es venir por primera vez</h2>
      </div>
      <div class="steps3 reveal">
        <article><h3>Escríbenos</h3><p>Cuéntanos qué le pasa a tu mascota por WhatsApp. Te damos hora y el valor de la atención.</p></article>
        <article><h3>Trae su carnet</h3><p>Si tiene carnet de vacunas o exámenes, tráelos. Los gatos, siempre en su transportín.</p></article>
        <article><h3>Te explicamos todo</h3><p>Revisamos a tu mascota, te contamos qué tiene y qué hacer, y resolvemos tus dudas.</p></article>
      </div>
    </div>
  </section>

  <section id="equipo" class="alt" aria-labelledby="team-title">
    <div class="wrap">
      <div class="team-head reveal">
        <div class="ph team-ph"><img src="{px(d['fotos']['equipo'], 900)}" alt="{e(d['fotos']['equipo_alt'])}" width="620" height="420" loading="lazy" onerror="this.remove()"></div>
        <div>
          <span class="kicker">Nuestro equipo</span>
          <h2 id="team-title">Veterinarios que tratan a tu mascota como si fuera suya{tbd(d)}</h2>
          <p style="color:var(--muted);font-size:17px">Desde {e(d['desde'])} cuidamos a las mascotas de {e(C)}. Nos tomamos el tiempo de explicarte cada paso y de que tu mascota se sienta tranquila.</p>
        </div>
      </div>
      <div class="team reveal" style="margin-top:22px">{team}</div>
    </div>
  </section>
'''

h += resenas(d, f'Familias de {C} que confían en nosotros', 'Lo que dicen de nosotros')
h += preguntas(d, [
    ('¿Atienden urgencias?', e(d['urgencias'])),
    ('¿Cuánto cuesta la consulta?', f'La consulta general cuesta {e(d["precios"][0]["filas"][0][2])}. Puedes ver todos los valores en la sección de <a href="#precios">precios</a>.'),
    ('¿Atienden gatos?', 'Sí. Los atendemos con un manejo tranquilo y sin apuro. Tráelo en su transportín para que viaje más seguro.'),
    ('¿Hacen atención a domicilio?', 'Sí, para consultas, vacunas y controles. Es ideal para mascotas mayores, nerviosas o que no toleran el auto.'),
    ('¿Desde qué edad se puede esterilizar?', 'Depende de la especie, el tamaño y la salud de tu mascota. En la consulta te decimos cuál es el mejor momento.'),
    ('¿Qué medios de pago aceptan?', e(d['pagos'])),
])
h += contacto(d, 'Pide tu hora', '¿Agendamos la próxima visita de tu mascota?',
              f'Escríbenos y te damos hora en {C}. Si es una urgencia, llámanos directamente.', 'Pedir hora por WhatsApp', MSG)
h += pie(d, [('Servicios', '<br>'.join(e(s['t']) for s in d['servicios'][:4])),
             ('Contacto', f'{e(d["direccion"])}, {e(C)}<br><a href="{wa(d, MSG)}" target="_blank" rel="noopener">WhatsApp {e(d.get("telefono_txt", ""))}</a>')],
         'Pedir hora por WhatsApp', MSG)

PROB = {
    'respira': ('Dificultad para respirar', 'urgente', 'Es una urgencia. Llámanos ahora para decirte qué hacer mientras vienes. Mantén a tu mascota tranquila y con aire fresco.', 'le cuesta respirar'),
    'toxico': ('Comió algo tóxico', 'urgente', 'Es una urgencia. Llámanos ahora y, si puedes, trae el envase o una foto de lo que comió. No le provoques el vómito sin indicación.', 'comió algo tóxico'),
    'golpe': ('Atropello o golpe fuerte', 'urgente', 'Es una urgencia, aunque se vea bien: puede tener lesiones por dentro. Llámanos y muévelo lo menos posible.', 'tuvo un golpe fuerte o un atropello'),
    'sangra': ('Herida o sangrado', 'urgente', 'Es una urgencia. Presiona la herida con un paño limpio y llámanos para que te esperemos.', 'tiene una herida que sangra'),
    'convulsion': ('Convulsiones', 'urgente', 'Es una urgencia. No pongas la mano en su boca, aleja objetos y llámanos de inmediato.', 'tuvo convulsiones'),
    'orina': ('No puede orinar', 'urgente', 'Es una urgencia, sobre todo en gatos machos: una obstrucción puede ser grave en pocas horas. Llámanos ahora.', 'no puede orinar'),
    'vomito': ('Vómitos o diarrea', 'pronto', 'Si vomita o tiene diarrea más de una vez, está decaído o es cachorro, conviene revisarlo hoy. No le des remedios de personas.', 'tiene vómitos o diarrea'),
    'come': ('No quiere comer', 'pronto', 'Si lleva más de un día sin comer, o un gato deja de comer, conviene revisarlo pronto.', 'no quiere comer'),
    'cojea': ('Cojea o le duele algo', 'pronto', 'Lo revisamos para ver si es un golpe, una espina o algo de las articulaciones. Evita que salte o corra mientras tanto.', 'cojea o le duele algo'),
    'piel': ('Piel u oídos', '', 'Picazón, caída de pelo u oídos con mal olor suelen ser alergias, hongos u otitis. Tiene tratamiento: agenda una consulta.', 'tiene problemas de piel u oídos'),
    'vacunas': ('Vacunas o control', '', 'Revisamos su carnet y le ponemos las vacunas que le tocan. Mira el calendario de vacunas más abajo.', 'vacunas o control'),
    'ester': ('Esterilización', '', 'Primero hacemos una evaluación y te explicamos la cirugía, los cuidados y el valor según su peso.', 'esterilización'),
}
js = r'''
  var P = C.prob, st = { esp: "", k: "" };
  if ($("prob")) {
    single($("esp"), function (b) { st.esp = b ? b.getAttribute("data-v") : ""; render(); });
    single($("prob"), function (b) { st.k = b ? b.getAttribute("data-k") : ""; render(); });
    $("pet").addEventListener("input", render);
  }
  function render() {
    var p = P[st.k], pet = $("pet").value.trim(), lv = $("r-level");
    var quien = st.esp === "perro" ? "mi perro" : st.esp === "gato" ? "mi gato" : "mi mascota";
    if (pet) quien += " " + pet;
    $("r-title").textContent = p ? p[0] : "Marca lo que le pasa";
    $("r-text").textContent = p ? p[2] : "Elige una opción y te contamos qué hacer y cuánto puede esperar.";
    var urg = p && p[1] === "urgente";
    $("res").classList.toggle("urgent", !!urg);
    $("r-call").hidden = !urg;
    if (p && p[1]) { lv.hidden = false; lv.className = "level " + p[1]; lv.textContent = urg ? "Urgencia: llama ahora" : "Conviene revisarlo pronto"; } else lv.hidden = true;
    var msg;
    if (urg) msg = "Hola, es una urgencia con " + quien + ": " + p[3] + ". ¿Pueden atenderlo ahora?";
    else if (p && (st.k === "vacunas" || st.k === "ester")) msg = "Hola, quiero pedir una hora para " + quien + " por " + p[3] + ". ¿Qué horas tienen disponibles?";
    else if (p) msg = "Hola, quiero pedir una hora para " + quien + ", que " + p[3] + ". ¿Qué horas tienen disponibles?";
    else msg = "Hola, quiero pedir una hora para " + quien + ". ¿Qué horas tienen disponibles?";
    $("r-msg").textContent = msg;
    $("r-wa").href = WA(msg);
  }
  document.querySelectorAll(".tabs").forEach(function (tl) {
    tl.addEventListener("click", function (ev) {
      var b = ev.target.closest(".tab"); if (!b) return;
      tl.querySelectorAll(".tab").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
      document.querySelectorAll(".vax").forEach(function (o) { o.hidden = o.id !== "vax-" + b.getAttribute("data-t"); });
    });
  });
'''
h += config_js(d, {'prob': PROB})
h += '<script src="{B}/app.js"></script>\n</body>\n</html>\n'

CSS = '''
/* Veterinaria */
.urgent-bar{background:#fef2f2;border-top:1px solid #fecaca;border-bottom:1px solid #fecaca;color:#7f1d1d}
.urgent-bar .wrap{display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;padding-top:14px;padding-bottom:14px}
.urgent-bar p{margin:0;flex:1;min-width:220px;font-size:15.5px}
.u-ic{width:40px;height:40px;border-radius:12px;background:#fee2e2;color:#dc2626;display:grid;place-items:center;flex:none}
.vax-wrap{display:grid;gap:28px;align-items:start}
.vax-lead{color:var(--muted);font-size:17px;margin:0 0 18px}
.vax{list-style:none;margin:0;padding:0 0 0 22px;border-left:3px solid var(--brand-soft);display:grid;gap:14px}
.vax li{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.vax li::before{content:"";position:absolute;left:-31px;top:18px;width:14px;height:14px;border-radius:50%;background:var(--brand);border:3px solid var(--surface-2)}
.vax b{display:block;color:var(--brand-text)}
.vax span{color:var(--muted);font-size:15.5px}
.chip-card{background:var(--dark);color:#fff;border-radius:24px;padding:28px;display:flex;flex-direction:column;gap:12px;align-items:flex-start}
.chip-card h3{margin:0;font-size:24px}
.chip-card p{margin:0;color:rgba(255,255,255,.82)}
.chip-ic{width:52px;height:52px;border-radius:14px;background:rgba(255,255,255,.12);display:grid;place-items:center;color:var(--accent-on-dark)}
.team-head{display:grid;gap:22px;align-items:center}
.team-ph{aspect-ratio:3/2;border-radius:22px}
@media (min-width:900px){
  .vax-wrap{grid-template-columns:1.3fr .9fr;gap:48px}
  .chip-card{position:sticky;top:100px}
  .team-head{grid-template-columns:1fr 1.1fr;gap:48px}
}
'''
escribir(d['slug'], d, h, CSS, js)
