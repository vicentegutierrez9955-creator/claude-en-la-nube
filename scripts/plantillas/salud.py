"""Plantilla para consultas de salud pequeñas (dentista, podólogo, kinesiólogo, psicólogo, nutricionista).

Uso:  python3 scripts/plantillas/salud.py [ficha.json]
Sin ficha usa datos/salud-demo.json. La carpeta de salida es el "slug" de la ficha.
Además de la portada arma una página por tratamiento (/slug/tratamiento), para aparecer en Google
con búsquedas como "blanqueamiento dental Ñuñoa".
"""
import json

from comun import (cargar, e, ic, px, wa, tel, estrellas, tbd, head, aviso_demo, cabecera,
                   resenas, preguntas, contacto, pie, config_js, escribir)

d = cargar('salud-demo.json')
N, C, PROF = d['nombre_corto'], d['comuna'], d['profesion']
MSG = f'Hola, quiero agendar una hora en {N}. ¿Qué horas tienen disponibles?'
FUENTES = 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap'
P = d['profesional']
T = d['tratamientos']
AGENDA = d.get('agenda_url', '')


def msg_trat(t):
    return f'Hola, quiero agendar una hora en {N} para {t["msg"]}. ¿Qué horas tienen disponibles?'


def boton_agendar(texto, msg, cls='btn-wa'):
    """Si el negocio usa una agenda en línea (AgendaPro, Reservo, Doctoralia…) el botón principal va ahí."""
    if AGENDA:
        return f'<a class="btn btn-primary" href="{e(AGENDA)}" target="_blank" rel="noopener">{ic("i-calendar")}{e(texto)}</a>'
    return f'<a class="btn {cls}" href="{wa(d, msg)}" target="_blank" rel="noopener">{ic("i-wa", True)}{e(texto)} por WhatsApp</a>'


def schema():
    dias = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
    s = {'@context': 'https://schema.org', '@type': d.get('schema_tipo', 'MedicalClinic'), 'name': d['nombre'],
         'description': d['resumen'], 'telephone': d.get('telefono_txt', ''),
         'address': {'@type': 'PostalAddress', 'streetAddress': d['direccion'], 'addressLocality': C, 'addressCountry': 'CL'},
         'openingHours': [f'{dias[i]} {h[0]}-{h[1]}' for i, h in enumerate(d['horario']) if h]}
    return '<script type="application/ld+json">' + json.dumps(s, ensure_ascii=False).replace('</', '<\\/') + '</script>\n'


def cierre(extra_cfg=None):
    return config_js(d, extra_cfg or {}) + '<script src="{B}/app.js"></script>\n</body>\n</html>\n'


NAV = [('tratamientos', 'Tratamientos'), ('precios', 'Precios'), ('profesional', 'Quién te atiende'), ('contacto', 'Ubicación')]
NAV_SUB = [('{B}#tratamientos', 'Tratamientos'), ('{B}#precios', 'Precios'), ('{B}#profesional', 'Quién te atiende'), ('{B}#contacto', 'Ubicación')]
PIE_COLS = [('Tratamientos', '<br>'.join(f'<a href="{{B}}/{e(t["slug"])}">{e(t["t"])}</a>' for t in T[:5])),
            ('Contacto', f'{e(d["direccion"])}, {e(C)}<br><a href="{wa(d, MSG)}" target="_blank" rel="noopener">WhatsApp {e(d.get("telefono_txt", ""))}</a>')]

# ---------------------------------------------------------------- Portada
h = head(d, f'{PROF} en {C} | {d["nombre"]}', d['descripcion'], FUENTES, schema())
h += aviso_demo(d)
h += cabecera(d, d.get('icono', 'i-tooth'), NAV, 'tu hora', 'Agendar', MSG)

trust = [f'{estrellas()}<a href="#resenas" style="color:inherit">{e(d["google"]["nota"])} · {e(d["google"]["cantidad"])} reseñas en Google</a>',
         f'{ic("i-shield")}Registro en la Superintendencia de Salud',
         f'{ic("i-file")}{e(d["convenios"]["corto"])}',
         f'{ic("i-calendar")}{e(d["primera_visita"]["gancho"])}']
