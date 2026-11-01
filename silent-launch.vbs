Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strDir = fso.GetParentFolderName(WScript.ScriptFullName)

WshShell.CurrentDirectory = strDir
' Run start-buddy.bat completely hidden (0)
WshShell.Run "cmd /c """ & strDir & "\start-buddy.bat""", 0, False

