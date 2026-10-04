#!/usr/bin/env python3
"""Arma el link para anotar un trabajo (o un prospecto) en el panel de clientes.

Uso: PANEL_API_TOKEN=... python3 scripts/anotar-trabajo.py '{"id": "t-...", "titulo": "...", ...}'
     PANEL_API_TOKEN=... python3 scripts/anotar-trabajo.py --prospecto '{"id": "p-...", "negocio": "...", ...}'

Campos: id (único, evita duplicados), titulo, fecha (AAAA-MM-DD), clienteId (id de un
cliente del panel, ej. "asesorias-contables-jc") o cliente (texto libre, ej. "Prospectos
Santiago"), detalle, estado ("hecho", "en curso" o "pendiente") y links [{nombre, url}].
Con --prospecto: id (ej. "p-negocio"), negocio, rubro, comuna, direccion, contacto,
whatsapp, telefono, redes, mensaje (primer mensaje sugerido), notas y creado
[{nombre, url}] (maquetas). Si el prospecto ya existe, solo rellena campos vacíos y
agrega links nuevos a "creado"; nunca pisa lo que escribió el equipo. Para asociar un
trabajo a un prospecto, usa "prospectoId" en el trabajo.
El link resultante se abre con un GET (por ejemplo con web_fetch_vercel_url).
"""
import base64
import json
import os
import sys

token = os.environ.get('PANEL_API_TOKEN')
if not token:
    sys.exit('Falta la variable de entorno PANEL_API_TOKEN')
args = sys.argv[1:]
ruta = 'trabajo'
if args and args[0] == '--prospecto':
    ruta, args = 'prospecto', args[1:]
datos = json.loads(args[0])
d = base64.urlsafe_b64encode(json.dumps(datos, ensure_ascii=False).encode()).decode().rstrip('=')
print(f'https://plantillas-omega.vercel.app/api/panel/{ruta}?t={token}&d={d}')
