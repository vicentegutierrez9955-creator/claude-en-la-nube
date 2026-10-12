"""Plantilla para servicios para la casa (jardinería, paisajismo, piscinas, pérgolas, riego, pisos).

Uso:  python3 scripts/plantillas/hogar.py [ficha.json]
Sin ficha usa datos/hogar-demo.json. La carpeta de salida es el "slug" de la ficha.
Además de la portada arma una página por servicio (/slug/servicio), para aparecer en Google
con búsquedas como "construcción de piscinas Chicureo".
"""
import json

from comun import (cargar, e, ic, px, wa, tel, estrellas, tbd, head, aviso_demo, cabecera,
                   resenas, preguntas, contacto, pie, config_js, escribir)

d = cargar('hogar-demo.json')
N, Z = d['nombre_corto'], d['zona']
MSG = f'Hola, quiero cotizar un trabajo con {N}. ¿Me pueden ayudar?'
FUENTES = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap'
S = d['servicios']
PROY = d['proyectos']
clp = lambda n: '$' + f'{round(n):,}'.replace(',', '.')


def msg_serv(s):
    return f'Hola, quiero cotizar {s["msg"]} con {N}. ¿Pueden venir a ver el lugar?'


def desde(s):
    if s.get('m2'):
        return f'Desde <b>{clp(s["m2"][0])}</b> el m²'
    if s.get('opciones'):
        return f'Desde <b>{clp(s["opciones"][0]["min"])}</b>'
    return f'Desde <b>{clp(s["mes"][0])}</b> al mes'


def schema():
    s = {'@context': 'https://schema.org', '@type': d.get('schema_tipo', 'HomeAndConstructionBusiness'), 'name': d['nombre'],
         'description': d['resumen'], 'telephone': d.get('telefono_txt', ''),
         'address': {'@type': 'PostalAddress', 'streetAddress': d['direccion'], 'addressLocality': d['comuna'], 'addressCountry': 'CL'},
         'areaServed': d['cobertura']}
    return '<script type="application/ld+json">' + json.dumps(s, ensure_ascii=False).replace('</', '<\\/') + '</script>\n'


def cierre(extra_cfg=None):
    return config_js(d, extra_cfg or {}) + '<script src="{B}/app.js"></script>\n</body>\n</html>\n'


def tarjeta_proyecto(p):
    """Proyecto con foto del resultado y, si hay foto del antes, un control para comparar."""
    tipo = next((s['t'] for s in S if s['slug'] == p['tipo']), '')
    meta = ' · '.join(x for x in [tipo, p['comuna'], p.get('detalle', '')] if x)
    if p.get('antes'):
        media = f'''<div class="ba-frame" style="--pos:50%">
            <img src="{px(p['despues'], 800)}" alt="{e(p['alt'])}, terminado" loading="lazy">
            <div class="ba-antes"><img src="{px(p['antes'], 800)}" alt="{e(p['alt'])}, antes" loading="lazy"></div>
            <span class="ba-tag l">Antes</span><span class="ba-tag r">Después</span>
            <input class="ba-range" type="range" min="0" max="100" value="50" aria-label="Comparar antes y después: {e(p['t'])}">
          </div>'''
    else:
        media = f'<div class="ba-frame"><img src="{px(p["despues"], 800)}" alt="{e(p["alt"])}" loading="lazy"><span class="ba-tag r">Terminado</span></div>'
    return f'''
        <figure class="proj" data-tipo="{e(p['tipo'])}">
          {media}
          <figcaption><b>{e(p['t'])}</b><span>{e(meta)}</span></figcaption>
        </figure>'''


NAV = [('servicios', 'Servicios'), ('proyectos', 'Proyectos'), ('cotizar', 'Cotizar'), ('mantencion', 'Mantención')]
NAV_SUB = [('{B}#servicios', 'Servicios'), ('{B}#proyectos', 'Proyectos'), ('{B}#cotizar', 'Cotizar'), ('{B}#mantencion', 'Mantención')]
PIE_COLS = [('Servicios', '<br>'.join(f'<a href="{{B}}/{e(s["slug"])}">{e(s["t"])}</a>' for s in S[:5])),
            ('Contacto', f'{e(Z)}<br><a href="{wa(d, MSG)}" target="_blank" rel="noopener">WhatsApp {e(d.get("telefono_txt", ""))}</a>')]
