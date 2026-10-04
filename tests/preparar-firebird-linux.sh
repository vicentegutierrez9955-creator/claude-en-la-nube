#!/usr/bin/env bash
# Prepara Firebird 2.5 (Linux) para las pruebas de carga de la base de eleventa.
# Uso: source tests/preparar-firebird-linux.sh   (deja exportadas PV_FIREBIRD_DIR y LD_LIBRARY_PATH)
set -euo pipefail
DEST="${FB_TEST_DIR:-$(pwd)/.firebird-pruebas}"
FB="$DEST/opt/firebird"
if [ ! -x "$FB/bin/fbserver" ]; then
  mkdir -p "$DEST" && cd "$DEST"
  curl -fsSL -o fb.tar.gz https://github.com/FirebirdSQL/firebird/releases/download/R2_5_9/FirebirdSS-2.5.9.27139-0.amd64.tar.gz
  tar xzf fb.tar.gz
  tar xzf FirebirdSS-2.5.9.27139-0.amd64/buildroot.tar.gz -C "$DEST"
  printf '\nRemoteServicePort = 30550\nRemoteBindAddress = 127.0.0.1\n' >> "$FB/firebird.conf"
  cd - >/dev/null
fi
mkdir -p "$DEST/compat"
for lib in ncurses tinfo; do
  src="$(ls /lib/x86_64-linux-gnu/lib$lib.so.6* 2>/dev/null | head -1 || true)"
  [ -n "$src" ] && ln -sf "$src" "$DEST/compat/lib$lib.so.5"
done
export PV_FIREBIRD_DIR="$FB"
export LD_LIBRARY_PATH="$DEST/compat${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
set +euo pipefail
