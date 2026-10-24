---
name: seo-pymes
description: Método para posicionar en Google (y en buscadores con IA) las webs de nuestros clientes pymes —talleres, podólogos, contadores, clínicas, tiendas— desde el estudio de palabras clave hasta el SEO técnico, local y la medición. Úsala cuando haya que planificar o auditar el SEO de un sitio, crear páginas de servicio que posicionen, escribir títulos y metas, armar sitemap/robots/datos estructurados, mejorar la ficha de Google o decidir qué contenido crear. Incluye la variante para ecommerce.
---

# SEO para pymes

Método basado en el episodio 71 del podcast de Haciendola.com, *La guía definitiva de SEO para ecommerce*, con Fernando Parra (Agencia RYF). Está adaptado a los negocios de servicios locales que atendemos. Lo que solo aplica a tiendas online está en `referencias/ecommerce.md`.

## La idea central

El SEO captura demanda que **ya existe**: lo que la gente escribe en Google. El orden de trabajo es:

1. **Primero lo que vende.** Búsquedas transaccionales ("taller mecánico Melipilla", "cambio de pastillas de freno precio") y locales ("podólogo cerca de mí").
2. **Después lo informativo.** Blog y guías, enlazados a las páginas que venden.
3. **Cubrir toda la demanda del rubro.** Cada búsqueda relevante debe tener una página que la atienda. Cuando un sitio cubre todo su tema, Google lo trata como experto y termina posicionándolo también para la búsqueda genérica.

El error más común es crear pocas páginas genéricas, como "Servicios" o "Hombre / Mujer". Así se compite solo contra los gigantes y se pierden las búsquedas específicas, que son más fáciles y convierten mejor.

## Flujo de trabajo

Sigue los pasos en orden. Cada uno tiene su detalle en `referencias/`.

### 1. Estudio de palabras clave → `referencias/palabras-clave.md`
- Arma combinaciones: servicio × modificador (para, de, con, precio, urgente, a domicilio, marca) × lugar (ciudad, comuna, "cerca de mí").
- Amplía la lista con el autocompletado de Google, "Más preguntas", "Búsquedas relacionadas" y AnswerThePublic.
- Mide el volumen y la tendencia con el **Planificador de palabras clave de Google Ads**. Es gratis, y las herramientas pagadas usan los mismos datos.
- Saca de la lista las marcas o servicios que el cliente no ofrece y a la competencia.
- Fija un volumen mínimo según lo que vale cada cliente. Un servicio caro justifica palabras con pocas búsquedas.
- Clasifica cada palabra por intención: transaccional, local o informativa. Confírmalo **mirando los resultados de Google**.

### 2. Arquitectura del sitio → `referencias/arquitectura.md`
- Agrupa las palabras que muestran los mismos resultados en Google. Cada grupo es **una página**.
- Organiza **páginas madre** (un servicio) y **páginas hijas** (sub-servicio, tipo de vehículo, marca, comuna). Haz páginas hijas solo si hay demanda y contenido propio.
- **No canibalizar.** Dos páginas no pueden apuntar a la misma búsqueda. Si Google muestra resultados distintos para dos búsquedas, van en páginas distintas. Si muestra los mismos, van en la misma página.
- No todo va en el menú, pero **todo debe quedar enlazado**: la madre enlaza a sus hijas, cada página a sus hermanas, y siempre hay migas de pan.

### 3. SEO local → `referencias/seo-local.md`
Para nuestros clientes suele ser **lo que más rinde**: ficha de Google (Perfil de Empresa) completa al 100%, reseñas constantes y respondidas, y nombre, dirección y teléfono iguales en la web y en la ficha.

### 4. SEO on-page (cada página) → `referencias/checklist-pagina.md`
- Usa **un H1** con la palabra principal. Los H2 y H3 llevan variantes y sinónimos de la misma búsqueda.
- El **título y la meta descripción se escriben como un anuncio**: palabra clave, beneficio y marca o lugar.
- El tipo de página lo decide quién ya está primero. Busca la palabra, mira el top 3 y haz una página del mismo tipo, pero mejor y más completa.
- Cierra cada página con **preguntas frecuentes** sacadas de "Más preguntas" de Google.
- Pon en el menú nombres que la gente busca, nunca nombres creativos. Para probar uno, búscalo en Google: si no aparecen negocios como el del cliente, ese nombre no sirve.
- Usa URLs legibles: `/frenos-y-pastillas` y no `/cat?id=165`.

