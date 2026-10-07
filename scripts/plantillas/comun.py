"""Piezas comunes de las plantillas por rubro (veterinaria.py, gimnasio.py).

Cada generador arma la página desde una ficha JSON (carpeta datos/) y escribe una carpeta
lista para subir: index.html, styles.css, app.js e icons.svg.
"""
import html
import json
import os
import shutil
import sys
from urllib.parse import quote

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(os.path.dirname(AQUI))
DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']


def cargar(nombre_por_defecto):
    ruta = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, 'datos', nombre_por_defecto)
    with open(ruta, encoding='utf-8') as f:
        return json.load(f)


def e(s):
    return html.escape(str(s), quote=True)


def ic(nombre, fill=False):
    return f'<svg class="icon{" icon-fill" if fill else ""}"><use href="{{B}}/icons.svg#{nombre}"/></svg>'


def px(foto_id, w=900):
    return f'https://images.pexels.com/photos/{foto_id}/pexels-photo-{foto_id}.jpeg?auto=compress&amp;cs=tinysrgb&amp;w={w}'


def wa(d, msg):
    num = d.get('whatsapp', '').replace('+', '').replace(' ', '')
    return f'https://wa.me/{num}?text={quote(msg)}'


def tel(d):
    t = d.get('telefono', '').replace(' ', '')
    return f'tel:{t}' if t else '#contacto'


def estrellas(label=None):
    a = f' aria-label="{e(label)}"' if label else ' aria-hidden="true"'
    return f'<span class="stars"{a}>' + ic('i-star', True) * 5 + '</span>'


def tbd(d, txt='Ejemplo'):
    return f'<span class="tbd">{e(txt)}</span>' if d.get('demo') else ''


def head(d, title, desc, fuentes, extra_head=''):
    return f'''<!DOCTYPE html>
<html lang="es-CL">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<!-- Maqueta de propuesta: no indexar hasta que el cliente la apruebe y tenga su dominio -->
<meta name="robots" content="noindex, nofollow">
<meta property="og:type" content="website">
<meta property="og:locale" content="es_CL">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta name="theme-color" content="{e(d['tema']['brand'])}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="{fuentes}" rel="stylesheet">
{extra_head}<link rel="stylesheet" href="{{B}}/styles.css">
</head>
<body>
<a class="skip" href="#inicio">Ir al contenido</a>
'''


def aviso_demo(d):
    if d.get('demo'):
        return '<div class="demo">Plantilla de muestra · <b>nombre, precios y reseñas son de ejemplo</b> y se cambian por los del negocio</div>\n'
    return '<div class="demo">Propuesta de diseño · <b>maqueta de muestra</b>, no es el sitio oficial</div>\n'


def cabecera(d, icono, nav, cta_txt, cta_corto, cta_msg):
    links = '\n'.join(f'      <a href="#{a}">{e(t)}</a>' for a, t in nav)
    return f'''
<header class="top">
  <div class="wrap">
    <a class="logo" href="{{B}}" aria-label="{e(d['nombre'])}, inicio">
      <span class="logo-mark">{ic(icono)}</span>
      <span><b>{e(d['nombre_corto'])}</b><small>{e(d['bajada'])}</small></span>
    </a>
    <nav class="main" aria-label="Principal">
{links}
    </nav>
    <a class="btn btn-wa btn-sm" href="{wa(d, cta_msg)}" target="_blank" rel="noopener">{ic('i-wa', True)}{e(cta_corto)}<span>&nbsp;{e(cta_txt)}</span></a>
  </div>
</header>
'''


def horario_tabla(d):
    filas = []
    for i, h in enumerate(d['horario']):
        txt = f'{h[0]} a {h[1]}' if h else 'Cerrado'
        filas.append(f'<tr data-dia="{i}"><td>{DIAS[i]}</td><td>{txt}</td></tr>')
    return '<table class="hours">' + ''.join(filas) + '</table>'


