#!/usr/bin/env bash
# Arma el instalador de Windows: dist/PuntoDeVenta-Instalador-<versión>.exe
# Requisitos (Linux): makensis (paquete "nsis"), curl, sha256sum.
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-22.22.2}"
VERSION="${VERSION:-1.2.0}"
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"

rm -rf stage
mkdir -p stage/app stage/node cache "$ROOT/dist"

# 1) Node.js para Windows (verificado con la suma SHA-256 oficial)
NODE_EXE="cache/node-v$NODE_VERSION-win-x64.exe"
if [ ! -f "$NODE_EXE" ]; then
  echo "Descargando Node.js v$NODE_VERSION para Windows..."
  curl -fsSL -o cache/SHASUMS256.txt "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt"
  curl -fsSL -o cache/node.exe.tmp "https://nodejs.org/dist/v$NODE_VERSION/win-x64/node.exe"
  expected="$(grep ' win-x64/node.exe$' cache/SHASUMS256.txt | cut -d' ' -f1)"
  actual="$(sha256sum cache/node.exe.tmp | cut -d' ' -f1)"
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
    echo "ERROR: la suma SHA-256 de node.exe no coincide" >&2
    exit 1
  fi
  mv cache/node.exe.tmp "$NODE_EXE"
fi
cp "$NODE_EXE" stage/node/node.exe

# 2) Firebird 2.5 (sólo para leer la base de datos de eleventa, PDVDATA.FDB). Escucha únicamente en 127.0.0.1.
FB_VERSION="2.5.9.27139-0"
FB_SHA256="707e05bae8994b06cec60815a292078db82d8e75616f4dd514b7e417a3ee2137"
FB_ZIP="cache/Firebird-$FB_VERSION-x64.zip"
if [ ! -f "$FB_ZIP" ]; then
  echo "Descargando Firebird $FB_VERSION para Windows..."
  curl -fsSL -o cache/fb.zip.tmp "https://github.com/FirebirdSQL/firebird/releases/download/R2_5_9/Firebird-${FB_VERSION}_x64.zip"
  mv cache/fb.zip.tmp "$FB_ZIP"
fi
if [ "$(sha256sum "$FB_ZIP" | cut -d' ' -f1)" != "$FB_SHA256" ]; then
  echo "ERROR: la suma SHA-256 de Firebird no coincide" >&2
  exit 1
fi
mkdir -p stage/firebird
( cd stage/firebird && unzip -q -o "../../$FB_ZIP" \
    bin/fbserver.exe bin/fbclient.dll bin/ib_util.dll bin/icudt30.dll bin/icuin30.dll bin/icuuc30.dll \
    bin/msvcp80.dll bin/msvcr80.dll bin/Microsoft.VC80.CRT.manifest \
    firebird.conf firebird.msg security2.fdb aliases.conf intl/fbintl.dll intl/fbintl.conf IDPLicense.txt IPLicense.txt )
printf '\r\n# Punto de Venta: solo para leer PDVDATA.FDB, unicamente desde esta computadora\r\nRemoteServicePort = 30550\r\nRemoteBindAddress = 127.0.0.1\r\n' >> stage/firebird/firebird.conf

# 3) Programa
cp -r "$ROOT/puntoventa/index.html" "$ROOT/puntoventa/icon.png" "$ROOT/puntoventa/css" "$ROOT/puntoventa/js" "$ROOT/puntoventa/vendor" "$ROOT/puntoventa/server" stage/app/
cp "$ROOT/puntoventa/windows/PuntoDeVenta.ico" stage/
for f in PuntoDeVenta.vbs IniciarServidor.vbs ServidorConVentana.cmd RestablecerAdmin.cmd; do
  sed 's/\r$//; s/$/\r/' "$ROOT/puntoventa/windows/$f" > "stage/$f"
done
sed 's/\r$//; s/$/\r/' "$ROOT/installer/LEEME.txt" > stage/LEEME.txt

# 4) Instalador
makensis -V2 -DVERSION="$VERSION" puntoventa.nsi
ls -la "$ROOT/dist/"
