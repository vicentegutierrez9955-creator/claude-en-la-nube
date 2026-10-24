# Checklist por página

Úsala al crear una página y al auditar una existente. En una auditoría, los problemas se entregan ordenados así: **bloqueantes**, luego **importantes**, luego **mejoras**.

## Bloqueantes (impiden posicionar)
- [ ] La página **no tiene `noindex`** (salvo las maquetas sin aprobar) y robots.txt no la bloquea.
- [ ] Está en el **sitemap.xml** y el sitemap está enviado en Search Console.
- [ ] Tiene **un solo H1** y contiene la palabra clave principal.
- [ ] **No canibaliza**: ninguna otra URL del sitio apunta a la misma palabra principal.
- [ ] Se puede llegar a ella **con al menos un enlace interno**. No es huérfana.
- [ ] Carga razonablemente en móvil: LCP < 2,5 s, sin imágenes de varios MB.

## Importantes
- [ ] **Title** de 30 a 60 caracteres con la estructura `Palabra clave principal + lugar o diferenciador | Marca`. Ejemplo: `Cambio de pastillas de freno en Melipilla | TTM Service`.
- [ ] **Meta description** de 120 a 155 caracteres, escrita como un anuncio: qué ofrece, beneficio o prueba, y llamado a la acción. Ejemplo: `Revisamos discos y pastillas y te damos el presupuesto antes de reparar. Reserva tu hora online en Av. Vicuña Mackenna 609.`
- [ ] **H2 y H3** jerárquicos, sin saltos, con variantes y sinónimos de la búsqueda ("frenos que chillan", "pedal largo", "cambio de discos").
- [ ] Ningún texto decorativo usa H1 o H2 (frases como "Guía de tallas" o "Detalles" van como texto o `span`).
- [ ] **Texto útil**: qué incluye, cómo funciona, tiempos, garantías, por qué elegir al cliente. No relleno.
- [ ] **Preguntas frecuentes** al final, sacadas de "Más preguntas" de Google, con `FAQPage` en JSON-LD.
- [ ] **Enlaces internos**: hacia las hijas (si es madre), hacia las hermanas al pie, hacia reservar o contactar, más las **migas de pan**.
- [ ] **URL legible** en minúsculas y con guiones: `/una-encarnada`.
- [ ] **JSON-LD** según el tipo de página (ver `datos-estructurados.md`). Validado sin errores.
- [ ] **Imágenes**: WebP, idealmente < 100 KB, con `width` y `height`, `alt` descriptivo y `loading="lazy"` en las que no se ven al cargar.
- [ ] **Datos de contacto visibles**: teléfono, WhatsApp, dirección y horario.

## Mejoras
- [ ] Open Graph (`og:title`, `og:description`, `og:image`) para que se vea bien al compartir.
- [ ] Las palabras secundarias del grupo aparecen de forma natural en el texto.
- [ ] Videos subidos a YouTube con un título que incluya la palabra clave, e incrustados con carga diferida. Nunca un MP4 pesado en el servidor.
- [ ] Prueba social: reseñas reales, casos con fotos de antes y después (con permiso), años de experiencia.
- [ ] Autor o profesional responsable con su ficha (E-E-A-T), sobre todo en salud, dinero y temas legales.
- [ ] Llamado a la acción repetido arriba, al medio y al final.

## Fórmulas de títulos

| Tipo de página | H1 | Title |
|---|---|---|
| Inicio de negocio local | Servicio principal + lugar (puede llevar un gancho) | `Servicio principal en Ciudad \| Marca` |
| Página de servicio | Servicio + lugar o beneficio | `Servicio en Ciudad: beneficio corto \| Marca` |
| Producto (ecommerce) | Palabra principal + marca + atributo diferenciador | `Qué es + marca + atributo \| Tienda` |
| Artículo | La pregunta o tema tal como se busca | `Pregunta o tema (año si aplica) \| Marca` |

Tip: con muchas páginas, pásale a la IA una planilla con nombre, servicio, palabra clave y lugar para que proponga titles y descriptions. **Después revisa los largos**, porque pasarse del límite corta el texto con "…".

## Herramientas para revisar
- Extensión **"META SEO inspector"** o **"SEO Meta in 1 Click"** (Chrome): muestra los H1 a H6, el title, la description y los datos estructurados de la página abierta.
- **Prueba de resultados enriquecidos** de Google y **validator.schema.org** para el JSON-LD.
- **PageSpeed Insights** y Search Console → Core Web Vitals.
- En este repo se puede auditar con un script: Playwright o Python con BeautifulSoup, que recorra las páginas y liste el title, la description, los H1 y H2, si hay `noindex`, el peso de las imágenes y los enlaces internos.