h += f'''
<main id="inicio">

  <section class="hero" aria-labelledby="hero-title">
    <div class="wrap">
      <div>
        <span class="status" id="status"><i></i>Horario de atención</span>
        <h1 id="hero-title">{e(d['h1'])} <em>{e(d['h1_em'])}</em></h1>
        <p class="lead">{e(d['lead'])}</p>
        <div class="cta-row">
          {boton_agendar('Agendar hora', MSG)}
          <a class="btn btn-ghost" href="#orientacion">{ic('i-search')}¿Qué te está pasando?</a>
        </div>
        <ul class="trust">{''.join(f'<li>{x}</li>' for x in trust)}</ul>
      </div>
      <div class="hero-media">
        <div class="ph hero-ph"><img src="{px(d['fotos']['hero'], 900)}" alt="{e(d['fotos']['hero_alt'])}" width="520" height="650" fetchpriority="high"></div>
        <a class="pro-chip" href="#profesional">
          <span class="avatar sm">{e(P['iniciales'])}</span>
          <span><b>{e(P['nombre'])}</b><small>{e(P['titulo'])}</small></span>
        </a>
      </div>
    </div>
  </section>
'''

# Tratamientos
cards = ''.join(f'''
        <a class="card" href="{{B}}/{e(t['slug'])}">
          <span class="thumb"><img src="{px(t['foto'], 600)}" alt="{e(t['alt'])}" width="600" height="375" loading="lazy" onerror="this.remove()"></span>
          <span class="body"><h3>{e(t['t'])}</h3><p>{e(t['d'])}</p><span class="price-tag">{t['precio']}</span><span class="more">Ver tratamiento{ic('i-arrow')}</span></span>
        </a>''' for t in T)
h += f'''
  <section id="tratamientos" aria-labelledby="svc-title">
    <div class="wrap">
      <div class="section-head reveal">
        <span class="kicker">Tratamientos</span>
        <h2 id="svc-title">{e(d['titulo_tratamientos'])}</h2>
        <p>Cada tratamiento tiene su página con cómo es, cuánto dura, si duele y cuánto cuesta. Así llegas sabiendo todo.</p>
      </div>
      <div class="cards reveal">{cards}
      </div>
    </div>
  </section>
'''

# ¿Qué te está pasando?
mol = d['molestias']
opts = lambda lst, cls: ''.join(f'<button type="button" class="opt{cls}" aria-pressed="false" data-k="{e(m["k"])}">{e(m["t"])}<small>{e(m["s"])}</small></button>' for m in lst)
urg = [m for m in mol if m['nivel'] == 'urgente']
resto = [m for m in mol if m['nivel'] != 'urgente']
grupo_urg = f'<p class="grp-label red">Urgencias</p><div class="opts">{opts(urg, " urg")}</div><p class="grp-label">Consultas</p>' if urg else ''
h += f'''
  <section id="orientacion" class="alt" aria-labelledby="tool-title">
    <div class="wrap">
      <div class="section-head reveal">
        <span class="kicker">Orientación rápida</span>
        <h2 id="tool-title">¿Qué te está pasando?</h2>
        <p>Marca lo que sientes y te decimos qué tratamiento suele corresponder y qué tan pronto conviene venir. El mensaje para pedir hora te queda listo.</p>
      </div>
      <div class="tool reveal">
        <div class="panel">
          <div class="step">
            <h3><i>1</i>¿Qué te molesta?</h3>
            <div id="mol">{grupo_urg}<div class="opts">{opts(resto, '')}</div></div>
          </div>
          <div class="step">
            <h3><i>2</i>¿Cuándo te acomoda venir?</h3>
            <div class="opts" id="cuando">
              <button type="button" class="opt" aria-pressed="false" data-v="en la mañana">Mañana</button>
              <button type="button" class="opt" aria-pressed="false" data-v="en la tarde">Tarde</button>
              <button type="button" class="opt" aria-pressed="false" data-v="lo antes posible">Lo antes posible</button>
            </div>
          </div>
          <div class="step">
            <h3><i>3</i>¿Ya te has atendido con nosotros?</h3>
            <div class="opts" id="primera">
              <button type="button" class="opt" aria-pressed="false" data-v="1">Es mi primera vez</button>
              <button type="button" class="opt" aria-pressed="false" data-v="0">Ya soy paciente</button>
            </div>
          </div>
        </div>
        <aside class="result" id="res" aria-live="polite">
          <span class="kicker">Nuestra orientación</span>
          <h3 id="r-title">Marca lo que te molesta</h3>
          <span class="level" id="r-level" hidden></span>
          <p id="r-text">Elige una opción y te contamos qué tratamiento suele corresponder.</p>
          <a class="r-link" id="r-trat" href="#tratamientos" hidden></a>
          <a class="btn btn-danger" id="r-call" href="{tel(d)}" hidden>{ic('i-phone')}Llamar ahora</a>
          <div class="bubble"><small>Mensaje que nos llega</small><span id="r-msg">{e(MSG)}</span></div>
          <a class="btn btn-wa" id="r-wa" href="{wa(d, MSG)}" target="_blank" rel="noopener">{ic('i-wa', True)}Enviar por WhatsApp</a>
          <span class="fine">Es una orientación general y no reemplaza la evaluación del profesional.</span>
        </aside>
      </div>
    </div>
  </section>
'''

