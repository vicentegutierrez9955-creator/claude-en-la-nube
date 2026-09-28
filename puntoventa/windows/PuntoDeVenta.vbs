' Abre el Punto de Venta.
' - En la computadora principal: enciende el servidor (si no está encendido) y abre la caja.
' - En una caja conectada: abre la dirección del servidor guardada en servidor.txt.
Option Explicit
Dim sh, fso, dir, url, datos, perfil, f, texto
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
url = "http://localhost:8080"

If fso.FileExists(dir & "\servidor.txt") Then
  Set f = fso.OpenTextFile(dir & "\servidor.txt", 1)
  texto = Trim(f.ReadLine)
  f.Close
  If Len(texto) > 0 Then url = texto
Else
  ' Encender el servidor sin ventana (si ya está encendido, el nuevo se cierra solo)
  datos = sh.ExpandEnvironmentStrings("%ProgramData%") & "\PuntoDeVenta\datos"
  sh.Environment("PROCESS")("PV_DATA_DIR") = datos
  sh.Run """" & dir & "\node\node.exe"" """ & dir & "\app\server\server.js""", 0, False
  WScript.Sleep 1500
End If

' Abrir como aplicación (sin barra de direcciones) e imprimir directo a la impresora predeterminada
perfil = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\PuntoDeVenta\navegador"
On Error Resume Next
sh.Run "msedge --app=" & url & " --kiosk-printing --no-first-run --user-data-dir=""" & perfil & """", 1, False
If Err.Number <> 0 Then
  Err.Clear
  sh.Run "chrome --app=" & url & " --kiosk-printing --no-first-run --user-data-dir=""" & perfil & """", 1, False
  If Err.Number <> 0 Then sh.Run url, 1, False
End If
