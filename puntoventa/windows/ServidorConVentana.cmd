@echo off
rem Muestra el servidor en una ventana (útil para ver las direcciones de red o si algo falla).
title Punto de Venta - Servidor
set "PV_DATA_DIR=%ProgramData%\PuntoDeVenta\datos"
"%~dp0node\node.exe" "%~dp0app\server\server.js"
pause