comunas_chips = ''.join(f'<li>{e(c)}</li>' for c in d['cobertura'])

# ---------------------------------------------------------------- Portada
h = head(d, f'{d["rubro_titulo"]} en {Z} | {N}', d['descripcion'], FUENTES, schema())
h += aviso_demo(d)
h += cabecera(d, d.get('icono', 'i-leaf'), NAV, 'gratis', 'Cotizar', MSG)

trust = [f'{estrellas()}<a href="#resenas" style="color:inherit">{e(d["google"]["nota"])} · {e(d["google"]["cantidad"])} reseñas en Google</a>',
         f'{ic("i-shield")}Garantía de {e(d["garantia"]["meses"])} meses',
         f'{ic("i-file")}Boleta o factura',
         f'{ic("i-award")}{e(d["proyectos_hechos"])} proyectos desde {e(d["desde"])}']
h += f'''
<main id="inicio">

  <section class="hero hero-img" aria-labelledby="hero-title">
    <img class="hero-bg" src="{px(d['fotos']['hero'], 1600)}" alt="{e(d['fotos']['hero_alt'])}" fetchpriority="high">
    <div class="wrap">
      <div class="hero-box">
        <span class="kicker">{e(d['bajada'])} · {e(Z)}</span>
        <h1 id="hero-title">{e(d['h1'])} <em>{e(d['h1_em'])}</em></h1>
        <p class="lead">{e(d['lead'])}</p>
        <div class="cta-row">
          <a class="btn btn-primary" href="#cotizar">{ic('i-ruler')}Cotiza gratis en 1 minuto</a>
          <a class="btn btn-wa" href="{wa(d, MSG)}" target="_blank" rel="noopener">{ic('i-wa', True)}WhatsApp</a>
        </div>
        <ul class="trust">{''.join(f'<li>{x}</li>' for x in trust)}</ul>
      </div>
    </div>
  </section>

  <div class="zona"><div class="wrap"><b>{ic('i-pin')}Trabajamos en</b><ul class="chips">{comunas_chips}</ul></div></div>
'''

# Servicios
cards = ''.join(f'''
        <a class="card" href="{{B}}/{e(s['slug'])}">
          <span class="thumb"><img src="{px(s['foto'], 600)}" alt="{e(s['alt'])}" width="600" height="375" loading="lazy" onerror="this.remove()"></span>
          <span class="body"><h3>{e(s['t'])}</h3><p>{e(s['d'])}</p><span class="price-tag">{desde(s)}</span><span class="more">Ver servicio{ic('i-arrow')}</span></span>
        </a>''' for s in S)
h += f'''
  <section id="servicios" aria-labelledby="svc-title">
    <div class="wrap">
      <div class="section-head reveal">
        <span class="kicker">Servicios</span>
        <h2 id="svc-title">{e(d['titulo_servicios'])}</h2>
        <p>Nos encargamos de todo: diseño, materiales, obra y limpieza final. Precios de referencia para que sepas por dónde parte.</p>
      </div>
      <div class="cards reveal">{cards}
      </div>
    </div>
  </section>
'''

# Proyectos (galería filtrable)
tipos = [s for s in S if any(p['tipo'] == s['slug'] for p in PROY)]
filtros = '<button class="tab" role="tab" aria-selected="true" data-f="">Todos</button>' + ''.join(
    f'<button class="tab" role="tab" aria-selected="false" data-f="{e(s["slug"])}">{e(s["corto"])}</button>' for s in tipos)
