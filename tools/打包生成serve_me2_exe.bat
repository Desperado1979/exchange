@echo off
chcp 65001 >nul
setlocal
rem Builds web\serve_me2.exe — ship this next to index.html so customers need NO Python.
rem Requires Python + pip only on YOUR machine once.

set "ROOT=%~dp0.."
cd /d "%ROOT%"

where py >nul 2>&1 && set "PY=py" && goto :HAVE_PY
where python >nul 2>&1 && set "PY=python" && goto :HAVE_PY

echo ERROR: Install Python first, then run this script again.
exit /b 1

:HAVE_PY
"%PY%" -m pip install --quiet pyinstaller
if errorlevel 1 (
  echo ERROR: pip install pyinstaller failed.
  exit /b 1
)

rem Keep work/spec on same drive as WEB_ROOT (PyInstaller rejects cross-drive relpath).
set "WORK=%ROOT%\_pyinstaller_tmp"
if exist "%WORK%" rd /s /q "%WORK%" 2>nul

"%PY%" -m PyInstaller --onefile --noconsole --name serve_me2 --clean ^
  --distpath "%ROOT%" --workpath "%WORK%" --specpath "%WORK%" ^
  "%ROOT%\serve_me2.py"

if errorlevel 1 (
  echo ERROR: PyInstaller failed.
  exit /b 1
)

rd /s /q "%WORK%" 2>nul
echo OK: "%ROOT%\serve_me2.exe"
echo Give customers the whole web folder copy — include serve_me2.exe.
