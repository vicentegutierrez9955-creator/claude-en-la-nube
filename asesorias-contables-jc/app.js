(function () {
  var WA = "https://wa.me/56991017048?text=";
  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

  // Hoy en Chile (solo la fecha)
  function hoyChile() {
    try {
      var p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()).split("-");
      return new Date(+p[0], +p[1] - 1, +p[2]);
    } catch (e) { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  }
  // Próxima fecha con ese día del mes (hoy incluido)
  function proxDia(hoy, dia) {
    var f = new Date(hoy.getFullYear(), hoy.getMonth(), dia);
    if (f < hoy) f = new Date(hoy.getFullYear(), hoy.getMonth() + 1, dia);
    return f;
  }
  function dias(a, b) { return Math.round((b - a) / 86400000); }
  function fecha(f) { return f.getDate() + " de " + MESES[f.getMonth()]; }

  // Calendario tributario
  var hoy = hoyChile();
  var f29 = proxDia(hoy, 20);
  var prev = proxDia(hoy, 13);
  var rentaIni = new Date(hoy.getFullYear(), 3, 1), rentaFin = new Date(hoy.getFullYear(), 3, 30);
  var enRenta = hoy >= rentaIni && hoy <= rentaFin;
  if (hoy > rentaFin) { rentaIni = new Date(hoy.getFullYear() + 1, 3, 1); rentaFin = new Date(hoy.getFullYear() + 1, 3, 30); }
  var items = [
    { lbl: "Mensual", h: "IVA · Formulario 29", when: "Vence el " + fecha(f29) + " (si emites factura electrónica)", d: dias(hoy, f29) },
    { lbl: "Mensual", h: "Cotizaciones · Previred", when: "Pago electrónico hasta el " + fecha(prev), d: dias(hoy, prev) },
    enRenta
      ? { lbl: "Anual", h: "Operación Renta", when: "Estamos en plena Operación Renta: cierra el " + fecha(rentaFin), d: dias(hoy, rentaFin) }
      : { lbl: "Anual", h: "Operación Renta", when: "Parte el " + fecha(rentaIni) + " de " + rentaIni.getFullYear(), d: dias(hoy, rentaIni) }
  ];
  document.getElementById("cal").innerHTML = items.map(function (it) {
    var cls = it.d <= 3 ? " urgent" : it.d <= 7 ? " soon" : "";
    var num = it.d === 0 ? "Hoy" : it.d;
    var unit = it.d === 0 ? "" : it.d === 1 ? "día" : "días";
    return '<article class="due' + cls + '"><span class="lbl">' + it.lbl + '</span><h3>' + it.h + '</h3><span class="when">' + it.when + '</span>' +
      '<div class="count"><b>' + num + '</b><span>' + unit + '</span></div></article>';
  }).join("");

  // Arma tu consulta
  var state = { tipo: "", nec: [], trab: "" };
  var elList = document.getElementById("q-list"), elMsg = document.getElementById("q-msg"), elWa = document.getElementById("q-wa"), elTitle = document.getElementById("q-title");
  document.querySelectorAll(".opts").forEach(function (g) {
    g.addEventListener("click", function (e) {
      var b = e.target.closest(".opt");
      if (!b) return;
      if (g.hasAttribute("data-single")) {
        var was = b.getAttribute("aria-pressed") === "true";
        g.querySelectorAll(".opt").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", was ? "false" : "true");
        state[g.dataset.q] = was ? "" : b.dataset.v;
      } else {
        b.setAttribute("aria-pressed", b.getAttribute("aria-pressed") === "true" ? "false" : "true");
        state.nec = Array.prototype.map.call(g.querySelectorAll('.opt[aria-pressed="true"]'), function (x) { return x.dataset.v; });
      }
      render();
    });
  });
  function render() {
    var li = [];
    if (state.tipo) li.push("Soy " + state.tipo);
    state.nec.forEach(function (n) { li.push(n.charAt(0).toUpperCase() + n.slice(1)); });
    if (state.trab) li.push(state.trab.charAt(0).toUpperCase() + state.trab.slice(1));
    elList.innerHTML = li.length ? li.map(function (t) { return '<li><svg class="icon"><use href="#i-check"/></svg>' + t + '</li>'; }).join("") : '<li class="empty">Aún no marcas nada.</li>';
    elTitle.textContent = li.length ? "Listo para enviar" : "Marca tu caso";
    var msg = "Hola, quiero hacer una consulta contable.";
    if (li.length) {
      msg = "Hola, " + (state.tipo ? "soy " + state.tipo : "quiero una cotización");
      if (state.nec.length) msg += " y necesito " + (state.nec.length > 1 ? state.nec.slice(0, -1).join(", ") + " y " + state.nec[state.nec.length - 1] : state.nec[0]);
      if (state.trab) msg += ". Tengo " + state.trab.replace("sin trabajadores", "0 trabajadores");
      msg += ". ¿Me puede cotizar?";
    }
    elMsg.textContent = msg;
    elWa.href = WA + encodeURIComponent(msg);
  }

  // Animación al hacer scroll
  var els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) { els.forEach(function (el) { el.classList.add("in"); }); return; }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { threshold: 0.12 });
  els.forEach(function (el) { io.observe(el); });
})();