def resenas(d, titulo, kicker='Lo que dicen'):
    items = ''.join(
        f'<figure class="review">{estrellas("5 de 5 estrellas")}<blockquote>“{e(r["texto"])}”</blockquote>'
        f'<figcaption><b>{e(r["nombre"])}</b> · Reseña en Google</figcaption></figure>'
        for r in d['resenas'])
    aviso = ' <span class="tbd">Reseñas de ejemplo</span>' if d.get('demo') else ''
    g = d['google']
    return f'''
  <section id="resenas" class="alt" aria-labelledby="rev-title">
    <div class="wrap rev-sum">
      <div class="rev-card reveal">
        <b>{e(g['nota'])}</b>
        {estrellas()}
        <p>{e(g['cantidad'])} reseñas en Google</p>
        <a class="btn btn-ghost" href="{e(g['link'])}" target="_blank" rel="noopener">Ver reseñas en Google</a>
      </div>
      <div class="reveal">
        <span class="kicker">{e(kicker)}</span>
        <h2 id="rev-title">{e(titulo)}{aviso}</h2>
        <div class="reviews">{items}</div>
      </div>
    </div>
  </section>
'''


def preguntas(d, faqs):
    items = '\n'.join(
        f'        <details><summary>{e(q)}{ic("i-chev")}</summary><p>{a}</p></details>' for q, a in faqs)
    return f'''
  <section id="preguntas" aria-labelledby="faq-title">
    <div class="wrap">
      <div class="section-head center reveal">
        <span class="kicker">Preguntas frecuentes</span>
        <h2 id="faq-title">Resolvemos tus dudas</h2>
      </div>
      <div class="faq reveal">
{items}
      </div>
    </div>
  </section>
'''


def contacto(d, kicker, titulo, texto, cta_txt, cta_msg):
    q = quote(d['direccion'] + ', ' + d['comuna'] + ', Chile')
    filas = [
        ('i-pin', 'Dirección', f'<a href="https://www.google.com/maps/dir/?api=1&amp;destination={q}" target="_blank" rel="noopener">{e(d["direccion"])}, {e(d["comuna"])} · Cómo llegar</a>{tbd(d)}'),
        ('i-clock', 'Horario', horario_tabla(d)),
        ('i-wa', 'WhatsApp y teléfono', f'<a href="{wa(d, cta_msg)}" target="_blank" rel="noopener">{e(d.get("telefono_txt", d.get("telefono", "")))}</a>{tbd(d)}'),
    ]
    if d.get('instagram'):
        filas.append(('i-heart', 'Instagram', f'<a href="https://www.instagram.com/{e(d["instagram"])}" target="_blank" rel="noopener">@{e(d["instagram"])}</a>'))
    rows = '\n'.join(
        f'        <div class="row"><span class="ic">{ic(i, i == "i-wa")}</span><div style="flex:1"><b>{t}</b>{v}</div></div>' for i, t, v in filas)
    return f'''
  <section id="contacto" class="alt" aria-labelledby="contact-title">
    <div class="wrap contact">
      <div class="final reveal">
        <span class="kicker">{e(kicker)}</span>
        <h2 id="contact-title">{e(titulo)}</h2>
        <p>{e(texto)}</p>
        <div class="cta-row"><a class="btn btn-wa" href="{wa(d, cta_msg)}" target="_blank" rel="noopener">{ic('i-wa', True)}{e(cta_txt)}</a><a class="btn btn-ghost" href="{tel(d)}">{ic('i-phone')}Llamar</a></div>
      </div>
      <div class="box reveal">
        <div class="map"><iframe title="Mapa: {e(d['direccion'])}, {e(d['comuna'])}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q={q}&amp;z=15&amp;output=embed"></iframe></div>
{rows}
      </div>
    </div>
  </section>
'''


