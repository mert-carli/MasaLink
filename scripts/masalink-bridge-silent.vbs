' =====================================================================
' MasaLink Print Bridge - Windows Sessiz Arka Plan Baslatici (VBScript)
' Bu script konsol penceresi acilmadan daemon'i arka planda calistirir.
' =====================================================================

Set WshShell = CreateObject("WScript.Shell")
strCurrentPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
strBatPath = """" & strCurrentPath & "\start-masalink-bridge.bat"""

' 0 = Pencereyi tamamen gizle (Sessiz mod), False = Senkron bekleme yapma
WshShell.Run strBatPath, 0, False
