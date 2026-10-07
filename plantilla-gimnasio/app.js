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

  reveal();
})();
