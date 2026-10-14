// Servidor de autorización OAuth 2.1 de Optimind OS (para conectar el MCP como conector de claude.ai).
// - Solo entran las personas de OS_USUARIOS, cada una con su clave personal (guardada como hash scrypt).
// - Clientes: registro dinámico (RFC 7591) sin estado, o documento de metadatos del cliente (CIMD).
// - PKCE S256 obligatorio. Tokens firmados con una clave derivada de PANEL_SECRET.
// - El código de autorización y cada refresh token se pueden usar una sola vez (marca en el Blob).
import { createHmac, createHash, scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';
import { getPublicOrigin } from 'mcp-handler';
import { crearUnaVez, existeDoc, leerDoc, guardarDoc } from '../panel.js';

export const SCOPE = 'os';
export const DURACION_ACCESO = 3600;
const DURACION_REFRESH = 30 * 86400;
const DURACION_CODIGO = 120;

// Retornos permitidos: claude.ai / claude.com, y loopback en cualquier puerto (Claude Code, MCP Inspector).
const RETORNOS = ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'];
export function retornoPermitido(uri) {
  if (RETORNOS.includes(uri)) return true;
  try {
    const u = new URL(uri);
    return u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname) && !u.username && !u.password && !u.hash;
  } catch {
    return false;
  }
}
export const esLoopback = (uri) => !RETORNOS.includes(uri);
// Compara retornos loopback sin el puerto (RFC 8252 §7.3).
const sinPuerto = (uri) => { try { const u = new URL(uri); if (esLoopback(uri)) u.port = ''; return u.toString(); } catch { return uri; } };

export const origen = (req) => getPublicOrigin(req);
export const recurso = (req) => `${origen(req)}/api/mcp`;

// ---- Firma de tokens ----
function clave() {
  if (!process.env.PANEL_SECRET) throw new Error('Falta PANEL_SECRET');
  return createHmac('sha256', process.env.PANEL_SECRET).update('optimind-os-oauth-v1').digest();
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const firma = (s) => createHmac('sha256', clave()).update(s).digest('base64url');
const iguales = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export function firmar(tipo, datos, segundos) {
  const ahora = Math.floor(Date.now() / 1000);
  const cuerpo = b64({ t: tipo, iat: ahora, exp: ahora + segundos, jti: randomBytes(12).toString('base64url'), ...datos });
  return `${tipo}.${cuerpo}.${firma(`${tipo}.${cuerpo}`)}`;
}

export function leerFirmado(token, tipo) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3 || partes[0] !== tipo || !iguales(partes[2], firma(`${partes[0]}.${partes[1]}`))) return null;
  try {
    const d = JSON.parse(Buffer.from(partes[1], 'base64url').toString());
    return d.t === tipo && d.exp > Date.now() / 1000 ? d : null;
  } catch {
    return null;
  }
}

