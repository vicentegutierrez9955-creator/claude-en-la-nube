// El dominio asesoriascontables-jc.cl muestra solo la página del contador.
// Los rewrites de vercel.json no alcanzan porque "/" ya existe (index.html de las barberías).
export const config = { matcher: '/((?!_vercel/).*)' };

const HOSTS = ['asesoriascontables-jc.cl', 'www.asesoriascontables-jc.cl'];
const DIR = '/asesorias-contables-jc';
const REWRITES = {
  '/': DIR,
  '/robots.txt': DIR + '/robots.txt',
  '/sitemap.xml': DIR + '/sitemap.xml',
};

export default function middleware(request) {
  const host = (request.headers.get('host') || '').toLowerCase();
  if (!HOSTS.includes(host)) return;

  const url = new URL(request.url);
  const path = url.pathname;
  if (REWRITES[path]) {
    return new Response(null, {
      headers: { 'x-middleware-rewrite': new URL(REWRITES[path], url).toString() },
    });
  }
  // Archivos de la página (CSS, JS, foto)
  if (path.startsWith(DIR + '/') && path !== DIR + '/' && path !== DIR + '/index.html') return;
  // Cualquier otra ruta (la página duplicada o las otras maquetas) vuelve a la portada
  return Response.redirect(new URL('/', url), 301);
}
