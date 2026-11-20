// Funciones comunes de las apps gratis de STPyme. Los datos se guardan solo en el navegador de cada persona
// (localStorage); con "Descargar copia" y "Cargar copia" se pueden respaldar o pasar a otro equipo.
window.App = (() => {
  const clpFmt = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  const clp = (n) => clpFmt.format(Math.round(Number(n) || 0));
  const num = (v) => Number(String(v ?? '').replace(/[^\d-]/g, '')) || 0;
  const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const hoy = () => new Date().toLocaleDateString('sv-SE');

  function cargar(clave, porDefecto) {
    try { const v = JSON.parse(localStorage.getItem('stpyme-' + clave)); return v ?? porDefecto; } catch { return porDefecto; }
  }
  function guardar(clave, datos) {
    try { localStorage.setItem('stpyme-' + clave, JSON.stringify(datos)); return true; }
    catch { aviso('No se pudo guardar en este navegador'); return false; }
  }

  let t;
  function aviso(texto) {
    let el = document.querySelector('.aviso');
    if (!el) { el = document.createElement('div'); el.className = 'aviso'; el.setAttribute('role', 'status'); document.body.append(el); }
    el.textContent = texto;
    el.classList.add('ver');
    clearTimeout(t);
    t = setTimeout(() => el.classList.remove('ver'), 2200);
  }

  // Formatea con puntos de miles mientras se escribe un monto.
  function montos(raiz = document) {
    raiz.querySelectorAll('input[data-monto]').forEach((el) => el.addEventListener('input', () => {
      const n = num(el.value);
      el.value = n ? n.toLocaleString('es-CL') : '';
    }));
  }

  // Botones de respaldo: descarga los datos en un archivo y los vuelve a cargar.
  function respaldo(clave, nombre, alCargar) {
    const zona = document.querySelector('[data-respaldo]');
    if (!zona) return;
    zona.querySelector('[data-descargar-copia]').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ app: clave, fecha: hoy(), datos: cargar(clave, null) }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${nombre}-${hoy()}.json`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
    const input = zona.querySelector('input[type=file]');
    zona.querySelector('[data-cargar-copia]').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      try {
        const j = JSON.parse(await input.files[0].text());
        if (j.app !== clave || j.datos == null) throw new Error();
        guardar(clave, j.datos);
        alCargar(j.datos);
        aviso('Copia cargada');
      } catch { aviso('Ese archivo no es una copia de esta app'); }
      input.value = '';
    });
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  return { clp, num, id, hoy, cargar, guardar, aviso, montos, respaldo, esc };
})();
