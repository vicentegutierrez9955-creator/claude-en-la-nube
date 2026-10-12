(function () {
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

  reveal();
})();
