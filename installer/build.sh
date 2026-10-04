#!/usr/bin/env bash
# Arma el instalador de Windows: dist/PuntoDeVenta-Instalador-<versión>.exe
# Requisitos (Linux): makensis (paquete "nsis"), curl, sha256sum.
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-22.22.2}"
VERSION="${VERSION:-1.1.1}"
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

# 2) Programa
cp -r "$ROOT/puntoventa/index.html" "$ROOT/puntoventa/icon.png" "$ROOT/puntoventa/css" "$ROOT/puntoventa/js" "$ROOT/puntoventa/vendor" "$ROOT/puntoventa/server" stage/app/
cp "$ROOT/puntoventa/windows/PuntoDeVenta.ico" stage/
for f in PuntoDeVenta.vbs IniciarServidor.vbs ServidorConVentana.cmd RestablecerAdmin.cmd; do
  sed 's/\r$//; s/$/\r/' "$ROOT/puntoventa/windows/$f" > "stage/$f"
done
sed 's/\r$//; s/$/\r/' "$ROOT/installer/LEEME.txt" > stage/LEEME.txt

# 3) Instalador
makensis -V2 -DVERSION="$VERSION" puntoventa.nsi
ls -la "$ROOT/dist/"
