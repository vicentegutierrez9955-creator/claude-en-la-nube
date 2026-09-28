' Enciende el servidor del Punto de Venta sin mostrar ventanas.
' Se ejecuta automáticamente al iniciar Windows en la computadora principal.
Option Explicit
Dim sh, fso, dir
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Environment("PROCESS")("PV_DATA_DIR") = sh.ExpandEnvironmentStrings("%ProgramData%") & "\PuntoDeVenta\datos"
sh.Run """" & dir & "\node\node.exe"" """ & dir & "\app\server\server.js""", 0, False