h += f'''
  <section id="proyectos" class="alt" aria-labelledby="proj-title">
    <div class="wrap">
      <div class="section-head reveal">
        <span class="kicker">Proyectos</span>
        <h2 id="proj-title">Trabajos que hemos hecho{tbd(d, 'Fotos de ejemplo')}</h2>
        <p>{'Desliza sobre las fotos para ver el antes y el después.' if any(p.get('antes') for p in PROY) else 'Fotos de trabajos terminados.'} Filtra por tipo de trabajo.</p>
      </div>
      <div class="tabs reveal" role="tablist" aria-label="Tipo de trabajo" id="filtros">{filtros}</div>
      <div class="proj-grid reveal" id="galeria">{''.join(tarjeta_proyecto(p) for p in PROY)}
      </div>
    </div>
  </section>
'''

# Cotizador
serv_opts = ''.join(f'<button type="button" class="opt" aria-pressed="false" data-s="{e(s["slug"])}">{e(s["corto"])}<small>{e(s["opt_txt"])}</small></button>' for s in S)
comunas_opts = ''.join(f'<option>{e(c)}</option>' for c in d['cobertura'])
h += f'''
  <section id="cotizar" aria-labelledby="tool-title">
    <div class="wrap">
      <div class="section-head reveal">
        <span class="kicker">Cotizador</span>
        <h2 id="tool-title">¿Cuánto costaría tu proyecto?</h2>
        <p>Responde 4 preguntas y te mostramos un rango de precio. Te lo confirmamos en la visita técnica, que es gratis.</p>
      </div>
      <div class="tool reveal">
        <div class="panel">
          <div class="step">
            <h3><i>1</i>¿Qué necesitas?</h3>
            <div class="opts" id="serv">{serv_opts}</div>
          </div>
          <div class="step" id="paso-tam" hidden>
            <h3><i>2</i><span id="tam-t">¿De qué tamaño?</span></h3>
            <div id="tam-m2" hidden>
              <div class="m2-row"><input id="m2" type="range" min="10" max="600" step="10" value="80" aria-label="Metros cuadrados aproximados"><output id="m2-out" for="m2">80 m²</output></div>
              <p class="hint">Si no sabes: un patio de casa suele tener entre 50 y 150 m².</p>
            </div>
            <div class="opts" id="tam-op" hidden></div>
          </div>
          <div class="step">
            <h3><i>3</i>¿En qué comuna?</h3>
            <select class="field" id="comuna" aria-label="Comuna"><option value="">Elige tu comuna</option>{comunas_opts}<option value="otra">Otra comuna</option></select>
          </div>
          <div class="step">
            <h3><i>4</i>¿Para cuándo?</h3>
            <div class="opts" id="cuando">
              <button type="button" class="opt" aria-pressed="false" data-v="lo antes posible">Lo antes posible</button>
              <button type="button" class="opt" aria-pressed="false" data-v="en 1 a 2 meses">En 1 a 2 meses</button>
              <button type="button" class="opt" aria-pressed="false" data-v="solo estoy cotizando">Solo cotizando</button>
            </div>
          </div>
          <p class="photo-tip">{ic('i-camera')}<span>¿Tienes fotos del lugar? Mándalas en el WhatsApp: con ellas el precio sale más exacto.</span></p>
        </div>
        <aside class="result" id="res" aria-live="polite">
          <span class="kicker">Tu estimación</span>
          <h3 id="r-title">Elige un servicio</h3>
          <p class="range" id="r-range" hidden></p>
          <p id="r-text">Marca lo que necesitas y te mostramos un rango de precio aproximado.</p>
          <ul class="list-plain" id="r-inc"></ul>
          <div class="bubble"><small>Mensaje que nos llega</small><span id="r-msg">{e(MSG)}</span></div>
          <a class="btn btn-wa" id="r-wa" href="{wa(d, MSG)}" target="_blank" rel="noopener">{ic('i-wa', True)}Pedir visita gratis</a>
          <span class="fine">Precio referencial con IVA. El valor final depende del terreno, los materiales y el acceso.</span>
        </aside>
      </div>
    </div>
  </section>
'''

# Proceso
pasos = ''.join(f'<li><span class="plazo">{e(c)}</span><b>{e(a)}</b><span>{e(b)}</span></li>' for a, b, c in d['proceso'])
g, pg = d['garantia'], d['pagos']
seg = [('i-shield', f'Garantía de {g["meses"]} meses', g['texto']), ('i-file', 'Boleta o factura', pg['boleta']),
       ('i-card', 'Pago por etapas', pg['etapas']), ('i-calendar', 'Cuotas', pg['cuotas'])]
