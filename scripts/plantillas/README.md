# Plantillas por rubro

Generan una maqueta completa a partir de una ficha JSON con los datos del negocio.

| Rubro | Generador | Ficha de ejemplo | Vista en línea |
|---|---|---|---|
| Veterinaria | `veterinaria.py` | `datos/veterinaria-demo.json` | https://plantillas-omega.vercel.app/plantilla-veterinaria |
| Gimnasio | `gimnasio.py` | `datos/gimnasio-demo.json` | https://plantillas-omega.vercel.app/plantilla-gimnasio |

## Hacer la maqueta de un prospecto

1. Copia la ficha de ejemplo: `cp datos/veterinaria-demo.json datos/vet-nombre.json`.
2. Cambia los datos: `slug` (la carpeta y la dirección web), nombre, comuna, dirección,
   WhatsApp (`+569...`), horario (lunes a domingo, `null` si cierra), precios, servicios,
   reseñas reales de Google y fotos. Pon `"demo": false` para quitar las etiquetas de "ejemplo".
3. Genera: `python3 scripts/plantillas/veterinaria.py scripts/plantillas/datos/vet-nombre.json`.
4. Se crea la carpeta `<slug>/` en la raíz con `index.html`, `styles.css`, `app.js` e `icons.svg`.
   Súbela a Vercel como las demás maquetas y anótala en el panel.

Las fotos son de Pexels (se pone el número de la foto). Los colores y fuentes están en `tema`.
`base.css` y `comun.py` son compartidos por todas las plantillas.

## Qué trae cada una

- **Veterinaria:** aviso "Abierto ahora" según el horario, franja de urgencias con botón de llamada,
  servicios con precio "desde", orientación "¿Qué le pasa a tu mascota?" que separa urgencias
  (pide llamar) de consultas (arma el WhatsApp), tabla de precios, calendario de vacunas para
  cachorro y gatito, microchip y Ley Cholito, equipo, reseñas, preguntas y mapa con horario.
- **Gimnasio:** clase de prueba gratis como acción principal, planes con precio general o de
  estudiante, "sin letra chica", disciplinas que filtran un horario semanal con reserva por
  WhatsApp, "¿Qué quieres lograr?" que arma una semana tipo y recomienda plan, instalaciones,
  profesores, primera vez, reseñas, preguntas y mapa con horario.
