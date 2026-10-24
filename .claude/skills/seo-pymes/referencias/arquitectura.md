# Arquitectura SEO, enlazado interno y blog

## Páginas madre e hijas

Con la planilla clasificada, filtra por la palabra base de cada servicio y busca los subgrupos que aparecen.

Ejemplo para un taller:

```
Mantención (madre)
├── Cambio de aceite y filtros
├── Mantención por kilometraje (10.000 / 20.000 km)
└── Mantención Toyota / Hyundai / …   ← solo si hay demanda y el taller las atiende
Frenos (madre)
├── Cambio de pastillas
├── Rectificado de discos
└── Líquido de frenos
Scanner / diagnóstico (madre)
└── Luz check engine
```

Ejemplo para un contador: Renta (madre) → F22 personas, F22 independientes (boletas de honorarios), renta para empresas.

Reglas:
- **Haz una hija solo si hay demanda real y contenido propio.** Una página "taller en [comuna]" que repite la misma página con otra comuna es una *doorway page* y Google la penaliza. Crea páginas por comuna solo si el cliente realmente atiende esa zona y hay algo distinto que decir: cómo llegar, tiempos, casos de esa zona.
- **Si un sub-servicio tendrá un solo contenido para siempre**, puede quedar como sección de la madre. Si va a crecer, conviene darle su propia página desde ya.
- **Hasta tres niveles** (madre → hija → nieta) cuando la demanda lo amerite.

## Canibalización

Pasa cuando dos URLs del sitio apuntan a la misma búsqueda. Google no sabe cuál mostrar y suele no posicionar ninguna.

- No hagas "Frenos" y "Frenos 2", ni una página de servicio "Cambio de pastillas" junto a un artículo "Cambio de pastillas".
- Para decidir si dos búsquedas van juntas o separadas, búscalas ambas. Si Google muestra los mismos resultados, van en la misma página. Si muestra resultados distintos (por ejemplo "pastillas de freno" frente a "mejores pastillas de freno"), van en páginas distintas.
- Las búsquedas internas, los filtros y las URLs con parámetros no se indexan (ver `tecnico.md`, robots).

## Menú

- Usa los nombres que la gente busca, empezando por las categorías de más volumen. Un nombre creativo ("Colección Aurora", "Soluciones integrales") no dice nada ni a Google ni al cliente.
- Pon todos los enlaces que quepan **sin empeorar la experiencia**. El resto de las páginas queda enlazado desde las madres.
- Usa un menú estándar, el que la gente ya conoce: hamburguesa en móvil y logo a la izquierda. No reinventes la navegación.
- Los enlaces del menú y del contenido deben existir **también en la versión móvil**.

## Enlazado interno

Los enlaces internos le dicen a Google qué páginas son importantes y retienen al visitante.

- **La madre enlaza a todas sus hijas**, con bloques o "chips" bajo el título o en el contenido.
- **Al pie de cada página, enlaza a las hermanas** con un bloque "Otros servicios". Ejemplo: `asesorias-contables-jc/*.html`.
- **Migas de pan obligatorias** (Inicio › Frenos › Cambio de pastillas), con su `BreadcrumbList` en JSON-LD.
- **El footer enlaza a las páginas prioritarias.** Así reciben enlaces desde todo el sitio.
- **El blog enlaza a los servicios** y no al revés como estrategia principal.
- Revisa Search Console → **Enlaces → Páginas con más enlaces internos**. Si las primeras no son las que se quieren posicionar, corrige el enlazado.

## Blog y contenido informativo

Va después de las páginas transaccionales. Muchos sitios llenan el blog y suben en visitas, pero esas visitas no compran ni contratan.

Prioridad según qué tan cerca está de la contratación (niveles de conciencia):

1. **Cerca**: "cuánto cuesta cambiar pastillas de freno", "mejor podólogo para uña encarnada", comparativas entre opciones, "cada cuánto se cambia la correa de distribución".
2. **Medio**: "por qué se prende la luz de check engine", "qué es la ortonixia".
3. **Lejos**: "cómo limpiar mis frenos yo mismo". Atrae visitas que difícilmente contratan.

Cada artículo:
- Atiende **otra intención** distinta de la página de servicio, para no canibalizarla.
- Enlaza a la página de servicio o reserva que corresponde, con un llamado claro.
- Si trata salud, dinero o temas legales, lo firma **una persona con credenciales** (el podólogo, el contador). Ver E-E-A-T en `tecnico.md`.
- Puede escribirse con IA, pero **revisado** y con datos reales del negocio. El contenido genérico no posiciona.
- **Listicles**: listas de "los X mejores…" con productos o servicios propios enlazados. Sirven para convertir tráfico informativo en clientes. Cuando el top 3 de una búsqueda es una lista de 15, la página propia debe superarla en cantidad y calidad.

## Cómo decidir el tipo de contenido para una palabra

El SEO es una competencia. Busca la palabra y mira los tres primeros orgánicos:
- Si son fichas o listados de negocios, haz una página de servicio con poco texto, bien estructurada.
- Si son guías largas, haz una guía más completa y más clara.
- Si el primero está en otro idioma o es pobre, es una **oportunidad**: un buen contenido en español lo supera.
- Los sitios con mucha autoridad posicionan con poco contenido. Para competir con ellos hay que poner **más**: texto útil bajo el listado, por qué elegir al cliente, tiempos, garantías y preguntas frecuentes.