seg_html = ''.join(f'<div class="conv"><span class="ic">{ic(i)}</span><div><b>{e(a)}</b><p>{e(b)}</p></div></div>' for i, a, b in seg)
h += f'''
  <section id="proceso" class="alt" aria-labelledby="proc-title">
    <div class="wrap two">
      <div class="reveal">
        <span class="kicker">Cómo trabajamos</span>
        <h2 id="proc-title">De la visita a la entrega, con plazos claros</h2>
        <ol class="timeline">{pasos}</ol>
      </div>
      <div class="reveal">
        <span class="kicker">Trabajo serio</span>
        <h2>Tu inversión, protegida</h2>
        <div class="convs">{seg_html}</div>
      </div>
    </div>
  </section>
'''

# Mantención mensual
def plan(p):
    items = ''.join(f'<li>{ic("i-check")}{e(i)}</li>' for i in p['items'])
    top = ' top' if p.get('top') else ''
    nota = f'<span class="badge">{e(p["nota"])}</span>' if p.get('nota') else ''
    m = f'Hola, me interesa el plan de mantención "{p["t"]}" de {N}. ¿Me cuentan más?'
    return f'''<article class="plan{top}">{nota}
          <h3>{e(p['t'])}</h3>
          <p class="pdesc">{e(p['d'])}</p>
          <p class="price"><b>{clp(p['precio'])}</b><small>al mes</small></p>
          <ul>{items}</ul>
          <a class="btn {"btn-primary" if p.get("top") else "btn-ghost"}" href="{wa(d, m)}" target="_blank" rel="noopener">Quiero este plan</a>
        </article>'''


h += f'''
  <section id="mantencion" aria-labelledby="mant-title">
    <div class="wrap">
      <div class="section-head center reveal">
        <span class="kicker">Mantención mensual</span>
        <h2 id="mant-title">Tu jardín y tu piscina, siempre listos{tbd(d, 'Valores de ejemplo')}</h2>
        <p>Vamos en días fijos, te avisamos antes y te mandamos fotos al terminar. Sin contrato de permanencia.</p>
      </div>
      <div class="plans reveal">{''.join(plan(p) for p in d['mantencion'])}</div>
    </div>
  </section>
'''

h += resenas(d, d['titulo_resenas'], 'Lo que dicen nuestros clientes')
h += preguntas(d, [(q, e(a)) for q, a in d['faqs']])
h += contacto(d, 'Visita técnica gratis', d['titulo_contacto'],
              f'Vamos a tu casa, medimos y te damos el presupuesto por escrito en 48 horas. Atendemos {", ".join(d["cobertura"][:4])} y alrededores.',
              'Pedir visita por WhatsApp', MSG)
h += pie(d, PIE_COLS, 'Cotizar por WhatsApp', MSG)

SERV = {s['slug']: {'t': s['t'], 'corto': s['corto'], 'm2': s.get('m2'), 'mes': s.get('mes'), 'op': s.get('opciones'),
                    'tam': s.get('tam_t', ''), 'inc': s['incluye'][:4], 'msg': s['msg'], 'plazo': s['plazo']} for s in S}
h += cierre({'serv': SERV, 'n': N, 'cob': d['cobertura']})