# Quién te atiende
registro = f'Registro Superintendencia de Salud N° {e(P["registro"])}' if P.get('registro') else 'Inscrito en el Registro de Prestadores de la Superintendencia de Salud'
creds = [('i-award', P['titulo'], P['universidad']), ('i-shield', 'Registro de prestadores', registro), ('i-clock', 'Experiencia', P['experiencia'])]
creds_html = ''.join(f'<li><span class="ic">{ic(i)}</span><div><b>{e(a)}</b><small>{b if i == "i-shield" else e(b)}</small></div></li>' for i, a, b in creds)
equipo = ''.join(f'<article class="member"><span class="avatar">{e(m["i"])}</span><div><h3>{e(m["n"])}</h3><p>{e(m["r"])}</p></div></article>' for m in d.get('equipo', []))
h += f'''
  <section id="profesional" aria-labelledby="pro-title">
    <div class="wrap pro">
      <div class="ph pro-ph reveal"><img src="{px(d['fotos']['profesional'], 800)}" alt="{e(d['fotos']['profesional_alt'])}" width="560" height="640" loading="lazy" onerror="this.remove()"></div>
      <div class="reveal">
        <span class="kicker">Quién te atiende</span>
        <h2 id="pro-title">{e(P['nombre'])}{tbd(d)}</h2>
        <p class="pro-lead">{e(P['texto'])}</p>
        <ul class="creds">{creds_html}</ul>
        <a class="verify" href="https://rnpi.superdesalud.gob.cl/" target="_blank" rel="noopener">{ic('i-search')}Verifica su registro en la Superintendencia de Salud</a>
      </div>
    </div>
    {f'<div class="wrap"><div class="team reveal" style="margin-top:30px">{equipo}</div></div>' if equipo else ''}
  </section>
'''

# Precios y convenios
boxes = ''.join(
    f'<div class="price-box reveal"><h3>{e(p["t"])}</h3>' +
    ''.join(f'<div class="prow"><div><b>{e(a)}</b><small>{e(b)}</small></div><span class="val">{e(c)}</span></div>' for a, b, c in p['filas']) +
    '</div>' for p in d['precios'])
cv = d['convenios']
conv = [('i-file', 'Fonasa', cv['fonasa']), ('i-shield', 'Isapres', cv['isapres']), ('i-card', 'Medios de pago', cv['pagos']), ('i-calendar', 'Cuotas', cv['cuotas'])]
conv_html = ''.join(f'<div class="conv"><span class="ic">{ic(i)}</span><div><b>{e(a)}</b><p>{e(b)}</p></div></div>' for i, a, b in conv)
h += f'''
  <section id="precios" class="alt" aria-labelledby="price-title">
    <div class="wrap">
      <div class="section-head reveal">
        <span class="kicker">Precios y convenios</span>
        <h2 id="price-title">Sabes cuánto pagas antes de empezar{tbd(d, 'Valores de ejemplo')}</h2>
        <p>En la primera visita te entregamos un presupuesto por escrito. Nada se hace sin que lo apruebes.</p>
      </div>
      <div class="price-grid">{boxes}</div>
      <div class="convs reveal">{conv_html}</div>
    </div>
  </section>
'''

