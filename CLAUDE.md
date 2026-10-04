# Notas para Claude

## Anotar cada trabajo en el panel de clientes

El equipo lleva sus clientes en el panel https://plantillas-omega.vercel.app/panel.
Al terminar cada trabajo (una maqueta, una página, un cambio para un cliente, una
planilla, etc.), anótalo en la pestaña "Trabajos" del panel:

1. Arma el link con `scripts/anotar-trabajo.py` (lee la clave de `PANEL_API_TOKEN`).
   Usa un `id` único y estable por trabajo (ej. `t-jc-pagina-renta`) para no duplicar.
2. Ábrelo con un GET; desde este entorno, con `web_fetch_vercel_url` del conector de
   Vercel (el dominio no es accesible con curl). Debe responder `{"ok":true}`.

Si `PANEL_API_TOKEN` no está en el entorno, pídele al usuario que la agregue como
variable de entorno del ambiente de Claude Code (nunca la escribas en el repositorio:
es público).

## Despliegue

El sitio vive en el proyecto `plantillas` de Vercel (team `team_OAurKsI9bj0RtUt4Sq6im9Ik`,
proyecto `prj_M4iuHIAX69tyxDOAeeGuP0s3E8to`) y se publica con el conector de Vercel
subiendo archivos, no desde Git.