# ---------------------------------------------------------------- Una página por servicio
def pagina(s):
    sp = s['pagina']
    MS = msg_serv(s)
    x = head(d, f'{s["t"]} en {Z} | {N}', sp['descripcion'], FUENTES, schema())
    x += aviso_demo(d)
    x += cabecera(d, d.get('icono', 'i-leaf'), NAV_SUB, 'gratis', 'Cotizar', MS)
    inc = ''.join(f'<li>{ic("i-check")}<span>{e(i)}</span></li>' for i in s['incluye'])
    if s.get('m2'):
        filas = [(f'Por m²', 'Según terreno y materiales', f'{clp(s["m2"][0])} a {clp(s["m2"][1])}')]
        filas += [(f'Ejemplo: {m} m²', 'Aproximado', f'{clp(s["m2"][0] * m)} a {clp(s["m2"][1] * m)}') for m in (50, 100)]
    elif s.get('opciones'):
        filas = [(o['t'], o.get('s', ''), f'{clp(o["min"])} a {clp(o["max"])}') for o in s['opciones']]
    else:
        filas = [('Mensual', 'Según tamaño', f'{clp(s["mes"][0])} a {clp(s["mes"][1])}')]
    tabla = ''.join(f'<div class="prow"><div><b>{e(a)}</b><small>{e(b)}</small></div><span class="val">{e(c)}</span></div>' for a, b, c in filas)
    suyos = [p for p in PROY if p['tipo'] == s['slug']]
    titulo_proy = f'Trabajos de {e(s["corto"].lower())}' if suyos else 'Algunos de nuestros trabajos'
    suyos = suyos or PROY[:2]
    otros = ''.join(f'<a class="mini-card" href="{{B}}/{e(o["slug"])}"><img src="{px(o["foto"], 300)}" alt="" loading="lazy" onerror="this.remove()"><span><b>{e(o["t"])}</b><small>{desde(o).replace("<b>", "").replace("</b>", "")}</small></span></a>'
                    for o in S if o['slug'] != s['slug'])
    x += f'''
<main id="inicio">
  <section class="hero sub" aria-labelledby="hero-title">
    <div class="wrap">
      <div>
        <nav class="crumbs" aria-label="Estás en"><a href="{{B}}">Inicio</a> › <a href="{{B}}#servicios">Servicios</a> › <span>{e(s['t'])}</span></nav>
        <h1 id="hero-title">{e(s['t'])} en {e(Z)}</h1>
        <p class="lead">{e(sp['intro'])}</p>
        <div class="cta-row"><a class="btn btn-primary" href="{{B}}?s={e(s['slug'])}#cotizar">{ic('i-ruler')}Cotizar {e(s['corto'].lower())}</a><a class="btn btn-wa" href="{wa(d, MS)}" target="_blank" rel="noopener">{ic('i-wa', True)}WhatsApp</a></div>
        <ul class="trust"><li>{estrellas()}{e(d['google']['nota'])} · {e(d['google']['cantidad'])} reseñas</li><li>{ic('i-shield')}Garantía de {e(g['meses'])} meses</li><li>{ic('i-clock')}{e(s['plazo'])}</li></ul>
      </div>
      <div class="hero-media"><div class="ph hero-ph"><img src="{px(s['foto'], 900)}" alt="{e(s['alt'])}" width="520" height="650" fetchpriority="high"></div></div>
    </div>
  </section>

  <section aria-labelledby="inc-title">
    <div class="wrap two">
      <div class="reveal">
        <span class="kicker">Qué incluye</span>
        <h2 id="inc-title">Nos encargamos de todo</h2>
        <ul class="checks">{inc}</ul>
      </div>
      <div class="reveal">
        <span class="kicker">Precios de referencia</span>
        <h2>¿Cuánto cuesta?{tbd(d, 'Valores de ejemplo')}</h2>
        <div class="price-box">{tabla}</div>
        <p class="note">{e(sp['precio_txt'])}</p>
      </div>
    </div>
  </section>

  <section class="alt" aria-labelledby="sp-title">
    <div class="wrap">
      <div class="section-head reveal">
        <span class="kicker">Proyectos</span>
        <h2 id="sp-title">{titulo_proy}{tbd(d, 'Fotos de ejemplo')}</h2>
      </div>
      <div class="proj-grid reveal">{''.join(tarjeta_proyecto(p) for p in suyos)}</div>
    </div>
  </section>
'''
    x += preguntas(d, [(q, e(a)) for q, a in sp['faqs']])
    x += f'''
  <section class="alt" aria-labelledby="otros-title">
    <div class="wrap">
      <div class="final reveal" style="min-height:0">
        <span class="kicker">Visita técnica gratis</span>
        <h2>¿Vamos a ver tu {e(sp['lugar'])}?</h2>
        <p>Medimos, te mostramos ideas y te mandamos el presupuesto por escrito en 48 horas. Sin compromiso.</p>
        <div class="cta-row"><a class="btn btn-wa" href="{wa(d, MS)}" target="_blank" rel="noopener">{ic('i-wa', True)}Pedir visita por WhatsApp</a><a class="btn btn-ghost" href="{tel(d)}">{ic('i-phone')}Llamar</a></div>
      </div>
      <h2 id="otros-title" class="otros-t reveal">Otros servicios</h2>
      <div class="minis reveal">{otros}</div>
    </div>
  </section>
'''
    x += pie(d, PIE_COLS, 'Cotizar por WhatsApp', MS)
    x += cierre()
    # Sin teléfono, "Llamar" lleva a la ubicación, que está en la portada
    return x.replace('href="#contacto"', 'href="{B}#contacto"')


