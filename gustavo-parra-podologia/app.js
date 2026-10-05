// Gustavo Parra Podología: orientación rápida ("¿Qué te está molestando?") y animaciones al hacer scroll.
(function () {
  var WA = "https://wa.me/56956633536?text=";
  var BASE = "/gustavo-parra-podologia/";
  var P = {
    encarnada: { t: "Uña encarnada", l: "pronto", lt: "Conviene atenderse pronto", m: "una uña encarnada", url: "una-encarnada", d: "Se revisa la uña, se retira con cuidado la parte que se entierra y te enseño a cortarla para que no vuelva. Si está muy roja, hinchada o con pus, no lo dejes pasar." },
    callos: { t: "Callos o durezas", l: "", lt: "", m: "callos o durezas", url: "callos-y-durezas", d: "Se retiran las callosidades y helomas (ojos de pollo) con instrumental esterilizado, y vemos qué los provoca para que tarden más en volver." },
    hongos: { t: "Hongos en las uñas", l: "", lt: "", m: "hongos en las uñas", url: "hongos-en-las-unas", d: "Primero se evalúa la uña y se limpia la zona afectada. Tratar los hongos toma tiempo, así que te explico cómo seguir el cuidado en casa." },
    diabetico: { t: "Control de pie diabético", l: "prioritario", lt: "Con diabetes, mejor no esperar", m: "un control de pie diabético", url: "pie-diabetico", d: "Se revisa el pie completo y se cortan uñas y retiran durezas con especial cuidado. Si tienes una herida, avísalo en el mensaje." },
    grietas: { t: "Grietas en los talones", l: "", lt: "", m: "grietas en los talones", url: "callos-y-durezas", d: "Se retira la piel endurecida del talón y te recomiendo cómo hidratarlo para que las grietas no vuelvan a abrirse." },
    control: { t: "Corte y limpieza", l: "", lt: "", m: "un corte y limpieza de uñas", url: "", d: "Atención de mantención: corte de uñas, limpieza y revisión general del pie. Ideal cada uno o dos meses." }
  };
  var $ = function (id) { return document.getElementById(id); };

  if ($("probs")) {
    var state = { k: "", day: "" };
    var pick = function (groupId, attr, key) {
      $(groupId).addEventListener("click", function (e) {
        var b = e.target.closest(".opt"); if (!b) return;
        var was = b.getAttribute("aria-pressed") === "true";
        $(groupId).querySelectorAll(".opt").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", was ? "false" : "true");
        state[key] = was ? "" : b.getAttribute(attr);
        render();
      });
    };
    var render = function () {
      var p = P[state.k], name = $("name").value.trim(), lv = $("r-level"), more = $("r-more");
      $("r-title").textContent = p ? p.t : "Marca lo que tienes";
      $("r-text").textContent = p ? p.d : "Elige una opción y te cuento en qué consiste la atención.";
      if (p && p.l) { lv.hidden = false; lv.className = "level " + p.l; lv.textContent = p.lt; } else { lv.hidden = true; }
      if (p && p.url) { more.hidden = false; more.href = BASE + p.url; } else { more.hidden = true; }
      var msg = "Hola Gustavo" + (name ? ", soy " + name : "") + ". Quiero agendar una hora de podología" + (p ? " por " + p.m : "") + ".";
      if (state.day) msg += " Me acomoda " + state.day + ".";
      msg += " ¿Qué horas tienes disponibles?";
      $("r-msg").textContent = msg;
      $("r-wa").href = WA + encodeURIComponent(msg);
    };
    pick("probs", "data-k", "k");
    pick("days", "data-v", "day");
    $("name").addEventListener("input", render);
  }

  var els = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) { els.forEach(function (el) { el.classList.add("in"); }); return; }
  var io = new IntersectionObserver(function (en) {
    en.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target); } });
  }, { threshold: 0.12 });
  els.forEach(function (el) { io.observe(el); });
})();
