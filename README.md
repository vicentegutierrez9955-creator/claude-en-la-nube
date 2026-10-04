# Punto de Venta

Programa de punto de venta para uso personal, hecho a partir de las funciones y atajos de teclado de **eleventa**. Varias computadoras conectadas al mismo Wi-Fi comparten inventario, clientes y ventas, sin necesitar internet.

- **Instalador de Windows** con todo incluido: no hay que instalar Node.js ni otros programas.
- **Importación desde Excel/CSV**: se carga el catálogo completo (con existencias) de una vez, usando el archivo que exporta eleventa.
- **Varias cajas en red**: una computadora es el servidor y las demás se conectan por Wi-Fi o cable.

---

## Instalación en Windows

1. Descargue `PuntoDeVenta-Instalador-1.1.0.exe`: en GitHub → pestaña **Actions** → última ejecución de "Pruebas e instalador de Windows" → **Artifacts**. También se arma con `bash installer/build.sh`.
2. En la **computadora principal** ejecute el instalador y elija **"Computadora PRINCIPAL (servidor)"**.
   - Se abre el acceso directo **Punto de Venta** en el escritorio.
   - El servidor se enciende solo cada vez que inicia Windows.
   - Se agrega una regla en el Firewall de Windows que sólo permite conexiones desde la red local.
   - Los datos quedan en `C:\ProgramData\PuntoDeVenta\datos`, con respaldos automáticos en la subcarpeta `respaldos`.
3. En las **otras cajas** ejecute el mismo instalador y elija **"CAJA conectada"**. Escriba la dirección de la computadora principal, que aparece en *Configuración → Red y cajas* (por ejemplo `192.168.1.10`).
   - También puede abrir esa dirección (`http://192.168.1.10:8080`) en Chrome o Edge sin instalar nada.
4. La primera vez entre con el usuario **admin** sin contraseña, y cámbiela en *Configuración → Cajeros y permisos*.

> Recomendación: fije la IP de la computadora principal en el módem (reserva DHCP) para que la dirección no cambie.

El acceso directo abre el programa como aplicación, sin barra del navegador, y con **impresión directa** (`--kiosk-printing`) a la impresora predeterminada de Windows. Configure su impresora de tickets como predeterminada.

## Transferir la base de datos desde eleventa

En **Configuración → Transferir datos desde eleventa** hay un asistente paso a paso:

1. **Productos, precios, existencias y departamentos**: en eleventa, *F3 Productos → Exportar* y luego **Importar productos** aquí.
2. **Clientes y saldos de crédito**: en eleventa, *F2 Clientes → Exportar...* y luego **Importar clientes** aquí. Se cargan el nombre, el teléfono, la dirección, el límite de crédito ("Sin límite" incluido) y el **saldo actual** de cada cliente.
3. Revise el inventario y el reporte de saldos.

Se puede repetir sin duplicar nada: lo que ya existe se actualiza. No se lee directamente el archivo interno de eleventa (`PDVDATA.FDB`, de Firebird) porque eso exige instalar programas extra. Por eso se usan los archivos de Excel que el mismo eleventa exporta.

Para mover **todo** (incluido el historial de ventas y cortes) entre dos instalaciones de este programa, use *Configuración → Respaldos*.

## Cargar los productos desde eleventa

1. En eleventa: **Productos → Exportar a Excel**, o **Inventario → Reporte de inventario → Exportar**.
2. Aquí: **F3 Productos → Importar**, y arrastre el archivo.
3. El programa reconoce solo las columnas (Código, Descripción, Precio Costo, Precio Venta, Precio Mayoreo, Departamento, Existencia, Inv. Mínimo, Inv. Máximo, Tipo de Venta). Si alguna no se reconoce, se elige a mano.
4. Revise la vista previa y presione **Importar**. Se puede elegir si los productos repetidos se actualizan o se omiten, y si la existencia se reemplaza o se suma.

Acepta `.xlsx`, `.xls` y `.csv` (con `,` `;` o tabulador, en UTF-8 o Windows-1252). *Descargar plantilla de ejemplo* genera un archivo modelo.

## Funciones

