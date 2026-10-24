# SEO técnico, E-E-A-T e IA

## sitemap.xml
- Es la lista oficial de las URLs que se quieren indexar. Sin sitemap, Google descubre las páginas siguiendo enlaces y puede saltarse las nuevas o las que no están en el menú.
- En este repo se escribe a mano dentro de la carpeta del cliente (ver `asesorias-contables-jc/sitemap.xml`): una `<url>` por página con `<loc>` en el dominio final y `<lastmod>`.
- Se **envía en Search Console** (Sitemaps → URL del sitemap) y en Bing Webmaster Tools.
- Al crear una página, agrégala al sitemap. Las maquetas con `noindex` no van en el sitemap.

## robots.txt
```
User-agent: *
Allow: /
Disallow: /*?        # búsquedas internas y URLs con parámetros (si el sitio las genera)

Sitemap: https://dominio-del-cliente.cl/sitemap.xml
```
- Se bloquea lo que no debe indexarse ni competir con las páginas reales: búsquedas internas, filtros, carrito, checkout, paneles.
- Revisa que **no quede un `Disallow: /`** de la etapa de desarrollo.
- Ojo: robots.txt no desindexa. Para sacar una página del índice se usa `<meta name="robots" content="noindex">`, y la página debe seguir siendo rastreable para que Google vea esa etiqueta.

## Móvil primero
- La mayor parte del tráfico es móvil. Se diseña y se prueba primero en móvil, a 390 px, y después en escritorio.
- El menú, los enlaces internos y las preguntas frecuentes deben existir también en móvil.
- Botones fáciles de tocar y WhatsApp o "Llamar" a mano.

## Velocidad (WPO)
- **Imágenes**: son la causa principal de lentitud en los sitios chicos. Usa WebP, dimensiona al tamaño real en que se muestran (~1600 px máximo para fotos a ancho completo) y apunta a menos de 100 KB. Squoosh (squoosh.app, de Google) o un script con Pillow sirven para comprimir. Ojo: alguien del equipo sube una foto de 3 MB y se pierde todo lo optimizado, así que hay que revisar de vez en cuando.
- **Scripts y apps externas**: cada widget o píxel extra es una llamada más que frena la carga. Quita lo que no se use.
- **Videos**: van en YouTube y se incrustan con carga diferida, nunca alojados en el sitio.
- **Medir**: PageSpeed Insights en la home, en una página de servicio y en otra más, porque mide una URL a la vez. Mira el puntaje de **Rendimiento** y los Core Web Vitals:
  - **LCP** < 2,5 s: cuánto tarda en verse el elemento principal, normalmente la primera imagen.
  - **INP** < 200 ms: qué tan rápido responde a los clics.
  - **CLS** < 0,1: que la página no salte mientras carga. Por eso las imágenes llevan `width` y `height`.
- El puntaje "SEO" de PageSpeed **no** sirve para posicionar; no vale la pena perseguir el 100.
- En Search Console → **Core Web Vitals** aparecen las URLs lentas agrupadas. Copia una y analízala en PageSpeed para ver el detalle.

## Datos estructurados
Ver `datos-estructurados.md`. Le dicen a Google y a las IA qué es cada cosa: negocio, servicio, precio, horario, preguntas, autor. Hoy pesan más porque **las IA los usan para entender y citar sitios**.

## E-E-A-T (experiencia, pericia, autoridad y confianza)
Es un factor tanto para Google como para las IA.
- **Reseñas**: muchas y recientes, en Google y, si se puede, visibles en la web.
- **Autor con credenciales**: en salud (podología, dental, kinesiología), dinero (contabilidad, tributario) y temas legales, el contenido debe firmarlo el profesional, con su ficha: estudios, registro (por ejemplo, Superintendencia de Salud), años de experiencia y redes. Se marca con `Person` en el JSON-LD. Un texto médico sin firma no tiene peso, porque cualquiera puede generarlo con IA.
- **Señales de negocio real**: teléfono, correo, dirección física, horario, RUT o razón social si corresponde, y página o sección "Quiénes somos".
- **Políticas en el footer**: privacidad, términos, y despacho y devoluciones en ecommerce.
- **Prensa o enlaces del rubro** (off-page).

## Buscadores con IA (ChatGPT, Gemini, Perplexity, AI Overviews)
- Hoy la gente usa la IA más para informarse que para comprar, pero eso está cambiando: ya hay compras dentro de los chats en EE.UU.
- Los factores son **los mismos del SEO**. Los que más pesan:
  1. **E-E-A-T** bien trabajado.
  2. **Datos estructurados** completos.
  3. **Aparecer en listados comparativos de terceros**: "mejores talleres mecánicos en Melipilla", "mejores contadores para pymes en…". Cuando alguien pregunta a la IA dónde contratar algo, la IA busca páginas que comparan negocios. Un ranking en la web propia no convence, así que hay que conseguir aparecer en medios, blogs y directorios de la zona o del rubro.
- **Bing Webmaster Tools**: da de alta el sitio y envía el sitemap. ChatGPT usa el índice de Bing. Se puede importar desde Search Console en pocos clics.
- **`llms.txt`**: archivo en la raíz que resume para las IA qué es el sitio y sus secciones principales, con enlaces. Su efecto no está probado; es opcional, barato y no hace daño. Formato básico:
  ```
  # Nombre del negocio
  > Una línea con qué hace y dónde.

  ## Servicios
  - [Cambio de aceite](https://dominio.cl/cambio-de-aceite): mantención por kilometraje…
  ## Contacto
  - Dirección, teléfono, horario
  ```

## Search Console: qué revisar
- **Rendimiento**: consultas y páginas con clics e impresiones. Busca consultas con muchas impresiones y posición 5–15, porque optimizarlas da el resultado más rápido.
- **Indexación de páginas**: qué no está indexado y por qué.
- **Sitemaps**: enviado y sin errores.
- **Enlaces**: los internos más enlazados deben coincidir con las páginas prioritarias. Los externos muestran quién enlaza al sitio.
- **Core Web Vitals** y **Experiencia en la página**.
- Se pueden ver tendencias estacionales (Navidad, Día del Padre, operación renta) para planificar el contenido y los anuncios.