# Tu primera visita
pv = d['primera_visita']
pasos = ''.join(f'<article><h3>{e(a)}</h3><p>{e(b)}</p></article>' for a, b in pv['pasos'])
datos_pv = ''.join(f'<div class="fact"><span class="ic">{ic(i)}</span><div><b>{e(a)}</b><span>{e(b)}</span></div></div>'
                   for i, a, b in [('i-clock', '¿Cuánto dura?', pv['dura']), ('i-heart', '¿Duele?', pv['duele']), ('i-file', '¿Qué traer?', pv['traer'])])
h += f'''
  <section id="primera-visita" aria-labelledby="visit-title">
    <div class="wrap">
      <div class="section-head center reveal">
        <span class="kicker">Sin sorpresas</span>
        <h2 id="visit-title">Así es tu primera visita</h2>
        <p>Sabemos que a muchos les da nervio venir. Por eso te contamos exactamente qué va a pasar.</p>
      </div>
      <div class="steps3 reveal">{pasos}</div>
      <div class="facts3 reveal">{datos_pv}</div>
    </div>
  </section>
'''

# Antes y después
def antes_despues(casos):
    if casos:
        items = ''.join(f'''
        <figure class="ba" style="--pos:50%">
          <div class="ba-frame">
            <img src="{px(c['despues'], 800)}" alt="{e(c['alt'])}, después" loading="lazy">
            <div class="ba-antes"><img src="{px(c['antes'], 800)}" alt="{e(c['alt'])}, antes" loading="lazy"></div>
            <span class="ba-tag l">Antes</span><span class="ba-tag r">Después</span>
            <input class="ba-range" type="range" min="0" max="100" value="50" aria-label="Comparar antes y después: {e(c['t'])}">
          </div>
          <figcaption>{e(c['t'])}</figcaption>
        </figure>''' for c in casos)
        return f'<div class="ba-grid">{items}</div>'
    # Sin fotos todavía: espacios que muestran dónde irán (con permiso de cada paciente)
    return '<div class="ba-grid">' + ''.join(
        f'<figure class="ba ba-vacio"><div class="ba-frame">{ic("i-camera")}<b>{e(t["t"])}</b><span>Foto real de un paciente, con su permiso</span></div></figure>'
        for t in T[:3]) + '</div>'


h += f'''
  <section id="antes-despues" class="alt" aria-labelledby="ba-title">
    <div class="wrap">
      <div class="section-head reveal">
        <span class="kicker">Resultados</span>
        <h2 id="ba-title">Antes y después{tbd(d, 'Aquí van fotos reales')}</h2>
        <p>Casos reales de pacientes que nos dieron permiso para mostrarlos. Desliza para comparar.</p>
      </div>
      <div class="reveal">{antes_despues(d.get('antes_despues', []))}</div>
    </div>
  </section>
'''

h += resenas(d, d['titulo_resenas'], 'Lo que dicen nuestros pacientes')
h += preguntas(d, [(q, e(a)) for q, a in d['faqs']])
h += contacto(d, 'Agenda tu hora', d['titulo_contacto'],
              f'Escríbenos y te damos hora en {C}. Respondemos rápido, también fuera de horario.', 'Agendar por WhatsApp', MSG)
h += pie(d, PIE_COLS, 'Agendar por WhatsApp', MSG)

MOL = {m['k']: [m['t'], m['nivel'], m['texto'], m['trat'], m['msg']] for m in mol}
TRAT = {t['slug']: [t['t'], t['precio_txt']] for t in T}
h += cierre({'mol': MOL, 'trat': TRAT, 'n': N})


