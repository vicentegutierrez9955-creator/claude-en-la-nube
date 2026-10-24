# Datos estructurados (JSON-LD)

Van en `<script type="application/ld+json">` dentro del `<head>`. Se validan con la **Prueba de resultados enriquecidos** de Google (search.google.com/test/rich-results) y con **validator.schema.org**.

Reglas:
- Lo que se marca **tiene que estar visible en la página**: mismo teléfono, mismo horario, mismas preguntas.
- Usa el subtipo más específico de LocalBusiness: `AutoRepair` (talleres), `Dentist`, `MedicalBusiness` o `MedicalClinic` (podología, kinesiología), `AccountingService` (contadores), `VeterinaryCare`, `HealthClub` (gimnasios), `BarberShop` o `HairSalon`, `Restaurant`, `Store`.
- Con varias entidades en la misma página, usa `@graph` y conéctalas con `@id`.

## Negocio local (inicio)

```json
{
  "@context": "https://schema.org",
  "@type": "AutoRepair",
  "@id": "https://dominio.cl/#negocio",
  "name": "TTM Service",
  "url": "https://dominio.cl/",
  "image": "https://dominio.cl/img/fachada.webp",
  "logo": "https://dominio.cl/img/logo.webp",
  "telephone": "+56228324191",
  "priceRange": "$$",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Av. Vicuña Mackenna 609",
    "addressLocality": "Melipilla",
    "addressRegion": "Región Metropolitana",
    "addressCountry": "CL"
  },
  "geo": { "@type": "GeoCoordinates", "latitude": -33.69, "longitude": -71.21 },
  "areaServed": ["Melipilla", "El Monte", "Talagante"],
  "openingHoursSpecification": [
    { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"], "opens": "09:00", "closes": "18:00" },
    { "@type": "OpeningHoursSpecification", "dayOfWeek": "Saturday", "opens": "09:00", "closes": "13:00" }
  ],
  "sameAs": ["https://www.instagram.com/…", "https://maps.google.com/?cid=…"]
}
```

Usa las coordenadas reales del negocio (se sacan de Google Maps). Los valores de arriba son de ejemplo.

## Página de servicio

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Service",
      "name": "Cambio de pastillas de freno",
      "serviceType": "Frenos",
      "provider": { "@id": "https://dominio.cl/#negocio" },
      "areaServed": "Melipilla",
      "description": "Revisión de discos y pastillas y cambio con presupuesto previo."
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Inicio", "item": "https://dominio.cl/" },
        { "@type": "ListItem", "position": 2, "name": "Frenos", "item": "https://dominio.cl/frenos" },
        { "@type": "ListItem", "position": 3, "name": "Cambio de pastillas", "item": "https://dominio.cl/frenos/cambio-de-pastillas" }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        { "@type": "Question", "name": "¿Cada cuánto se cambian las pastillas?", "acceptedAnswer": { "@type": "Answer", "text": "Depende del uso; como referencia entre 20.000 y 40.000 km…" } }
      ]
    }
  ]
}
```

Nota: desde 2023 Google muestra el resultado enriquecido de FAQ casi solo para sitios de gobierno y salud. Igual conviene marcar las preguntas: ordena el contenido y las IA lo leen.

## Profesional o autor (E-E-A-T)

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "@id": "https://dominio.cl/#profesional",
  "name": "Nombre Apellido",
  "jobTitle": "Podólogo clínico",
  "worksFor": { "@id": "https://dominio.cl/#negocio" },
  "alumniOf": "Institución donde estudió",
  "knowsAbout": ["uña encarnada", "pie diabético"],
  "sameAs": ["https://www.instagram.com/…"]
}
```

En un artículo, se referencia el autor con `"author": { "@id": "https://dominio.cl/#profesional" }` dentro de un `Article` o `BlogPosting`. No publiques datos sensibles del profesional (RUT, dirección particular) si el cliente no lo pidió.

## Reseñas

- Las estrellas en los resultados (`AggregateRating`) **no se muestran** cuando un LocalBusiness se califica a sí mismo con reseñas puestas en su propia web; Google las considera "autopromocionales". No inventes valoraciones ni las copies de Google para eso.
- Las reseñas que ayudan al SEO local son las de la **ficha de Google**. En la web se pueden mostrar como prueba social, sin marcarlas.

## Producto (ecommerce)

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Vaso piscolero de vidrio reciclado 500 ml",
  "image": ["https://tienda.cl/img/vaso.webp"],
  "brand": { "@type": "Brand", "name": "Marca" },
  "sku": "VP-500",
  "offers": {
    "@type": "Offer",
    "price": "9990",
    "priceCurrency": "CLP",
    "availability": "https://schema.org/InStock",
    "url": "https://tienda.cl/productos/vaso-piscolero"
  }
}
```

Shopify y otras plataformas ya generan `Product` y `Offer`. Las preguntas frecuentes de la ficha o la categoría normalmente hay que agregarlas aparte.
