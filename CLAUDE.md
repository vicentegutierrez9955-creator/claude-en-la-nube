# Punto de Venta (estilo eleventa)

Programa de punto de venta para el negocio del suegro del usuario (uso personal, no comercial).
Objetivo: replicar las funciones y **los mismos atajos de teclado** de eleventa, compartir inventario
entre varias computadoras por Wi-Fi (sin internet) e instalarse en Windows sin instalar nada más.
Todo el texto de la interfaz y la documentación va en **español**.

## Arquitectura
- `puntoventa/server/server.js`: servidor Node.js (sin dependencias npm) con `node:sqlite`.
  Sirve la app y una API. Ejecuta las operaciones que modifican datos **en fila** (una a la vez)
  para que dos cajas no descuenten mal el stock. Avisa cambios a las cajas con Server-Sent Events.
  Respaldos JSON automáticos en `datos/respaldos` (al iniciar y cada 6 h).
  Variables: `PORT` (8080), `PV_DATA_DIR` (por defecto `puntoventa/datos`).
- `puntoventa/js/store.js`: reglas del negocio (ventas, devoluciones, inventario, créditos, turnos, corte).
  **El mismo archivo corre en el servidor** (cargado con `vm`) y en el navegador.
- `puntoventa/js/remote.js`: en el navegador reemplaza los métodos de `Store` que escriben por llamadas
  RPC (`/api/rpc`). Si agregas un método nuevo que escribe datos, regístralo en `remote.js` **y** en
  `METHODS` de `server.js` con su permiso.
- `puntoventa/js/db.js`: cliente HTTP (`Remote`) + lecturas (`DB.all/get/byIndex/range`).
- Pantallas: `ventas.js` (F1), `clientes.js` (F2), `productos.js` (F3), `importar.js`, `inventario.js` (F4),
  `configuracion.js`, `corte.js`, `reportes.js`. Utilidades: `util.js`, `ui.js` (ventanas), `print.js` (tickets).
- Cada computadora es una "caja" (nombre guardado en `localStorage`), con su propio turno y corte.
- `puntoventa/vendor/`: SheetJS 0.18.5 (Excel) y JsBarcode (etiquetas), incluidos para funcionar sin internet.

## Funciones agregadas en la versión 1.1.0
- **Mermas** (F4 Inventario → Mermas): `Store.registrarMerma` guarda un movimiento `movinv` de tipo `merma`, con `motivo` y `costoTotal`, más su reporte.
- Importación de clientes con saldos desde Excel (`Importar.clientes` → `Store.importarClientes`).

## Versión 1.1.1 (arreglo del inicio de sesión)
- Antes, la caja exigía escribir un nombre en un campo fácil de pasar por alto, y no dejaba entrar. Ahora el
  nombre llega en `?caja=%COMPUTERNAME%` (desde `PuntoDeVenta.vbs`) o se usa uno por defecto.
- La primera vez, `admin` entra con contraseña vacía o `admin` (`Store.login`) y se ofrece crear una contraseña.
- `node server/server.js --restablecer-admin` deja a `admin` sin contraseña (acceso `RestablecerAdmin.cmd`).
- Al arrancar, la app reintenta la conexión con el servidor durante 30 s.

## Versión 1.1.2 (arreglo del instalador al actualizar)
- El instalador NSIS es de 32 bits: con `powershell` de 32 bits, `Get-Process` no ve la ruta del `node.exe`
  de 64 bits, así que no cerraba el servidor y fallaba con "Error abriendo archivo para escritura: node.exe".
  Ahora usa PowerShell de 64 bits + `Get-CimInstance Win32_Process` (macro `DETENER_SERVIDOR`), comprueba
  que `node.exe` se pueda abrir para escritura y, si sigue bloqueado, explica qué hacer.
- `server.js`: si el puerto está ocupado por otra versión, le pide que se cierre (`/api/apagar-local`,
  sólo desde 127.0.0.1) y toma su lugar.

## Versión 1.2.0: base de datos completa de eleventa
- Configuración → **Base de datos** (antes "Transferir datos desde eleventa"): botón para cargar `PDVDATA.FDB`,
  más una zona donde se arrastran varios archivos y se reconoce solo de qué tipo es cada uno (`Importar.tipoArchivo`).
- `puntoventa/server/eleventa.js`: copia el `.FDB`, enciende el Firebird 2.5 incluido (`$INSTDIR\firebird`, copiado a
  `datos/firebird-motor` porque necesita escribir en él) en `127.0.0.1:30550`, lee con `server/vendor/node-firebird`
  (MPL-2.0, sin dependencias), reconoce tablas y columnas por alias (`PRODUCTOS`, `DEPARTAMENTOS`, `CLIENTES`;
  `CODIGO`, `DESCRIPCION`, `PCOSTO`, `PFINAL`/`PVENTA`, `MAYOREO`, `DINVENTARIO`, `DINVMINIMO`, `DINVMAXIMO`,
  `TVENTA`, `USA_INVENTARIO`, `DEPT`, `ELIMINADO_EN`...) y devuelve filas para `importarProductos`/`importarClientes`.
- API: `/api/eleventa/buscar`, `/api/eleventa/leer-ruta`, `/api/eleventa/subir` (permiso de configuración).
- Pruebas: `source tests/preparar-firebird-linux.sh && npm test` usa `tests/fixtures/PDVDATA-ejemplo.FDB`.
- Nota: los nombres reales de columnas de clientes en eleventa (límite y saldo) no están confirmados. Si no se
  encuentra el saldo, se avisa en la vista previa.

## Atajos (igual que eleventa)
F1 Ventas, F2 Clientes, F3 Productos, F4 Inventario. En ventas: F10 Buscar, F11 Mayoreo, F12 Cobrar,
INS Varios, Ctrl+P Artículo común (o código `0`), DEL Borrar, F5 Cambiar ticket, F6 Ticket pendiente,
F7 Entradas, F8 Salidas, F9 Verificador, `+`/`-` cantidad, `3*código`. Cobro: F1 cobrar e imprimir,
F2 cobrar sin imprimir; F5 efectivo, F6 tarjeta, F7 mixto, F8 crédito, F9 vales.

## Comandos
```bash
npm start            # servidor en http://localhost:8080 (usuario admin, sin contraseña la primera vez)
npm test             # prueba de punta a punta con dos cajas (necesita playwright + chromium)
npm run instalador   # arma dist/PuntoDeVenta-Instalador-<versión>.exe (necesita nsis, curl)
```
Requiere Node.js >= 22.13.

## Instalador de Windows
`installer/puntoventa.nsi` + `installer/build.sh` (NSIS). Incluye `node.exe` (verificado por SHA-256).
Modo "servidor" (inicio automático, regla de firewall solo red local, datos en `C:\ProgramData\PuntoDeVenta\datos`)
o modo "caja" (guarda la dirección del servidor en `servidor.txt`). Lanzadores en `puntoventa/windows/`.
El flujo `.github/workflows/instalador.yml` corre las pruebas y sube el instalador como artifact.

## Pendientes / ideas
- Probar el instalador en un Windows real y una importación con un archivo real exportado de eleventa.
- No incluido: facturación CFDI, recargas, báscula conectada (el peso se escribe a mano).
- SheetJS 0.18.5 tiene una vulnerabilidad conocida al leer archivos maliciosos; actualizar a 0.20.x
  (descargar de cdn.sheetjs.com) cuando sea posible.
