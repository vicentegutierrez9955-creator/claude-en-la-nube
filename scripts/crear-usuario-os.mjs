// Genera la línea de un usuario para la variable OS_USUARIOS de Vercel (acceso al conector MCP de Optimind OS).
// Uso: node scripts/crear-usuario-os.mjs vicente
// Pide la clave sin mostrarla y escribe "vicente:scrypt:16384:<sal>:<hash>". La clave nunca se guarda.
// Para varias personas, separa las líneas con coma en OS_USUARIOS.
import { scryptSync, randomBytes } from 'node:crypto';
import readline from 'node:readline';

const nombre = (process.argv[2] || '').trim();
if (!/^[a-zA-Z0-9._-]{2,40}$/.test(nombre)) {
  console.error('Uso: node scripts/crear-usuario-os.mjs <usuario>   (letras, números, punto, guion)');
  process.exit(1);
}

function preguntarOculto(texto) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(texto)) rl.output.write(s); };
    rl.question(texto, (r) => { rl.close(); process.stdout.write('\n'); resolve(r); });
  });
}

const clave = process.stdin.isTTY ? await preguntarOculto('Clave personal (mínimo 12 caracteres): ') : (await new Promise((r) => { let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => r(s.trim())); }));
if (clave.length < 12) {
  console.error('La clave debe tener al menos 12 caracteres.');
  process.exit(1);
}
if (process.stdin.isTTY && (await preguntarOculto('Repite la clave: ')) !== clave) {
  console.error('Las claves no coinciden.');
  process.exit(1);
}
const N = 16384;
const sal = randomBytes(16);
const hash = scryptSync(clave, sal, 32, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
console.log(`\n${nombre}:scrypt:${N}:${sal.toString('base64url')}:${hash.toString('base64url')}\n`);
console.log('Copia esa línea en la variable OS_USUARIOS del proyecto en Vercel (Settings → Environment Variables).');