// ---- Usuarios (OS_USUARIOS = "nombre:scrypt:N:sal:hash,otro:...") ----
function usuarios() {
  const out = {};
  for (const linea of (process.env.OS_USUARIOS || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [nombre, alg, n, sal, hash] = linea.split(':');
    if (nombre && alg === 'scrypt' && sal && hash) out[nombre.toLowerCase()] = { nombre, n: Number(n) || 16384, sal, hash };
  }
  return out;
}
export const usuarioPermitido = (nombre) => Boolean(usuarios()[String(nombre || '').toLowerCase()]);

export function verificarClave(nombre, claveTexto) {
  const u = usuarios()[String(nombre || '').trim().toLowerCase()];
  // Se calcula igual aunque el usuario no exista, para no revelar cuáles existen por el tiempo de respuesta.
  const sal = u ? Buffer.from(u.sal, 'base64url') : Buffer.alloc(16);
  const calc = scryptSync(String(claveTexto || ''), sal, 32, { N: u?.n || 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return u && timingSafeEqual(calc, Buffer.from(u.hash, 'base64url')) ? u.nombre : null;
}

// Bloqueo simple: más de 8 claves malas en 15 minutos para un usuario lo bloquea por ese rato.
const rutaIntentos = (nombre) => `panel/oauth/intentos/${createHash('sha256').update(String(nombre).toLowerCase()).digest('hex').slice(0, 16)}.json`;
export async function bloqueado(nombre) {
  const { data } = await leerDoc(rutaIntentos(nombre));
  return (data?.fallos || []).filter((t) => t > Date.now() - 15 * 60e3).length >= 8;
}
export async function anotarFallo(nombre) {
  const { data, etag } = await leerDoc(rutaIntentos(nombre));
  const fallos = (data?.fallos || []).filter((t) => t > Date.now() - 15 * 60e3);
  await guardarDoc(rutaIntentos(nombre), { fallos: [...fallos, Date.now()] }, etag).catch(() => {});
}

// ---- Clientes OAuth ----
// Registro dinámico sin estado: el client_id lleva firmados los retornos permitidos.
export function registrarCliente(meta) {
  const retornos = Array.isArray(meta?.redirect_uris) ? meta.redirect_uris.map(String) : [];
  if (!retornos.length || retornos.length > 5 || !retornos.every(retornoPermitido)) {
    return { error: 'invalid_redirect_uri', error_description: 'Solo se aceptan los retornos de claude.ai/claude.com o loopback (localhost).' };
  }
  const nombre = String(meta.client_name || 'Cliente MCP').slice(0, 60);
  const datos = b64({ r: retornos, n: nombre });
  const clientId = `dcr.${datos}.${firma(`dcr.${datos}`)}`;
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: nombre,
    redirect_uris: retornos,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  };
}

// Devuelve { nombre } si el cliente existe y permite ese retorno; si no, { error }.
export async function validarCliente(clientId, retorno) {
  if (!retornoPermitido(retorno)) return { error: 'Ese retorno (redirect_uri) no está permitido.' };
  if (String(clientId).startsWith('dcr.')) {
    const [, datos, f] = String(clientId).split('.');
    if (!datos || !f || !iguales(f, firma(`dcr.${datos}`))) return { error: 'Cliente desconocido.' };
    const d = JSON.parse(Buffer.from(datos, 'base64url').toString());
    const ok = d.r.some((r) => sinPuerto(r) === sinPuerto(retorno));
    return ok ? { nombre: d.n } : { error: 'El retorno no coincide con el registrado.' };
  }
  if (/^https:\/\/[^/]+\/./.test(clientId)) {
    // Client ID Metadata Document: el client_id es una URL que publica los datos del cliente.
    try {
      const r = await fetch(clientId, { redirect: 'error', signal: AbortSignal.timeout(4000), headers: { accept: 'application/json' } });
      const texto = await r.text();
      if (!r.ok || texto.length > 20000) return { error: 'No se pudo leer el documento del cliente.' };
      const d = JSON.parse(texto);
      if (d.client_id !== clientId || !Array.isArray(d.redirect_uris)) return { error: 'Documento del cliente inválido.' };
      const ok = d.redirect_uris.some((r) => sinPuerto(String(r)) === sinPuerto(retorno));
      return ok ? { nombre: String(d.client_name || new URL(clientId).hostname).slice(0, 60) } : { error: 'El retorno no está en el documento del cliente.' };
    } catch {
      return { error: 'No se pudo leer el documento del cliente.' };
    }
  }
  return { error: 'Cliente desconocido.' };
}

// ---- Códigos y tokens ----
export const s256 = (verificador) => createHash('sha256').update(String(verificador)).digest('base64url');

export function emitirCodigo({ usuario, clientId, retorno, desafio, recursoUrl, scope }) {
  return firmar('cod', { sub: usuario, cid: clientId, ru: retorno, cc: desafio, aud: recursoUrl, scp: scope }, DURACION_CODIGO);
}

export function emitirTokens({ usuario, clientId, recursoUrl, scope, familia }) {
  const fam = familia || randomBytes(12).toString('base64url');
  return {
    access_token: firmar('at', { sub: usuario, cid: clientId, aud: recursoUrl, scp: scope }, DURACION_ACCESO),
    token_type: 'Bearer',
    expires_in: DURACION_ACCESO,
    refresh_token: firmar('rt', { sub: usuario, cid: clientId, aud: recursoUrl, scp: scope, fam }, DURACION_REFRESH),
    scope,
  };
}

// Marca un código o refresh token como usado. Devuelve false si ya se había usado.
export const usarUnaVez = (jti) => crearUnaVez(`panel/oauth/usados/${jti}.json`, { en: new Date().toISOString() });
export const revocarFamilia = (fam) => crearUnaVez(`panel/oauth/revocadas/${fam}.json`, { en: new Date().toISOString() });
export const familiaRevocada = (fam) => existeDoc(`panel/oauth/revocadas/${fam}.json`);

// Para withMcpAuth: devuelve el AuthInfo si el token de acceso es válido para este recurso y usuario.
export function verificarAcceso(req, token) {
  const d = leerFirmado(token, 'at');
  if (!d || d.aud !== recurso(req) || !usuarioPermitido(d.sub)) return undefined;
  return { token, clientId: d.cid, scopes: String(d.scp || SCOPE).split(' '), expiresAt: d.exp, extra: { usuario: d.sub } };
}