# ---------------------------------------------------------------- Una página por tratamiento
def pagina(t):
    pg = t['pagina']
    MT = msg_trat(t)
    x = head(d, f'{t["t"]} en {C} | {d["nombre"]}', pg['descripcion'], FUENTES, schema())
    x += aviso_demo(d)
    x += cabecera(d, d.get('icono', 'i-tooth'), NAV_SUB, 'tu hora', 'Agendar', MT)
    senales = ''.join(f'<li>{ic("i-check")}<span>{e(s)}</span></li>' for s in pg['senales'])
    pasos = ''.join(f'<li><b>{e(a)}</b><span>{e(b)}</span></li>' for a, b in pg['pasos'])
    hechos = ''.join(f'<div class="fact"><span class="ic">{ic(i)}</span><div><b>{e(a)}</b><span>{e(b)}</span></div></div>'
                     for i, a, b in [('i-clock', 'Duración', pg['dura']), ('i-calendar', 'Sesiones', pg['sesiones']),
                                     ('i-heart', '¿Duele?', pg['duele']), ('i-card', 'Valor', t['precio_txt'])])
    cuidados = ''.join(f'<li>{ic("i-check")}<span>{e(s)}</span></li>' for s in pg['cuidados'])
    otros = ''.join(f'<a class="mini-card" href="{{B}}/{e(o["slug"])}"><img src="{px(o["foto"], 300)}" alt="" loading="lazy" onerror="this.remove()"><span><b>{e(o["t"])}</b><small>{e(o["precio_txt"])}</small></span></a>'
                    for o in T if o['slug'] != t['slug'])
    x += f'''
<main id="inicio">
  <section class="hero sub" aria-labelledby="hero-title">
    <div class="wrap">
      <div>
        <nav class="crumbs" aria-label="Estás en"><a href="{{B}}">Inicio</a> › <a href="{{B}}#tratamientos">Tratamientos</a> › <span>{e(t['t'])}</span></nav>
        <h1 id="hero-title">{e(t['t'])} en {e(C)}</h1>
        <p class="lead">{e(pg['intro'])}</p>
        <div class="cta-row">{boton_agendar('Agendar hora', MT)}<a class="btn btn-ghost" href="#valor">Ver valor</a></div>
        <ul class="trust"><li>{estrellas()}{e(d['google']['nota'])} · {e(d['google']['cantidad'])} reseñas en Google</li><li>{ic('i-shield')}{e(P['nombre'])}, {e(P['titulo'].lower())}</li></ul>
      </div>
      <div class="hero-media"><div class="ph hero-ph"><img src="{px(t['foto'], 900)}" alt="{e(t['alt'])}" width="520" height="650" fetchpriority="high"></div></div>
    </div>
  </section>

  <section aria-labelledby="sig-title">
    <div class="wrap two">
      <div class="reveal">
        <span class="kicker">¿Es para ti?</span>
        <h2 id="sig-title">Señales de que lo necesitas</h2>
        <ul class="checks">{senales}</ul>
      </div>
      <div class="reveal">
        <span class="kicker">Paso a paso</span>
        <h2>Cómo es el tratamiento</h2>
        <ol class="timeline">{pasos}</ol>
      </div>
    </div>
  </section>

  <section id="valor" class="alt" aria-labelledby="val-title">
    <div class="wrap">
      <div class="section-head reveal">
        <span class="kicker">Lo que tienes que saber</span>
        <h2 id="val-title">Duración, molestias y valor{tbd(d, 'Valores de ejemplo')}</h2>
        <p>{e(pg['valor_txt'])}</p>
      </div>
      <div class="facts4 reveal">{hechos}</div>
      <div class="box care reveal"><h3>Después del tratamiento</h3><ul class="checks">{cuidados}</ul></div>
    </div>
  </section>
'''
    x += preguntas(d, [(q, e(a)) for q, a in pg['faqs']])
    x += f'''
  <section class="alt" aria-labelledby="otros-title">
    <div class="wrap">
      <div class="final reveal" style="min-height:0">
        <span class="kicker">Agenda tu hora</span>
        <h2>¿Lo conversamos en una evaluación?</h2>
        <p>Te revisamos, te explicamos qué necesitas y te damos el presupuesto por escrito antes de empezar.</p>
        <div class="cta-row">{boton_agendar('Agendar hora', MT)}<a class="btn btn-ghost" href="{tel(d)}">{ic('i-phone')}Llamar</a></div>
      </div>
      <h2 id="otros-title" class="otros-t reveal">Otros tratamientos</h2>
      <div class="minis reveal">{otros}</div>
    </div>
  </section>
'''
    x += pie(d, PIE_COLS, 'Agendar por WhatsApp', MT)
    x += cierre()
    # Sin teléfono, "Llamar" lleva a la ubicación, que está en la portada
    return x.replace('href="#contacto"', 'href="{B}#contacto"')


