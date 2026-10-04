@echo off
title Punto de Venta - Restablecer contrasena de administrador
echo.
echo  Esto deja al usuario "admin" SIN contrasena para que pueda volver a entrar.
echo  Los productos, ventas y clientes NO se borran.
echo.
pause
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.ExecutablePath -like '%~dp0*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
timeout /t 2 /nobreak >nul
set "PV_DATA_DIR=%ProgramData%\PuntoDeVenta\datos"
"%~dp0node\node.exe" "%~dp0app\server\server.js" --restablecer-admin
start "" wscript.exe "%~dp0IniciarServidor.vbs"
echo.
echo  Listo. Abra Punto de Venta y entre con el usuario admin y la contrasena vacia.
pause
