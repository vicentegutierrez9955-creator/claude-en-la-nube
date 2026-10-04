; Instalador de Windows del Punto de Venta
; Se compila con build.sh (usa NSIS). Incluye Node.js, así que no hay que instalar nada más.

Unicode true
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"

!ifndef VERSION
  !define VERSION "1.2.0"
!endif
!define APPNAME "Punto de Venta"
!define REGKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\PuntoDeVenta"

Name "${APPNAME}"
OutFile "..\dist\PuntoDeVenta-Instalador-${VERSION}.exe"
InstallDir "$PROGRAMFILES64\PuntoDeVenta"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
BrandingText "${APPNAME} ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1034 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=1034 "FileDescription" "Instalador de ${APPNAME}"
VIAddVersionKey /LANG=1034 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1034 "LegalCopyright" "Uso personal"

!define MUI_ICON "stage\PuntoDeVenta.ico"
!define MUI_UNICON "stage\PuntoDeVenta.ico"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Instalación de ${APPNAME}"
!define MUI_WELCOMEPAGE_TEXT "Este asistente instalará ${APPNAME} en su computadora.$\r$\n$\r$\nIncluye todo lo necesario para funcionar: no necesita instalar otros programas ni tener internet.$\r$\n$\r$\nPuede usarse en una sola computadora o en varias conectadas a la misma red Wi-Fi compartiendo el inventario."
!define MUI_FINISHPAGE_RUN
!define MUI_FINISHPAGE_RUN_TEXT "Abrir ${APPNAME} ahora"
!define MUI_FINISHPAGE_RUN_FUNCTION AbrirPrograma

Var Modo           ; "servidor" o "caja"
Var Servidor       ; dirección de la computadora principal
Var hRadioServidor
Var hRadioCaja
Var hServidor

!insertmacro MUI_PAGE_WELCOME
Page custom PaginaModo PaginaModoSalir
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Spanish"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Este programa requiere Windows de 64 bits."
    Abort
  ${EndIf}
  SetRegView 64
  StrCpy $Modo "servidor"
  StrCpy $Servidor ""
  ; si ya estaba instalado como caja, recordar la dirección
  ${If} ${FileExists} "$INSTDIR\servidor.txt"
    StrCpy $Modo "caja"
    FileOpen $0 "$INSTDIR\servidor.txt" r
    FileRead $0 $Servidor
    FileClose $0
  ${EndIf}
FunctionEnd

Function PaginaModo
  !insertmacro MUI_HEADER_TEXT "Tipo de instalación" "¿Cómo se usará esta computadora?"
  nsDialogs::Create 1018
  Pop $0
  ${NSD_CreateRadioButton} 0 0 100% 12u "Computadora PRINCIPAL (servidor): aquí se guarda toda la información"
  Pop $hRadioServidor
  ${NSD_CreateLabel} 12u 13u 95% 20u "Elija esta opción si es la única computadora, o si es la computadora que queda siempre encendida en el negocio y a la que se conectan las demás cajas."
  Pop $0
  ${NSD_CreateRadioButton} 0 40u 100% 12u "CAJA conectada a la computadora principal por la red Wi-Fi"
  Pop $hRadioCaja
  ${NSD_CreateLabel} 12u 53u 95% 20u "Esta computadora usará el inventario, clientes y ventas de la computadora principal. Escriba su dirección (la ve en la principal: Configuración → Red y cajas):"
  Pop $0
  ${NSD_CreateText} 12u 76u 60% 13u "$Servidor"
  Pop $hServidor
  ${NSD_CreateLabel} 12u 92u 95% 12u "Ejemplo: 192.168.1.10"
  Pop $0
  ${NSD_OnClick} $hRadioServidor ActualizarModo
  ${NSD_OnClick} $hRadioCaja ActualizarModo
  ${If} $Modo == "caja"
    ${NSD_Check} $hRadioCaja
  ${Else}
    ${NSD_Check} $hRadioServidor
  ${EndIf}
  Call ActualizarModo
  nsDialogs::Show
FunctionEnd

Function ActualizarModo
  ${NSD_GetState} $hRadioCaja $0
  ${If} $0 == ${BST_CHECKED}
    EnableWindow $hServidor 1
  ${Else}
    EnableWindow $hServidor 0
  ${EndIf}