paginas = {t['slug']: pagina(t) for t in T}

JS = r'''
  // ¿Qué te está pasando? (solo en la portada)
  if ($("mol")) {
    var st = { k: "", cuando: "", primera: "" };
    single($("mol"), function (b) { st.k = b ? b.getAttribute("data-k") : ""; render(); });
    single($("cuando"), function (b) { st.cuando = b ? b.getAttribute("data-v") : ""; render(); });
    single($("primera"), function (b) { st.primera = b ? b.getAttribute("data-v") : ""; render(); });
  }
  function render() {
    var m = C.mol[st.k], lv = $("r-level"), tr = m && C.trat[m[3]], link = $("r-trat");
    $("r-title").textContent = m ? m[0] : "Marca lo que te molesta";
    $("r-text").textContent = m ? m[2] : "Elige una opción y te contamos qué tratamiento suele corresponder.";
    var urg = m && m[1] === "urgente";
    $("res").classList.toggle("urgent", !!urg);
    $("r-call").hidden = !urg;
    if (m && m[1]) { lv.hidden = false; lv.className = "level " + m[1]; lv.textContent = urg ? "Urgencia: llámanos ahora" : "Conviene venir pronto"; } else lv.hidden = true;
    if (tr) { link.hidden = false; link.href = location.pathname.replace(/\/(index\.html)?$/, "") + "/" + m[3]; link.textContent = "Ver " + tr[0] + " · " + tr[1] + " →"; } else link.hidden = true;
    var msg = "Hola, " + (urg ? "es una urgencia: " + m[4] + ". ¿Me pueden atender hoy?" : "quiero agendar una hora en " + C.n + (m ? " por " + m[4] : "") + ".");
    if (st.cuando && !urg) msg += " Me acomoda " + st.cuando + ".";
    if (st.primera === "1") msg += " Es mi primera vez.";
    if (st.primera === "0") msg += " Ya soy paciente.";
    if (!urg) msg += " ¿Qué horas tienen disponibles?";
    $("r-msg").textContent = msg;
    $("r-wa").href = WA(msg);
  }
  // Antes y después: el control deslizante mueve la línea
  document.querySelectorAll(".ba-range").forEach(function (r) {
    r.addEventListener("input", function () { r.closest(".ba").style.setProperty("--pos", r.value + "%"); });
  });
'''

