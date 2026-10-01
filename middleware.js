// El dominio asesoriascontables-jc.cl muestra la página del contador en la portada.
// Los rewrites de vercel.json no alcanzan porque "/" ya existe (index.html de las barberías).
export const config = { matcher: '/' };

const HOSTS = ['asesoriascontables-jc.cl', 'www.asesoriascontables-jc.cl'];

export default function middleware(request) {
  const host = (request.headers.get('host') || '').toLowerCase();
  if (!HOSTS.includes(host)) return;
  return new Response(null, {
    headers: { 'x-middleware-rewrite': new URL('/asesorias-contables-jc', request.url).toString() },
  });
}
