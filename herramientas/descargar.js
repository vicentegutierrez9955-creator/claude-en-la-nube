// Botones "Descargar para usar sin internet" de las herramientas gratuitas (data-descargar="<herramienta>").
// Arma en el navegador un solo archivo HTML con la versión actual de la herramienta, que funciona sin internet:
// el logo va incrustado, los links apuntan a stpyme.cl y el formulario de contacto se cambia por un botón a la
// versión web (el formulario solo acepta envíos desde stpyme.cl). Sin internet, la letra cae a la del sistema.
(() => {
  const SITIO = 'https://stpyme.cl';
  const HERRAMIENTAS = {
    'boleta-honorarios': { archivo: 'calculadora-boleta-honorarios-stpyme.html', ancla: 'maqueta', boton: 'Quiero ver mi web gratis' },
    'presupuesto-taller': { archivo: 'presupuestos-taller-stpyme.html', ancla: 'tuerkit', boton: 'Quiero conocer Tuerkit' },
  };

  const aDataUrl = (blob) => new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = mal;
    r.readAsDataURL(blob);
  });

  async function armar(id) {
    const h = HERRAMIENTAS[id];
    const url = `${SITIO}/herramientas/${id}`;
    const r = await fetch(`/herramientas/${id}`);
    if (!r.ok) throw new Error('No se pudo leer la herramienta');
    let html = await r.text();
    html = html.replace(/\s*<!-- descarga:inicio -->[\s\S]*?<!-- descarga:fin -->/, '')
      .replace(/<script src="\/herramientas\/descargar\.js"[^>]*><\/script>\n?/, '');
    const logo = html.match(/https:\/\/cdn\.jsdelivr\.net\/gh\/[^"]+\/stpyme\/img\/logo\.webp/);
    if (logo) {
      try { html = html.split(logo[0]).join(await aDataUrl(await (await fetch(logo[0])).blob())); }
      catch { /* sin logo incrustado, el archivo igual funciona */ }
    }
    html = html.replace(/href="\//g, `href="${SITIO}/`)
      .replace('<meta name="viewport"', '<meta name="robots" content="noindex">\n<meta name="viewport"')
      // El formulario queda oculto (el código de la herramienta lo sigue usando) y en su lugar va un botón a la web.
      .replace('<form id="form" novalidate>', `<a class="btn btn-primario btn-grande" href="${url}#${h.ancla}" target="_blank" rel="noopener">${h.boton} →</a>\n    <form id="form" novalidate hidden>`)
      .replace("location.host + '/herramientas/", "'stpyme.cl/herramientas/")
      .replace('location.origin + location.pathname', `'${url}'`)
      .replace('</footer>', ` · Versión para usar sin internet. La más nueva está en <a href="${SITIO}/herramientas">stpyme.cl/herramientas</a></footer>`);
    return new Blob([html], { type: 'text/html;charset=utf-8' });
  }

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-descargar]');
    if (!b || b.disabled) return;
    const id = b.dataset.descargar;
    if (!HERRAMIENTAS[id]) return;
    const texto = b.textContent;
    b.disabled = true;
    b.textContent = 'Preparando…';
    try {
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(await armar(id));
      enlace.download = HERRAMIENTAS[id].archivo;
      document.body.append(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(enlace.href), 10000);
      b.textContent = '✓ Descargada';
    } catch {
      b.textContent = 'No se pudo descargar, intenta de nuevo';
    }
    setTimeout(() => { b.textContent = texto; b.disabled = false; }, 2500);
  });
})();
