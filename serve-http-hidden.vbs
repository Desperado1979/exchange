' Start py/pythonw/python http.server with no console window. Parent folder = web root.
Option Explicit
Dim w, f, r, q, p, s, a
q = Chr(34)
p = 8765
If WScript.Arguments.Count >= 1 Then
  a = WScript.Arguments(0)
  If IsNumeric(a) Then p = CInt(a)
End If
Set w = CreateObject("WScript.Shell")
Set f = CreateObject("Scripting.FileSystemObject")
r = f.GetParentFolderName(WScript.ScriptFullName)
Dim ex, pth
pth = f.BuildPath(r, "serve_me2.exe")
If f.FileExists(pth) Then
  ' No Python on customer PC: use shipped executable
  w.Run q & pth & q & " " & p, 0, False
Else
  s = "cd /d " & q & r & q & " && ("
  s = s & "where py >nul 2>&1 && py " & q & f.BuildPath(r, "serve_me2.py") & q & " " & p & " "
  s = s & "|| where pythonw >nul 2>&1 && pythonw " & q & f.BuildPath(r, "serve_me2.py") & q & " " & p & " "
  s = s & "|| where python >nul 2>&1 && python " & q & f.BuildPath(r, "serve_me2.py") & q & " " & p & ")"
  w.Run "cmd /c " & q & s & q, 0, False
End If
' 0 = hidden window, False = do not wait