| Sección | Funciones |
|---|---|
| **F1 Ventas** | Código de barras, `3*código` para varias piezas, **+ / -** para cambiar la cantidad, tickets pendientes (F6 nuevo, F5 cambiar), F10 buscar, F11 mayoreo, INS varios, Ctrl+P artículo común (o código `0`), DEL borrar, F9 verificador de precios, F7/F8 entradas y salidas de efectivo, descuentos y cambio de precio con autorización, venta a granel (por cantidad o importe), paquetes/kits, asignar cliente, notas, reimprimir, ventas del día, devoluciones parciales y cancelaciones |
| **Cobro (F12)** | Efectivo con cambio, tarjeta, vales, mixto (tarjeta + vales + efectivo), crédito con anticipo y límite; F1 cobrar e imprimir, F2 cobrar sin imprimir |
| **F2 Clientes** | Alta, modificación y baja, crédito con o sin límite, abonos repartidos en los tickets más antiguos o en uno elegido, estado de cuenta imprimible, reporte de saldos, exportar a Excel |
| **F3 Productos** | Alta y modificación (costo, % ganancia, precio, mayoreo, mayoreo automático por cantidad, departamento, inventario mín./máx.), unidad, granel o paquete, departamentos, **promociones** (precio por rango de cantidad, "N por $X", % con vigencia), **actualizar varios a la vez**, ventas por periodo, importar/exportar Excel, etiquetas con código de barras |
| **F4 Inventario** | Agregar mercancía (actualizando costo y precios), ajustes con motivo, **mermas** (vencido, dañado, robo, consumo interno, muestras) con el dinero perdido y su reporte por motivo, producto y departamento, productos bajos en inventario con compra sugerida, reporte de inventario valuado, reporte de movimientos, **kardex** por producto |
| **Corte** | Corte por caja/turno con fondo, dinero esperado vs. contado (faltante/sobrante), ventas por forma de pago y por departamento, ganancia, entradas y salidas; corte del día de todas las cajas; historial y reimpresión |
| **Reportes** | Ventas y ganancia por día, cajero, caja, departamento, forma de pago, hora; productos más vendidos; listado de tickets; gráfica; exportar e imprimir |
| **Configuración** | Datos del negocio, ticket (encabezado, pie, logo, 58/80 mm, copias, vista previa), cajeros con permisos, impuestos, moneda, reglas de venta, red y cajas, respaldos (descargar, restaurar, borrar todo) |

### Permisos

Cada cajero tiene permisos para vender, aplicar descuentos o mayoreo, devolver o cancelar, registrar entradas y salidas, administrar clientes, vender a crédito, editar productos, ajustar inventario, ver reportes, hacer el corte y cambiar la configuración. Si un cajero intenta algo sin permiso, un supervisor puede autorizarlo con su usuario y contraseña. El servidor también revisa los permisos.

### Diferencias con eleventa

No incluye facturación electrónica (CFDI), recargas telefónicas ni pago de servicios, porque dependen de contratos con proveedores externos. La báscula se usa escribiendo el peso o el importe en la ventana de granel.

## Cómo funciona la red

```
 Caja 2 (navegador) ─┐
                     ├── Wi-Fi / red local ──> Computadora principal
 Caja 3 (navegador) ─┘                         servidor (Node.js + SQLite)
                                               http://IP:8080
```

- El servidor (`puntoventa/server/server.js`) guarda todo en SQLite y ejecuta las operaciones en orden, una a la vez. Así, dos cajas que venden el mismo producto al mismo tiempo nunca descuentan mal la existencia.
- Las reglas del negocio (`puntoventa/js/store.js`) son el mismo código en el servidor y en las pantallas.
- Cuando una caja vende o cambia un precio, las demás lo ven al momento (Server-Sent Events).
- Cada caja tiene su propio turno y su propio corte, como en eleventa MultiCaja.
- Si la computadora principal se apaga, las cajas muestran "SIN CONEXIÓN" hasta que vuelva.

## Para desarrolladores

```bash
npm start            # servidor en http://localhost:8080 (datos en puntoventa/datos)
npm test             # prueba de punta a punta con dos cajas en Chromium (requiere playwright)
npm run instalador   # arma dist/PuntoDeVenta-Instalador-<versión>.exe (requiere nsis)
```

Requiere Node.js 22.13 o más reciente (usa `node:sqlite`). No tiene dependencias de npm. SheetJS (Excel) y JsBarcode (etiquetas) vienen incluidos en `puntoventa/vendor/`.