paginas = {s['slug']: pagina(s) for s in S}

JS = r'''
  var clp = function (n) { return "$" + Math.round(n).toLocaleString("es-CL"); };
  // Antes y después
  document.querySelectorAll(".ba-range").forEach(function (r) {
    r.addEventListener("input", function () { r.closest(".ba-frame").style.setProperty("--pos", r.value + "%"); });
  });
  // Filtro de proyectos
  if ($("filtros")) $("filtros").addEventListener("click", function (ev) {
    var b = ev.target.closest(".tab"); if (!b) return;
    $("filtros").querySelectorAll(".tab").forEach(function (x) { x.setAttribute("aria-selected", x === b ? "true" : "false"); });
    var f = b.getAttribute("data-f");
    document.querySelectorAll("#galeria .proj").forEach(function (p) { p.hidden = !!f && p.getAttribute("data-tipo") !== f; });
  });
  // Cotizador (solo en la portada)
  if ($("serv")) {
    var st = { s: "", op: -1, cuando: "" };
    single($("serv"), function (b) { st.s = b ? b.getAttribute("data-s") : ""; st.op = -1; armarTam(); render(); });
    single($("cuando"), function (b) { st.cuando = b ? b.getAttribute("data-v") : ""; render(); });
    $("m2").addEventListener("input", function () { $("m2-out").textContent = $("m2").value + " m²"; render(); });
    $("comuna").addEventListener("change", render);
    // Desde la página de un servicio se llega con ?s=servicio
    var pre = new URLSearchParams(location.search).get("s");
    var bp = pre && $("serv").querySelector('[data-s="' + pre + '"]');
    if (bp) bp.click();
  }
  function armarTam() {
    var s = C.serv[st.s];
    $("paso-tam").hidden = !s;
    if (!s) return;
    $("tam-t").textContent = s.tam || "¿De qué tamaño?";
    $("tam-m2").hidden = !s.m2;
    var op = $("tam-op"); op.hidden = !s.op; op.innerHTML = "";
    if (s.op) {
      s.op.forEach(function (o, i) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "opt"; b.setAttribute("aria-pressed", "false"); b.setAttribute("data-i", i);
        b.innerHTML = o.t + (o.s ? "<small>" + o.s + "</small>" : "");
        op.appendChild(b);
      });
      if (!op.dataset.listo) { op.dataset.listo = "1"; single(op, function (b) { st.op = b ? +b.getAttribute("data-i") : -1; render(); }); }
    }
  }
  function render() {
    var s = C.serv[st.s], com = $("comuna").value, rr = $("r-range"), inc = $("r-inc");
    var lo = 0, hi = 0, tam = "";
    if (s && s.m2) { var m = +$("m2").value; lo = s.m2[0] * m; hi = s.m2[1] * m; tam = m + " m² aprox."; }
    else if (s && s.op && st.op >= 0) { lo = s.op[st.op].min; hi = s.op[st.op].max; tam = s.op[st.op].t.toLowerCase(); }
    else if (s && s.mes) { lo = s.mes[0]; hi = s.mes[1]; }
    $("r-title").textContent = s ? s.t : "Elige un servicio";
    if (s && lo) { rr.hidden = false; rr.innerHTML = clp(lo) + " a " + clp(hi) + (s.mes ? " <small>al mes</small>" : ""); } else rr.hidden = true;
    var txt = "Marca lo que necesitas y te mostramos un rango de precio aproximado.";
    if (s && !lo) txt = "Elige el tamaño para ver el rango de precio.";
    if (s && lo) txt = "Plazo habitual: " + s.plazo + ". " + (com === "otra" ? "Escríbenos para confirmar si llegamos a tu comuna." : com ? "Visita técnica gratis en " + com + "." : "La visita técnica es gratis.");
    $("r-text").textContent = txt;
    inc.innerHTML = s ? s.inc.map(function (i) { return "<li>✓ " + i + "</li>"; }).join("") : "";
    var msg = "Hola, quiero cotizar " + (s ? s.msg : "un trabajo") + " con " + C.n + ".";
    if (tam) msg += " Tamaño: " + tam + ".";
    if (com && com !== "otra") msg += " Comuna: " + com + ".";
    if (st.cuando) msg += " Lo necesito " + st.cuando + ".";
    if (s && lo) msg += " En la página me salió entre " + clp(lo) + " y " + clp(hi) + (s.mes ? " al mes" : "") + ".";
    msg += " ¿Pueden venir a ver el lugar?";
    $("r-msg").textContent = msg;
    $("r-wa").href = WA(msg);
  }
'''

