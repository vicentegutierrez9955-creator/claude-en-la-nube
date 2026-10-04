# Resumen de la conversación (para seguir en local)

## Qué pidió el usuario
1. Investigar el programa de punto de venta **eleventa** y crear uno igual, con las mismas funciones
   y atajos de teclado, para el negocio de su suegro (uso personal, no comercial).
2. Poder **cargar la base de datos/stock de una vez** (no producto por producto) → importación desde Excel/CSV
   exportado de eleventa.
3. **Conectar varias computadoras por Wi-Fi** compartiendo inventario, sin necesitar internet:
   una computadora es el servidor principal y las demás se conectan.
4. **Instalador de Windows** que traiga todo lo necesario (no instalar otros programas).

## Qué se hizo
- Investigación de eleventa (ayuda oficial y búsquedas): atajos F1–F12, INS, DEL, Ctrl+P, `3*código`, `+/-`,
  tickets pendientes, cobro F1/F2, formas de pago (efectivo, tarjeta, vales, mixto, crédito), créditos y abonos,
  promociones por rango de cantidad, actualizar varios, inventario (agregar, ajustes, bajos, reporte,
  movimientos, kardex), corte por turno y del día, cajeros con permisos, configuración de ticket,
  importación con mapeo de columnas (Código, Descripción, Precio Costo, Precio Venta, Precio Mayoreo,
  Departamento, Existencia, Inv. Mínimo, Inv. Máximo, Tipo de Venta).
- Programa completo en `puntoventa/` (ver `CLAUDE.md` para la arquitectura).
- Servidor Node.js + SQLite que comparte datos por la red local; cada caja con su turno y corte.
- Instalador NSIS con Node.js incluido (modo servidor o caja).
- Prueba de punta a punta (`tests/e2e.test.js`) con dos cajas simultáneas: pasa.
- Código subido a GitHub: `vicentegutierrez9955-creator/claude-en-la-nube`, rama `claude/admiring-cerf-tzi8sm`.

## Versión 1.1.0
- Se agregó **Mermas** (F4 Inventario → Mermas): registro con motivo y reporte del dinero perdido.
- Se agregó **Transferir datos desde eleventa** (Configuración): productos y clientes con saldos desde los Excel de eleventa.
- Nota: el pedido original de las mermas no estaba en esta conversación, así que se armó según el uso habitual. Si el usuario quiere algo distinto, hay que ajustarlo.

## Versiones 1.1.1 a 1.2.0
- 1.1.1: se arregló el inicio de sesión (el nombre de la caja era obligatorio y no se veía; `admin`/`admin` la primera vez).
- 1.1.2: el instalador cierra bien el servidor anterior (antes fallaba con "Error abriendo archivo para escritura: node.exe").
- 1.2.0: **Configuración → Base de datos** carga la base completa de eleventa (`PDVDATA.FDB`) con el Firebird 2.5 incluido.

## Estado / próximos pasos
- Probar la carga del PDVDATA.FDB real del suegro: confirmar que se reconocen el límite y el saldo de los clientes.
- Falta probar el instalador en un Windows real.
- Falta probar la importación con un archivo real exportado de eleventa.
- No incluido: facturación electrónica (CFDI), recargas, pago de servicios, báscula conectada.
- Actualizar SheetJS a 0.20.x si es posible (0.18.5 tiene una vulnerabilidad conocida).

## Cómo seguir en local
1. Descomprima esta carpeta.
2. Abra una terminal dentro de ella y ejecute `claude`. Claude Code leerá `CLAUDE.md` automáticamente.
3. Puede decirle: "Lee HISTORIAL-CONVERSACION.md y sigamos con el punto de venta".
4. Para ver el programa: `npm start` y abra http://localhost:8080 (usuario `admin`, sin contraseña).
