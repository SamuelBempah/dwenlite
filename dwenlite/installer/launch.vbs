' Starts the helper and the icon near the clock without any window flashing on screen.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
ps = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """
sh.Run ps & dir & "\run.ps1""", 0, False
sh.Run ps & dir & "\tray.ps1""", 0, False