def pie(d, columnas, cta_txt, cta_msg):
    cols = '\n'.join(f'    <div><strong>{e(t)}</strong><p style="margin:8px 0 0">{c}</p></div>' for t, c in columnas)
    return f'''
</main>

<footer>
  <div class="wrap">
    <div><strong style="font-size:18px">{e(d['nombre'])}</strong><p style="margin:8px 0 0">{e(d['resumen'])}</p></div>
{cols}
    <div class="foot-small">{"Plantilla de muestra con datos de ejemplo" if d.get("demo") else "Maqueta de propuesta"} · Diseño y desarrollo web.</div>
  </div>
</footer>

<nav class="mbar" aria-label="Acciones rápidas">
  <a class="call" href="{tel(d)}">{ic('i-phone')}Llamar</a>
  <a class="go" href="{wa(d, cta_msg)}" target="_blank" rel="noopener">{ic('i-wa', True)}{e(cta_txt)}</a>
</nav>
<a class="wa-float" href="{wa(d, cta_msg)}" target="_blank" rel="noopener" aria-label="Escribir por WhatsApp"><svg class="icon-fill" viewBox="0 0 24 24"><use href="{{B}}/icons.svg#i-wa"/></svg></a>
'''


def config_js(d, extra):
    cfg = {'wa': d.get('whatsapp', '').replace('+', '').replace(' ', ''), 'tel': d.get('telefono', ''),
           'horario': d['horario']}
    cfg.update(extra)
    return '<script id="cfg" type="application/json">' + json.dumps(cfg, ensure_ascii=False).replace('</', '<\\/') + '</script>\n'


COMUN_JS = r'''
  var C = JSON.parse(document.getElementById("cfg").textContent);
  var $ = function (id) { return document.getElementById(id); };
  var WA = function (msg) { return "https://wa.me/" + C.wa + "?text=" + encodeURIComponent(msg); };
  // Abierto o cerrado ahora, según el horario de la ficha (lunes = 0)
  (function () {
    var el = $("status"); var now = new Date(); var d = (now.getDay() + 6) % 7;
    var mins = now.getHours() * 60 + now.getMinutes();
    var toM = function (s) { var p = s.split(":"); return +p[0] * 60 + +p[1]; };
    document.querySelectorAll('.hours tr[data-dia="' + d + '"]').forEach(function (tr) { tr.className = "today"; });
    if (!el) return;
    var h = C.horario[d], txt, cls;
    if (h && mins >= toM(h[0]) && mins < toM(h[1])) { txt = "Abierto ahora · cierra a las " + h[1]; cls = "open"; }
    else {
      cls = "closed";
      if (h && mins < toM(h[0])) txt = "Cerrado · abre hoy a las " + h[0];
      else { for (var i = 1; i <= 7; i++) { var n = C.horario[(d + i) % 7]; if (n) { txt = "Cerrado · abre " + (i === 1 ? "mañana" : ["el lunes", "el martes", "el miércoles", "el jueves", "el viernes", "el sábado", "el domingo"][(d + i) % 7]) + " a las " + n[0]; break; } } }
    }
    el.className = "status " + cls; el.innerHTML = "<i></i>" + txt;
  })();
  var reveal = function () {
    var els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) { els.forEach(function (x) { x.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } }); }, { threshold: 0.12 });
    els.forEach(function (x) { io.observe(x); });
  };
  var single = function (groupEl, onChange) {
    groupEl.addEventListener("click", function (ev) {
      var b = ev.target.closest(".opt"); if (!b || !groupEl.contains(b)) return;
      var was = b.getAttribute("aria-pressed") === "true";
      groupEl.querySelectorAll(".opt").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", was ? "false" : "true");
      onChange(was ? null : b);
    });
  };
'''


def escribir(slug, d, html_txt, css_extra, js_rubro):
    out = os.path.join(RAIZ, slug)
    os.makedirs(out, exist_ok=True)
    B = '/' + slug
    t = d['tema']
    tema = ':root{' + ''.join(f'--{k}:{v};' for k, v in t.items()) + '}\n'
    with open(os.path.join(AQUI, 'base.css'), encoding='utf-8') as f:
        base = f.read()
    with open(os.path.join(out, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html_txt.replace('{B}', B))
    with open(os.path.join(out, 'styles.css'), 'w', encoding='utf-8') as f:
        f.write(tema + base + css_extra)
    with open(os.path.join(out, 'app.js'), 'w', encoding='utf-8') as f:
        f.write('(function () {' + COMUN_JS + js_rubro + '\n  reveal();\n})();\n')
    shutil.copyfile(os.path.join(AQUI, 'icons.svg'), os.path.join(out, 'icons.svg'))
    print('Listo:', out)