CSS = '''
/* Servicios para la casa */
.hero-img{min-height:min(88vh,760px);display:flex;align-items:flex-end;padding:120px 0 40px;background:var(--dark)}
.hero-img .hero-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hero-img::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,20,12,.1) 0%,rgba(10,20,12,.55) 55%,rgba(10,20,12,.8) 100%)}
.hero-img .wrap{position:relative;z-index:1;display:block}
.hero-box{max-width:680px;color:#fff}
.hero-img .kicker{color:var(--accent-on-dark)}
.hero-img h1 em{color:var(--accent-on-dark)}
.hero-img .lead{color:rgba(255,255,255,.88)}
.hero-img .trust,.hero-img .trust a{color:#fff}
.hero-img .trust .icon{color:var(--accent-on-dark)}
.zona{background:var(--dark);color:#fff;padding:14px 0}
.zona .wrap{display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center}
.zona b{display:flex;align-items:center;gap:8px;font-size:15px}
.zona b .icon{width:18px;height:18px;color:var(--accent-on-dark)}
.chips{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
.chips li{background:rgba(255,255,255,.12);border-radius:999px;padding:4px 12px;font-size:14px;font-weight:600}
.proj-grid{display:grid;gap:16px;margin-top:6px}
.proj{margin:0;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
.proj figcaption{padding:12px 16px 14px}
.proj figcaption b{display:block;font-size:16px}
.proj figcaption span{color:var(--muted);font-size:14px}
.ba-frame{position:relative;aspect-ratio:4/3;overflow:hidden;background:var(--brand-soft)}
.ba-frame img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ba-antes{position:absolute;inset:0;clip-path:inset(0 calc(100% - var(--pos)) 0 0)}
.ba-frame:has(.ba-antes)::after{content:"";position:absolute;top:0;bottom:0;left:var(--pos);width:3px;margin-left:-1px;background:#fff;box-shadow:0 0 12px rgba(0,0,0,.4);pointer-events:none}
.ba-tag{position:absolute;top:10px;background:rgba(0,0,0,.6);color:#fff;font-size:12px;font-weight:800;padding:3px 10px;border-radius:999px;pointer-events:none}
.ba-tag.l{left:10px}.ba-tag.r{right:10px}
.ba-range{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize}
.m2-row{display:flex;align-items:center;gap:14px}
.m2-row input{flex:1;accent-color:var(--brand)}
.m2-row output{font-weight:800;font-size:18px;min-width:84px;text-align:right;color:var(--brand-text)}
.hint{margin:6px 0 0;color:var(--muted);font-size:13.5px}
select.field{appearance:auto}
.photo-tip{display:flex;gap:10px;align-items:flex-start;margin:4px 0 0;padding:12px 14px;border-radius:14px;background:var(--brand-soft);font-size:14.5px}
.photo-tip .icon{color:var(--brand-text);width:20px;height:20px;margin-top:2px}
.range{margin:0;font-family:var(--font-head);font-size:30px;font-weight:700;line-height:1.1;color:#fff}
.range small{font-family:var(--font-body);font-size:15px;font-weight:600;color:rgba(255,255,255,.7)}
.two{display:grid;gap:36px}
.two>*{min-width:0}
@media (max-width:639px){.prow .val{white-space:normal;max-width:55%}}
.timeline{list-style:none;margin:14px 0 0;padding:0 0 0 22px;border-left:3px solid var(--brand-soft);display:grid;gap:12px;counter-reset:t}
.timeline li{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.timeline li::before{counter-increment:t;content:counter(t);position:absolute;left:-36px;top:14px;width:26px;height:26px;border-radius:50%;background:var(--brand);color:var(--on-brand);font-size:13px;font-weight:800;display:grid;place-items:center}
.timeline b{display:block}
.timeline span{color:var(--muted);font-size:15px}
.timeline .plazo{float:right;margin-left:10px;font-size:12px;font-weight:800;color:var(--accent-ink);background:var(--surface-2);border-radius:999px;padding:2px 10px}
.convs{display:grid;gap:12px;margin-top:14px}
.conv{display:flex;gap:14px;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px}
.conv .ic{width:42px;height:42px;border-radius:12px;background:var(--brand-soft);color:var(--brand-text);display:grid;place-items:center;flex:none}
.conv b{display:block;font-size:16px}
.conv p{margin:2px 0 0;color:var(--muted);font-size:14.5px}
.plans{display:grid;gap:16px}
.plan{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:26px 24px;display:flex;flex-direction:column;gap:10px}
.plan.top{border:2px solid var(--brand);box-shadow:var(--shadow)}
.plan .badge{position:absolute;top:-12px;left:24px;background:var(--accent);color:#fff;font-size:12px;font-weight:800;padding:4px 12px;border-radius:999px}
.plan h3{margin:0;font-size:22px}
.pdesc{margin:0;color:var(--muted);font-size:15px}
.price{margin:4px 0}
.price b{font-family:var(--font-head);font-size:34px}
.price small{color:var(--muted);font-weight:600;margin-left:6px}
.plan ul{list-style:none;margin:0 0 8px;padding:0;display:grid;gap:8px;flex:1}
.plan li{display:flex;gap:8px;font-size:15px}
.plan li .icon{width:18px;height:18px;margin-top:3px;color:var(--brand-text)}
.hero.sub{padding-bottom:50px}
.crumbs{font-size:14px;color:var(--muted);margin-bottom:6px}
.crumbs a{color:var(--brand-text);text-decoration:none;font-weight:700}
.checks{list-style:none;margin:14px 0 0;padding:0;display:grid;gap:10px}
.checks li{display:flex;gap:10px;align-items:flex-start;font-size:16px}
.checks .icon{width:20px;height:20px;margin-top:3px;color:var(--brand-text)}
.otros-t{font-size:clamp(24px,3.4vw,32px);margin:44px 0 16px}
.minis{display:grid;gap:12px}
.mini-card{display:flex;gap:12px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:10px;text-decoration:none}
.mini-card:hover{border-color:var(--brand)}
.mini-card img{width:72px;height:56px;border-radius:10px;object-fit:cover;flex:none}
.mini-card b{display:block;font-size:15px}
.mini-card small{display:block;color:var(--muted);font-size:13.5px}
@media (min-width:640px){
  .proj-grid{grid-template-columns:1fr 1fr}
  .convs{grid-template-columns:1fr 1fr}
  .minis{grid-template-columns:1fr 1fr}
}
@media (min-width:900px){
  .hero-img{padding:140px 0 70px}
  .proj-grid{grid-template-columns:repeat(3,1fr)}
  .two{grid-template-columns:1fr 1fr;gap:56px}
  .plans{grid-template-columns:repeat(3,1fr);align-items:stretch}
  .minis{grid-template-columns:repeat(3,1fr)}
}
'''
escribir(d['slug'], d, h, CSS, JS, paginas)
