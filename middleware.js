// Cada dominio propio muestra solo la página de su cliente.
// Los rewrites de vercel.json no alcanzan porque "/" ya existe (index.html de las barberías).
export const config = { matcher: '/((?!_vercel/).*)' };

const ASESORIAS = ['asesoriascontables-jc.cl', 'www.asesoriascontables-jc.cl'];
const DIR = '/asesorias-contables-jc';
const REWRITES = {
  '/': DIR,
  '/robots.txt': DIR + '/robots.txt',
  '/sitemap.xml': DIR + '/sitemap.xml',
};

// gparrapodologia.cl: varias páginas, con URLs limpias (/una-encarnada en vez de
// /gustavo-parra-podologia/una-encarnada). Los archivos (CSS, JS, fotos) se sirven
// desde su carpeta.
const GUSTAVO = ['gparrapodologia.cl', 'www.gparrapodologia.cl'];
const GDIR = '/gustavo-parra-podologia';

const rewrite = (path, url) =>
  new Response(null, { headers: { 'x-middleware-rewrite': new URL(path, url).toString() } });

function gustavo(url) {
  const path = url.pathname;
  if (path === GDIR || path.startsWith(GDIR + '/')) {
    const rest = path.slice(GDIR.length);
    // Archivos con extensión pasan tal cual; las páginas van a su URL limpia
    if (/\.[a-z0-9]+$/i.test(rest) && !rest.endsWith('.html')) return;
    const limpia = new URL((rest.replace(/^\/index(\.html)?$/, '').replace(/\.html$/, '') || '/') + url.search, url);
    return Response.redirect(limpia, 301);
  }
  return rewrite(path === '/' ? GDIR : GDIR + path, url);
}

export default function middleware(request) {
  const host = (request.headers.get('host') || '').toLowerCase();
  const url = new URL(request.url);
  if (GUSTAVO.includes(host)) return gustavo(url);
  if (!ASESORIAS.includes(host)) return;

  const path = url.pathname;
  // Verificación de Google Search Console (con y sin .html, por cleanUrls)
  if (path === '/google89224c002784d4bb.html' || path === '/google89224c002784d4bb') {
    return new Response('google-site-verification: google89224c002784d4bb.html', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
  if (REWRITES[path]) return rewrite(REWRITES[path], url);
  // Archivos de la página (CSS, JS, foto)
  if (path.startsWith(DIR + '/') && path !== DIR + '/' && path !== DIR + '/index.html') return;
  // Cualquier otra ruta (la página duplicada o las otras maquetas) vuelve a la portada
  return Response.redirect(new URL('/', url), 301);
}
