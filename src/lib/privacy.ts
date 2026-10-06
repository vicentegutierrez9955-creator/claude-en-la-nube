// Oculta datos personales antes de mandarle un texto a la IA. Es una red de seguridad:
// los datos de envío ya se piden fuera de la IA, pero un cliente puede escribirlos igual.

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// RUT chileno: 12.345.678-9 / 12345678-K
const RUT = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g;
// Teléfonos: +56 9 1234 5678, 912345678, 2 2345 6789, etc. (8 a 11 dígitos con espacios o guiones)
const PHONE = /(?:\+?56[\s-]?)?(?:\(?\d\)?[\s-]?)?\d{4}[\s-]?\d{4}\b/g;
// Direcciones con palabra típica de calle seguida de un número: "calle Los Aromos 45", "Av. Libertad 870 depto 3"
const ADDRESS =
  /\b(?:calle|avenida|av\.?|avda\.?|pasaje|psje\.?|pje\.?|camino|ruta|villa|poblaci[oó]n|condominio)\s+[\p{L}\d .'-]{2,40}?\d+[a-zA-Z]?(?:\s*,?\s*(?:depto|dpto|departamento|casa|block|of(?:icina)?)\.?\s*\w+)?/giu;
const UNIT = /\b(?:depto|dpto|departamento|block|torre)\.?\s*\d+\w*/giu;

export function redactPersonalData(text: string): string {
  return text
    .replace(EMAIL, "[correo oculto]")
    .replace(RUT, "[RUT oculto]")
    .replace(ADDRESS, "[dirección oculta]")
    .replace(UNIT, "[dirección oculta]")
    .replace(PHONE, (match) => (match.replace(/\D/g, "").length >= 8 ? "[teléfono oculto]" : match));
}
