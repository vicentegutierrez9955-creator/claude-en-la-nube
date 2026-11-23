// Tienda de STPyme en el navegador: aviso de cookies, píxeles (Meta, Google, Clarity) solo si la persona acepta,
// pasos del embudo (vio el producto, tocó comprar) y el formulario de compra que lleva a Mercado Pago.
// Uso: <script src="/js/tienda.js" data-producto="ebook-web-ia" data-respaldo="https://mpago.la/..." defer></script>
// Los botones de compra llevan la clase "pagar" o el atributo data-comprar.
(function () {
  var yo = document.currentScript;
  var PRODUCTO = (yo && yo.dataset.producto) || '';
  var RESPALDO = (yo && yo.dataset.respaldo) || '';
  var API = '/api/publico/tienda';
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var ss = { get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} } };

  // ---------- de dónde llegó (se guarda la primera vez, 30 días) ----------
  var q = new URLSearchParams(location.search);
  function canalDe() {
    var src = (q.get('utm_source') || '').toLowerCase();
    if (q.get('fbclid') || /facebook|^fb$|meta|^ig$/.test(src)) return /instagram|^ig$/.test(src) ? 'instagram' : 'meta';
    if (q.get('gclid') || q.get('gbraid') || q.get('wbraid') || /google/.test(src)) return 'google';
    if (q.get('ttclid') || /tiktok/.test(src)) return 'tiktok';
    if (/instagram/.test(src)) return 'instagram';
    if (/youtube/.test(src)) return 'youtube';
    if (/whatsapp|wa$/.test(src)) return 'whatsapp';
    if (/mail|correo|newsletter/.test(src)) return 'correo';
    if (src) return 'otro';
    var ref = ''; try { ref = new URL(document.referrer).hostname; } catch (e) {}
    if (!ref || ref === location.hostname) return '';
    if (/facebook|fb\.com|messenger/.test(ref)) return 'meta';
    if (/instagram/.test(ref)) return 'instagram';
    if (/google\./.test(ref)) return 'google';
    if (/tiktok/.test(ref)) return 'tiktok';
    if (/youtube|youtu\.be/.test(ref)) return 'youtube';
    if (/whatsapp|wa\.me/.test(ref)) return 'whatsapp';
    return 'otro';
  }
  var guardado = null; try { guardado = JSON.parse(ls.get('stp-origen') || 'null'); } catch (e) {}
  var nuevo = canalDe();
  if (nuevo && (!guardado || q.get('utm_source') || q.get('fbclid') || q.get('gclid') || q.get('ttclid'))) {
    guardado = { canal: nuevo, utm: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].map(function (k) { return q.get(k) || ''; }).join('|').replace(/\|+$/, ''), en: Date.now() };
    ls.set('stp-origen', JSON.stringify(guardado));
  }
  if (guardado && Date.now() - guardado.en > 30 * 864e5) guardado = null;
  var CANAL = (guardado && guardado.canal) || 'directo', UTM = (guardado && guardado.utm) || '';
  var DISP = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'movil' : 'escritorio';
  if (q.get('fbclid') && !leerCookie('_fbc')) escribirCookie('_fbc', 'fb.1.' + Date.now() + '.' + q.get('fbclid'), 90);

  function leerCookie(n) { var m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; }
  function escribirCookie(n, v, dias) { document.cookie = n + '=' + encodeURIComponent(v) + '; Max-Age=' + dias * 86400 + '; Path=/; SameSite=Lax; Secure'; }

  // ---------- consentimiento y píxeles ----------
  var consentimiento = ls.get('stp-consentimiento'); // 'si' | 'no' | null
  var config = null, cola = [], listos = false;
  var STP = window.STP = {
    // nombre: ViewContent | InitiateCheckout | Purchase. Se manda a Meta y Google solo si la persona aceptó.
    evento: function (nombre, datos, idEvento) { cola.push([nombre, datos || {}, idEvento]); if (listos) vaciar(); },
    consentimiento: function () { return consentimiento === 'si'; },
  };
  function vaciar() {
    if (consentimiento !== 'si' || !config) return;
    while (cola.length) {
      var e = cola.shift(), n = e[0], d = e[1], id = e[2];
      if (window.fbq && config.meta) window.fbq('track', n, { currency: 'CLP', value: d.valor, content_ids: d.producto ? [d.producto] : undefined, content_type: 'product' }, id ? { eventID: id } : undefined);
      if (window.gtag) {
        var g = { ViewContent: 'view_item', InitiateCheckout: 'begin_checkout', Purchase: 'purchase' }[n];
        if (g) window.gtag('event', g, { currency: 'CLP', value: d.valor, transaction_id: id, items: d.producto ? [{ item_id: d.producto, price: d.valor }] : undefined });
        if (n === 'Purchase' && config.googleAds && config.googleCompra) window.gtag('event', 'conversion', { send_to: config.googleAds + '/' + config.googleCompra, value: d.valor, currency: 'CLP', transaction_id: id });
      }
    }
  }
  function script(src) { var s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); }
  function cargarPixeles() {
    if (!config || consentimiento !== 'si' || listos) return;
    if (config.meta) {
      /* eslint-disable */
      !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
      window.fbq('init', config.meta); window.fbq('track', 'PageView');
    }
    var gid = config.googleTag || config.googleAds;
    if (gid) {
      script('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(gid));
      window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      if (config.googleTag) window.gtag('config', config.googleTag);
      if (config.googleAds) window.gtag('config', config.googleAds);
    }
    if (config.clarity) {
      (function (c, l, a, r, i) { c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); }; var t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i; var y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y); })(window, document, 'clarity', 'script', config.clarity);
    }
    listos = true; vaciar();
  }
  fetch(API + '?op=config').then(function (r) { return r.json(); }).then(function (c) {
    config = c;
    if (consentimiento === 'si') cargarPixeles();
    else if (!consentimiento && (c.meta || c.googleTag || c.googleAds || c.clarity)) avisoCookies();
    if (PRODUCTO && c.productos && c.productos[PRODUCTO]) STP.evento('ViewContent', { producto: PRODUCTO, valor: c.productos[PRODUCTO].precio });
  }).catch(function () {});

  // ---------- estilos del aviso y del formulario ----------
  var css = document.createElement('style');
  css.textContent = '.stp-cookies{position:fixed;left:12px;right:12px;bottom:max(12px,env(safe-area-inset-bottom));z-index:9999;max-width:560px;margin:0 auto;background:#0f1a12;color:#f1f5ee;border:1px solid #2c4230;border-radius:16px;padding:16px 18px;box-shadow:0 20px 50px rgba(0,0,0,.45);font:14.5px/1.45 "Plus Jakarta Sans",system-ui,sans-serif}'
    + '.stp-cookies p{margin:0 0 12px}.stp-cookies a{color:#c5f33b}.stp-fila{display:flex;gap:8px;flex-wrap:wrap}'
    + '.stp-btn{font:700 14.5px "Plus Jakarta Sans",system-ui,sans-serif;border-radius:10px;padding:11px 16px;cursor:pointer;border:1px solid #2c4230;background:transparent;color:#f1f5ee}'
    + '.stp-btn.si{background:#c5f33b;border-color:#c5f33b;color:#0f1a12}'
    + '.stp-dlg{border:0;padding:0;border-radius:20px;width:min(440px,calc(100vw - 24px));background:#fff;color:#13201a;box-shadow:0 30px 80px rgba(0,0,0,.5);font:15px/1.5 "Plus Jakarta Sans",system-ui,sans-serif}'
    + '.stp-dlg::backdrop{background:rgba(5,10,7,.65)}.stp-dlg form{padding:24px;display:grid;gap:12px}'
    + '.stp-dlg h3{margin:0;font-size:21px;letter-spacing:-.02em}.stp-dlg .stp-sub{margin:0;color:#5d6b61;font-size:14px}'
    + '.stp-dlg label{display:grid;gap:5px;font-weight:700;font-size:13.5px}.stp-dlg input{font:inherit;font-size:16px;border:1.5px solid #d5ddcf;border-radius:11px;padding:12px 13px;color:#13201a;background:#fff}'
    + '.stp-dlg input:focus{outline:none;border-color:#3f7d14;box-shadow:0 0 0 4px rgba(63,125,20,.15)}'
    + '.stp-total{display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid #e3e8df;padding-top:12px;font-weight:700}.stp-total b{font-size:24px}'
    + '.stp-ir{font:800 16px "Plus Jakarta Sans",system-ui,sans-serif;background:#009ee3;color:#fff;border:0;border-radius:12px;padding:15px;cursor:pointer}'
    + '.stp-ir[disabled]{opacity:.6;cursor:wait}.stp-err{color:#c0392b;font-size:14px;min-height:1em;margin:0}'
    + '.stp-letra{font-size:12.5px;color:#6b776e;margin:0}.stp-letra a{color:#3f7d14}.stp-x{position:absolute;right:12px;top:10px;border:0;background:none;font-size:26px;cursor:pointer;color:#6b776e}'
    + '.stp-aviso-pago{position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:9998;background:#fff3e0;color:#7a3e00;border:1px solid #ffcc80;border-radius:12px;padding:12px 16px;font:600 14.5px system-ui,sans-serif;max-width:calc(100vw - 24px)}';
  document.head.appendChild(css);

  function avisoCookies() {
    var d = document.createElement('div');
    d.className = 'stp-cookies'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Cookies');
    d.innerHTML = '<p>Usamos cookies de Meta, Google y Microsoft para medir las visitas y mostrar nuestros anuncios a quien le pueden servir. <a href="/privacidad">Más información</a></p><div class="stp-fila"><button class="stp-btn si" type="button">Aceptar</button><button class="stp-btn" type="button">Solo las necesarias</button></div>';
    var b = d.querySelectorAll('button');
    b[0].onclick = function () { consentimiento = 'si'; ls.set('stp-consentimiento', 'si'); d.remove(); cargarPixeles(); };
    b[1].onclick = function () { consentimiento = 'no'; ls.set('stp-consentimiento', 'no'); d.remove(); };
    document.body.appendChild(d);
  }

  // ---------- pasos del embudo (sin datos personales) ----------
  var pasos = {}, enviados = {};
  var hoy = new Date().toISOString().slice(0, 10);
  if (PRODUCTO && !ss.get('stp-vista-' + PRODUCTO + hoy)) { pasos.vista = 1; ss.set('stp-vista-' + PRODUCTO + hoy, '1'); }
  function mandarPasos() {
    var lista = Object.keys(pasos).filter(function (p) { return !enviados[p]; });
    if (!PRODUCTO || !lista.length) return;
    lista.forEach(function (p) { enviados[p] = 1; });
    try { fetch(API + '?op=evento', { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ producto: PRODUCTO, pasos: lista, canal: CANAL, disp: DISP }) }); } catch (e) {}
  }
  addEventListener('pagehide', mandarPasos);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') mandarPasos(); });

  // ---------- formulario de compra ----------
  var dlg = null;
  function formulario() {
    if (dlg) return dlg;
    dlg = document.createElement('dialog'); dlg.className = 'stp-dlg';
    dlg.innerHTML = '<form novalidate><button type="button" class="stp-x" aria-label="Cerrar">×</button><h3>Tus datos para la compra</h3><p class="stp-sub" id="stp-prod"></p>'
      + '<label>Tu nombre<input name="nombre" autocomplete="name" maxlength="60" required></label>'
      + '<label>Tu correo<input name="email" type="email" autocomplete="email" maxlength="120" required placeholder="Ahí te llega tu compra"></label>'
      + '<label>Tu WhatsApp <span style="font-weight:500;color:#6b776e">(opcional)</span><input name="telefono" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="9 1234 5678"></label>'
      + '<input name="web" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px">'
      + '<div class="stp-total"><span>Total</span><b id="stp-precio"></b></div>'
      + '<button class="stp-ir" type="submit">Pagar con Mercado Pago</button><p class="stp-err" role="alert"></p>'
      + '<p class="stp-letra">Pagas en Mercado Pago con tarjeta, débito o saldo. Al comprar aceptas nuestra <a href="/privacidad" target="_blank">política de privacidad</a>.</p></form>';
    document.body.appendChild(dlg);
    dlg.querySelector('.stp-x').onclick = function () { dlg.close(); };
    dlg.querySelector('form').addEventListener('submit', enviar);
    dlg.querySelector('form').addEventListener('input', function () { dlg.querySelector('.stp-err').textContent = ''; });
    return dlg;
  }
  function pesos(n) { return '$' + Number(n || 0).toLocaleString('es-CL'); }
  function abrir(e) {
    if (!PRODUCTO) return;
    e.preventDefault();
    pasos.comprar = 1;
    var d = formulario(), p = config && config.productos && config.productos[PRODUCTO];
    d.querySelector('#stp-prod').textContent = p ? p.nombre : '';
    d.querySelector('#stp-precio').textContent = p ? pesos(p.precio) : '';
    d.querySelector('.stp-err').textContent = '';
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    setTimeout(function () { d.querySelector('input[name=nombre]').focus(); }, 50);
  }
  function enviar(e) {
    e.preventDefault();
    var f = e.target, err = f.querySelector('.stp-err'), btn = f.querySelector('.stp-ir');
    var datos = { producto: PRODUCTO, nombre: f.nombre.value.trim(), email: f.email.value.trim(), telefono: f.telefono.value.trim(), web: f.web.value, canal: CANAL, disp: DISP, utm: UTM, consentimiento: consentimiento === 'si', fbp: leerCookie('_fbp'), fbc: leerCookie('_fbc') };
    if (!datos.nombre) { err.textContent = 'Escribe tu nombre.'; f.nombre.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(datos.email)) { err.textContent = 'Revisa tu correo: ahí te llega tu compra.'; f.email.focus(); return; }
    btn.disabled = true; btn.textContent = 'Abriendo Mercado Pago…'; err.textContent = '';
    mandarPasos();
    fetch(API + '?op=orden', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(datos) })
      .then(function (r) { return r.json().then(function (b) { return { r: r, b: b }; }); })
      .then(function (x) {
        if (x.r.ok && x.b.url) {
          var p = config && config.productos && config.productos[PRODUCTO];
          STP.evento('InitiateCheckout', { producto: PRODUCTO, valor: p && p.precio }, x.b.orden);
          setTimeout(function () { location.href = x.b.url; }, 350);
          return;
        }
        if (x.b && x.b.error === 'pagos-no-configurados' && RESPALDO) { location.href = RESPALDO; return; }
        throw new Error((x.b && x.b.error) || 'No se pudo abrir el pago');
      })
      .catch(function (ex) { err.textContent = ex.message === 'Failed to fetch' ? 'Sin conexión. Intenta de nuevo.' : ex.message; btn.disabled = false; btn.textContent = 'Pagar con Mercado Pago'; });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.pagar, [data-comprar]');
    if (a) abrir(e);
  });
  if (q.get('pago') === 'fallido') {
    var av = document.createElement('div'); av.className = 'stp-aviso-pago'; av.setAttribute('role', 'status');
    av.textContent = 'El pago no se completó. Puedes intentarlo de nuevo con otro medio de pago.';
    var poner = function () { document.body.appendChild(av); setTimeout(function () { av.remove(); }, 9000); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poner); else poner();
  }
})();