FunctionEnd

Function PaginaModoSalir
  ${NSD_GetState} $hRadioCaja $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $Modo "caja"
    ${NSD_GetText} $hServidor $Servidor
    ${If} $Servidor == ""
      MessageBox MB_ICONEXCLAMATION "Escriba la dirección de la computadora principal (por ejemplo 192.168.1.10)."
      Abort
    ${EndIf}
  ${Else}
    StrCpy $Modo "servidor"
  ${EndIf}
FunctionEnd

; Cierra el servidor (node.exe de esta instalación) para poder reemplazar sus archivos.
; Se usa PowerShell de 64 bits + CIM: desde 32 bits, Get-Process no ve la ruta de un proceso de 64 bits.
!macro DETENER_SERVIDOR
  ${DisableX64FSRedirection}
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $$_.Name -eq 'node.exe' -and $$_.ExecutablePath -like '$INSTDIR\*' } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
  Pop $0
  ${EnableX64FSRedirection}
  ; El lector de bases de eleventa (Firebird) que corre desde la carpeta de datos
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $$_.Name -eq 'fbserver.exe' -and $$_.ExecutablePath -like '*\PuntoDeVenta\*' } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
  Pop $0
  ; Respaldo: el servidor abierto con ventana (ServidorConVentana.cmd)
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /F /FI "IMAGENAME eq node.exe" /FI "WINDOWTITLE eq Punto de Venta - Servidor"`
  Pop $0
  Sleep 1500
!macroend

Function DetenerServidor
  !insertmacro DETENER_SERVIDOR
  ; Comprobar que node.exe ya se puede reemplazar
  StrCpy $R0 0
  ${If} ${FileExists} "$INSTDIR\node\node.exe"
    revisar:
    ClearErrors
    FileOpen $1 "$INSTDIR\node\node.exe" a
    ${IfNot} ${Errors}
      FileClose $1
    ${EndIf}
    ${If} ${Errors}
      IntOp $R0 $R0 + 1
      ${If} $R0 < 4
        !insertmacro DETENER_SERVIDOR
        Goto revisar
      ${EndIf}
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "El programa Punto de Venta sigue abierto y no se puede actualizar.$\r$\n$\r$\n1. Cierre la ventana de Punto de Venta.$\r$\n2. Abra el Administrador de tareas (Ctrl + Shift + Esc).$\r$\n3. Finalice la tarea $\"Node.js JavaScript Runtime$\".$\r$\n$\r$\nLuego presione Reintentar." IDRETRY revisar
      Abort "Instalación cancelada: el programa sigue abierto."
    ${EndIf}
  ${EndIf}
FunctionEnd

Section "Instalar"
  SetRegView 64
  SetShellVarContext all
  Call DetenerServidor

  SetOutPath "$INSTDIR"
  File /r "stage\*.*"

  ; Carpeta de datos compartida (no se borra al desinstalar)
  CreateDirectory "$APPDATA\PuntoDeVenta\datos"
  nsExec::Exec 'icacls "$APPDATA\PuntoDeVenta" /grant *S-1-5-32-545:(OI)(CI)M /T /Q'
  Pop $0

  ${If} $Modo == "caja"
    ; Normalizar la dirección: http://IP:8080
    StrCpy $1 $Servidor 7
    ${If} $1 != "http://"
      StrCpy $Servidor "http://$Servidor"
    ${EndIf}
    ; si no trae puerto, agregar :8080
    Push $Servidor
    Call ContarDosPuntos
    Pop $2
    ${If} $2 < 2
      StrCpy $Servidor "$Servidor:8080"
    ${EndIf}
    FileOpen $0 "$INSTDIR\servidor.txt" w
    FileWrite $0 "$Servidor"
    FileClose $0
    Delete "$SMSTARTUP\Servidor Punto de Venta.lnk"
  ${Else}
    Delete "$INSTDIR\servidor.txt"
    ; Permitir que las otras cajas de la red local se conecten
    nsExec::Exec 'netsh advfirewall firewall delete rule name="Punto de Venta"'
    Pop $0
    nsExec::Exec 'netsh advfirewall firewall add rule name="Punto de Venta" dir=in action=allow program="$INSTDIR\node\node.exe" enable=yes profile=any remoteip=localsubnet'
    Pop $0
    ; Encender el servidor al iniciar Windows
    CreateShortcut "$SMSTARTUP\Servidor Punto de Venta.lnk" "$SYSDIR\wscript.exe" '"$INSTDIR\IniciarServidor.vbs"' "$INSTDIR\PuntoDeVenta.ico"
  ${EndIf}

  ; Accesos directos
  CreateShortcut "$DESKTOP\Punto de Venta.lnk" "$SYSDIR\wscript.exe" '"$INSTDIR\PuntoDeVenta.vbs"' "$INSTDIR\PuntoDeVenta.ico"
  CreateDirectory "$SMPROGRAMS\Punto de Venta"
  CreateShortcut "$SMPROGRAMS\Punto de Venta\Punto de Venta.lnk" "$SYSDIR\wscript.exe" '"$INSTDIR\PuntoDeVenta.vbs"' "$INSTDIR\PuntoDeVenta.ico"
  ${If} $Modo == "servidor"
    CreateShortcut "$SMPROGRAMS\Punto de Venta\Servidor (ver direcciones de red).lnk" "$INSTDIR\ServidorConVentana.cmd" "" "$INSTDIR\PuntoDeVenta.ico"
    CreateShortcut "$SMPROGRAMS\Punto de Venta\Carpeta de datos y respaldos.lnk" "$APPDATA\PuntoDeVenta\datos"
    CreateShortcut "$SMPROGRAMS\Punto de Venta\Restablecer contraseña de administrador.lnk" "$INSTDIR\RestablecerAdmin.cmd" "" "$INSTDIR\PuntoDeVenta.ico"
  ${EndIf}
  CreateShortcut "$SMPROGRAMS\Punto de Venta\Desinstalar.lnk" "$INSTDIR\Desinstalar.exe"

  ; Registro para "Agregar o quitar programas"
  WriteUninstaller "$INSTDIR\Desinstalar.exe"
  WriteRegStr HKLM "${REGKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKLM "${REGKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${REGKEY}" "Publisher" "${APPNAME}"
  WriteRegStr HKLM "${REGKEY}" "DisplayIcon" "$INSTDIR\PuntoDeVenta.ico"
  WriteRegStr HKLM "${REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${REGKEY}" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
  WriteRegDWORD HKLM "${REGKEY}" "NoModify" 1
  WriteRegDWORD HKLM "${REGKEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKLM "${REGKEY}" "EstimatedSize" $0

  ${If} $Modo == "servidor"
    Exec '"$SYSDIR\wscript.exe" "$INSTDIR\IniciarServidor.vbs"'
  ${EndIf}
SectionEnd

; Cuenta los ":" de una cadena (para saber si la dirección trae puerto)
Function ContarDosPuntos
  Exch $0
  Push $1
  Push $2
  Push $3
  StrCpy $1 0
  StrCpy $2 0
  loop:
    StrCpy $3 $0 1 $1
    StrCmp $3 "" fin
    StrCmp $3 ":" 0 +2
      IntOp $2 $2 + 1
    IntOp $1 $1 + 1
    Goto loop
  fin:
  StrCpy $0 $2
  Pop $3
  Pop $2
  Pop $1
  Exch $0
FunctionEnd

Function AbrirPrograma
  Exec '"$SYSDIR\wscript.exe" "$INSTDIR\PuntoDeVenta.vbs"'
FunctionEnd

Section "Uninstall"
  SetRegView 64
  SetShellVarContext all
  !insertmacro DETENER_SERVIDOR
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Punto de Venta"'
  Pop $0
  Delete "$DESKTOP\Punto de Venta.lnk"
  Delete "$SMSTARTUP\Servidor Punto de Venta.lnk"
  RMDir /r "$SMPROGRAMS\Punto de Venta"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKLM "${REGKEY}"
  MessageBox MB_ICONINFORMATION "El programa se desinstaló.$\r$\n$\r$\nSus datos (productos, ventas, clientes y respaldos) se conservaron en:$\r$\n$APPDATA\PuntoDeVenta\datos"
SectionEnd
