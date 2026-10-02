Option Explicit

' Launch the sampler for the exact daemon PID supplied by world.process.
If WScript.Arguments.Count <> 1 Then WScript.Quit 1
Dim processId, numericArgument, fileSystem, scriptPath, command
processId = WScript.Arguments(0)
Set numericArgument = New RegExp
numericArgument.Pattern = "^[0-9]+$"
If Not numericArgument.Test(processId) Then WScript.Quit 1

Set fileSystem = CreateObject("Scripting.FileSystemObject")
scriptPath = fileSystem.BuildPath(fileSystem.GetParentFolderName(WScript.ScriptFullName), "mem_writer.ps1")
command = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File """ & scriptPath & """ -DaemonProcessId " & processId
CreateObject("WScript.Shell").Run command, 0, False
