import type { Product } from "@prisma/client";
import { db } from "./db";

const STOPWORDS = new Set(
  "hola buenas buenos dias tardes noches tienen tiene tienes quiero quisiera queria necesito busco precio precios valor cuanto cuesta cuestan vale valen para como donde cual cuales esta estan este esto eso hay algo alguna alguno favor gracias porfa porfavor saber consulta pregunta una uno unos unas los las del con que por mas muy".split(
    " ",
  ),
);

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[️⃣]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// "envíos" → "envio", "polerones" → "poleron": para comparar en singular o plural.
export function stem(words: string): string {
  return words
    .split(" ")
    .map((w) => (w.length > 4 ? w.replace(/(es|s)$/, "") : w))
    .join(" ");
}

// Palabras con contenido (sin saludos ni muletillas).
export function contentWords(normalized: string): string[] {
  return normalized.split(" ").filter((w) => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
}

// Busca en el catálogo sin importar tildes, mayúsculas ni plurales. Los catálogos de
// una pyme son chicos, así que se filtra en memoria (Postgres distingue tildes).
export async function searchCatalog(businessId: string, query: string, limit = 15): Promise<Product[]> {
  const products = await db.product.findMany({ where: { businessId, active: true }, orderBy: { name: "asc" } });
  const words = contentWords(normalize(query)).map(stem);
  if (words.length === 0) return products.slice(0, limit);
  const scored = products
    .map((p) => {
      const haystack = ` ${stem(normalize(`${p.name} ${p.sku ?? ""}`))} `;
      const description = stem(normalize(p.description));
      const score = words.reduce((sum, w) => sum + (haystack.includes(w) ? 2 : description.includes(w) ? 1 : 0), 0);
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name, "es"));
  return scored.slice(0, limit).map((x) => x.p);
}
