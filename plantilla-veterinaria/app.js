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

  reveal();
})();