### 5. Contenido informativo → `referencias/arquitectura.md` (sección Blog)
- Hazlo solo cuando las páginas que venden ya existen.
- Parte por lo más cercano a la contratación: comparativas, "cuánto cuesta", "cada cuánto", "mejores…". Deja para después lo lejano, como "cómo hacerlo uno mismo".
- Cada artículo enlaza a la página de servicio que corresponde. Se puede redactar con IA si queda revisado y es útil de verdad.

### 6. SEO técnico → `referencias/tecnico.md` y `referencias/datos-estructurados.md`
- Datos estructurados en JSON-LD: el subtipo de LocalBusiness, Service, FAQPage, BreadcrumbList y la persona autora. Google y las IA los leen.
- **E-E-A-T** (experiencia, pericia, autoridad y confianza): un autor real con sus credenciales, reseñas, teléfono, correo, dirección y políticas en el footer.
- `sitemap.xml` enviado en Search Console y `robots.txt` correcto. Las maquetas llevan `noindex` hasta que el cliente las apruebe.
- Diseño pensado primero para móvil y carga rápida: imágenes WebP de menos de ~100 KB, pocos scripts externos y videos en YouTube incrustados.
- Revisa **PageSpeed** en la home, en una página de servicio y en otra más. Mira el puntaje de **Rendimiento** y los Core Web Vitals. No pierdas tiempo en el puntaje "SEO" de PageSpeed.

### 7. Off-page
Un enlace de un sitio **del mismo rubro o de la misma zona** vale más que uno de un sitio grande genérico, porque transmite autoridad temática. Sirven la prensa local, las asociaciones gremiales, los proveedores, los directorios del rubro y la cámara de comercio. Ojo: una mala reputación fuera de la web (reclamos, "funas") también resta.

### 8. Buscadores con IA y Bing → `referencias/tecnico.md` (sección IA)
- Los factores son los mismos del SEO normal. Pesan aún más el E-E-A-T, los datos estructurados y **aparecer en listados de terceros** ("mejores talleres en Melipilla"). Un ranking publicado en la web propia no convence a nadie.
- Da de alta el sitio en **Bing Webmaster Tools**, porque ChatGPT usa Bing.
- Agregar un `llms.txt` es opcional. Su efecto no está probado, pero tenerlo no hace daño.

### 9. Medición
- **Search Console**: consultas, páginas, enlaces internos y externos, Core Web Vitals y sitemaps.
- Revisa la estacionalidad en el Planificador para aprovechar los meses de más demanda, por ejemplo subiendo los anuncios.
- En **Enlaces internos**, las páginas que reciben más enlaces son las que Google considera más importantes. Haz que coincidan con las que el cliente quiere posicionar.

## Cómo se aplica en este repositorio

- Cada cliente es una carpeta de HTML estático (`gustavo-parra-podologia/`, `asesorias-contables-jc/`, `ttm-service/`…). Su `robots.txt` y su `sitemap.xml` van dentro de la carpeta y usan el dominio del cliente.
- Las páginas de servicio siguen el patrón de `asesorias-contables-jc/operacion-renta.html`: H1 con el servicio y el lugar, secciones H2, preguntas frecuentes, enlaces a los otros servicios y JSON-LD.
- Las maquetas para prospectos llevan `<meta name="robots" content="noindex, nofollow">` hasta que el cliente las apruebe. Al lanzar, se quita esa etiqueta y se agrega la página al sitemap.
- Se publica con el conector de Vercel, como dice `CLAUDE.md`. Al terminar el trabajo, se anota en el panel con `scripts/anotar-trabajo.py`.
- Para auditar un sitio existente, recorre `referencias/checklist-pagina.md` página por página y entrega los hallazgos ordenados por impacto. Primero lo que impide posicionar (noindex olvidado, falta de H1, páginas canibalizadas, carga lenta), después lo que suma.

## Entregables típicos

| Pedido | Entrega |
|---|---|
| "Haz el SEO de X" | Planilla de palabras clave clasificadas, mapa de páginas madre e hijas, páginas creadas u optimizadas, sitemap, robots, JSON-LD y checklist de la ficha de Google |
| "Audita la web de X" | Lista priorizada de problemas con la página afectada y el arreglo propuesto |
| "Página nueva de servicio" | Página según `referencias/checklist-pagina.md`, enlazada desde la madre y las hermanas, y agregada al sitemap |
| "Contenido para el blog" | Artículos cercanos a la contratación, cada uno enlazado a su servicio y sin canibalizar páginas existentes |
