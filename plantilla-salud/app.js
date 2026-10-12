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

  reveal();
})();
