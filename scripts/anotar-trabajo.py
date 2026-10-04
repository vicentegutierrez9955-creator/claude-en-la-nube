#!/usr/bin/env python3
"""Arma el link para anotar un trabajo en el panel de clientes.

Uso: PANEL_API_TOKEN=... python3 scripts/anotar-trabajo.py '{"id": "t-...", "titulo": "...", ...}'

Campos: id (único, evita duplicados), titulo, fecha (AAAA-MM-DD), clienteId (id de un
cliente del panel, ej. "asesorias-contables-jc") o cliente (texto libre, ej. "Prospectos
Santiago"), detalle, estado ("hecho", "en curso" o "pendiente") y links [{nombre, url}].
El link resultante se abre con un GET (por ejemplo con web_fetch_vercel_url).
"""
import base64
import json
import os
import sys

token = os.environ.get('PANEL_API_TOKEN')
if not token:
    sys.exit('Falta la variable de entorno PANEL_API_TOKEN')
trabajo = json.loads(sys.argv[1])
d = base64.urlsafe_b64encode(json.dumps(trabajo, ensure_ascii=False).encode()).decode().rstrip('=')
print(f'https://plantillas-omega.vercel.app/api/panel/trabajo?t={token}&d={d}')