CSS = '''
/* Salud */
.pro-chip{position:absolute;left:-8px;bottom:22px;background:var(--surface);border-radius:18px;box-shadow:var(--shadow);padding:12px 16px;display:flex;align-items:center;gap:12px;text-decoration:none;max-width:calc(100% - 16px)}
.pro-chip b{display:block;font-size:15px;line-height:1.2}
.pro-chip small{display:block;font-size:13px;color:var(--muted)}
.avatar.sm{width:44px;height:44px;font-size:16px}
.r-link{color:#fff;font-weight:800;text-decoration:underline;text-underline-offset:3px}
.pro{display:grid;gap:28px;align-items:center}
.pro-ph{aspect-ratio:7/8;border-radius:24px;max-width:460px;width:100%}
.pro-lead{color:var(--muted);font-size:17px;margin:0 0 18px}
.creds{list-style:none;margin:0 0 16px;padding:0;display:grid;gap:12px}
.creds li{display:flex;gap:14px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.creds .ic,.conv .ic,.fact .ic{width:42px;height:42px;border-radius:12px;background:var(--brand-soft);color:var(--brand-text);display:grid;place-items:center;flex:none}
.creds b{display:block;font-size:15.5px}
.creds small{display:block;color:var(--muted);font-size:14px}
.verify{display:inline-flex;align-items:center;gap:8px;font-weight:800;color:var(--brand-text);text-decoration:none;font-size:15px}
.verify .icon{width:18px;height:18px}
.convs{display:grid;gap:12px;margin-top:18px}
.conv{display:flex;gap:14px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px}
.conv b{display:block;font-size:16px}
.conv p{margin:2px 0 0;color:var(--muted);font-size:14.5px}
.facts3,.facts4{display:grid;gap:12px;margin-top:16px}
.fact{display:flex;gap:14px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px}
.fact b{display:block;font-size:15.5px}
.fact span:not(.ic){display:block;color:var(--muted);font-size:14.5px}
.ba-grid{display:grid;gap:16px}
.ba{margin:0}
.ba-frame{position:relative;aspect-ratio:4/3;border-radius:var(--radius);overflow:hidden;background:var(--brand-soft)}
.ba-frame img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ba-antes{position:absolute;inset:0;clip-path:inset(0 calc(100% - var(--pos)) 0 0)}
.ba-frame::after{content:"";position:absolute;top:0;bottom:0;left:var(--pos);width:3px;margin-left:-1px;background:#fff;box-shadow:0 0 12px rgba(0,0,0,.4);pointer-events:none}
.ba-tag{position:absolute;top:10px;background:rgba(0,0,0,.6);color:#fff;font-size:12px;font-weight:800;padding:3px 10px;border-radius:999px;pointer-events:none}
.ba-tag.l{left:10px}.ba-tag.r{right:10px}
.ba-range{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize}
.ba figcaption{font-weight:700;margin-top:8px;font-size:15px}
.ba-vacio .ba-frame{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;border:2px dashed var(--line);background:var(--surface);color:var(--muted);padding:16px}
.ba-vacio .ba-frame::after{display:none}
.ba-vacio .icon{width:34px;height:34px;color:var(--brand-text)}
.ba-vacio b{color:var(--ink)}
.ba-vacio span{font-size:14px}
/* Página de tratamiento */
.hero.sub{padding-bottom:50px}
.crumbs{font-size:14px;color:var(--muted);margin-bottom:6px}
.crumbs a{color:var(--brand-text);text-decoration:none;font-weight:700}
.two{display:grid;gap:36px}
.two>*{min-width:0}
@media (max-width:639px){.prow .val{white-space:normal;max-width:55%}}
.checks{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:10px}
.checks li{display:flex;gap:10px;align-items:flex-start;font-size:16px}
.checks .icon{width:20px;height:20px;margin-top:3px;color:var(--brand-text)}
.timeline{list-style:none;margin:14px 0 0;padding:0 0 0 22px;border-left:3px solid var(--brand-soft);display:grid;gap:12px;counter-reset:t}
.timeline li{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.timeline li::before{counter-increment:t;content:counter(t);position:absolute;left:-36px;top:14px;width:26px;height:26px;border-radius:50%;background:var(--brand);color:var(--on-brand);font-size:13px;font-weight:800;display:grid;place-items:center}
.timeline b{display:block}
.timeline span{color:var(--muted);font-size:15px}
.care{margin-top:16px}
.care h3{margin:0;font-size:18px}
.otros-t{font-size:clamp(24px,3.4vw,32px);margin:44px 0 16px}
.minis{display:grid;gap:12px}
.mini-card{display:flex;gap:12px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:10px;text-decoration:none}
.mini-card:hover{border-color:var(--brand)}
.mini-card img{width:72px;height:56px;border-radius:10px;object-fit:cover;flex:none}
.mini-card b{display:block;font-size:15px}
.mini-card small{display:block;color:var(--muted);font-size:13.5px}
@media (min-width:640px){
  .convs{grid-template-columns:1fr 1fr}
  .facts3{grid-template-columns:repeat(3,1fr)}
  .facts4{grid-template-columns:1fr 1fr}
  .ba-grid{grid-template-columns:repeat(2,1fr)}
  .minis{grid-template-columns:1fr 1fr}
}
@media (min-width:900px){
  .pro{grid-template-columns:.9fr 1.1fr;gap:56px}
  .convs{grid-template-columns:repeat(4,1fr)}
  .facts4{grid-template-columns:repeat(4,1fr)}
  .ba-grid{grid-template-columns:repeat(3,1fr)}
  .two{grid-template-columns:1fr 1fr;gap:56px}
  .minis{grid-template-columns:repeat(3,1fr)}
}
'''
escribir(d['slug'], d, h, CSS, JS, paginas)
