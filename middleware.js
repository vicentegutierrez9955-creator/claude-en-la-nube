// Cada dominio propio muestra solo la página de su cliente, con URLs limpias
// (gparrapodologia.cl/una-encarnada en vez de /gustavo-parra-podologia/una-encarnada).
// Los rewrites de vercel.json no alcanzan porque "/" ya existe (index.html de las barberías).
export const config = { matcher: '/((?!_vercel/).*)' };

const SITIOS = [
  { dominio: 'asesoriascontables-jc.cl', dir: '/asesorias-contables-jc' },
  { dominio: 'gparrapodologia.cl', dir: '/gustavo-parra-podologia' },
];

// Verificación de Google Search Console de Asesorías JC (con y sin .html, por cleanUrls)
const VERIFICACION = {
  'asesoriascontables-jc.cl': ['/google89224c002784d4bb', 'google-site-verification: google89224c002784d4bb.html'],
};

const rewrite = (path, url) =>
  new Response(null, { headers: { 'x-middleware-rewrite': new URL(path, url).toString() } });

const sitioDeHost = (host) => SITIOS.find((s) => host === s.dominio || host === 'www.' + s.dominio);
const enCarpeta = (path, dir) => path === dir || path.startsWith(dir + '/');

// Si la ruta es una página dentro de la carpeta de un cliente, devuelve su URL limpia en su
// dominio. Las de archivos con extensión (CSS, JS, fotos) devuelven null y se sirven tal cual.
function urlLimpia(url, sitio) {
  const rest = url.pathname.slice(sitio.dir.length);
  if (/\.[a-z0-9]+$/i.test(rest) && !rest.endsWith('.html')) return null;
  return 'https://' + sitio.dominio + (rest.replace(/^\/index(\.html)?$/, '').replace(/\.html$/, '') || '/') + url.search;
}

export default function middleware(request) {
  const host = (request.headers.get('host') || '').toLowerCase();
  const url = new URL(request.url);
  const path = url.pathname;
  const sitio = sitioDeHost(host);

  if (sitio) {
    const verif = VERIFICACION[sitio.dominio];
    if (verif && (path === verif[0] || path === verif[0] + '.html')) {
      return new Response(verif[1], { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    if (enCarpeta(path, sitio.dir)) {
      const limpia = urlLimpia(url, sitio);
      return limpia ? Response.redirect(limpia, 301) : undefined;
    }
    return rewrite(path === '/' ? sitio.dir : sitio.dir + path, url);
  }

  // Las maquetas antiguas (plantillas-omega.vercel.app/<carpeta>) llevan al dominio del cliente
  const de = SITIOS.find((s) => enCarpeta(path, s.dir));
  if (de) {
    const limpia = urlLimpia(url, de);
    if (limpia) return Response.redirect(limpia, 301);
  }
}
