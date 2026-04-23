@echo off
chcp 65001 >nul
set "HERE=%~dp0"
cd /d "%HERE%"

set "SPORT=8765"
set "URL=http://127.0.0.1:%SPORT%/trade.html"

if exist "%HERE%serve_me2.exe" goto :SERVE

where py >nul 2>&1
if %errorlevel%==0 goto :SERVE
where pythonw >nul 2>&1
if %errorlevel%==0 goto :SERVE
where python >nul 2>&1
if %errorlevel%==0 goto :SERVE

start "" "%HERE%trade.html"
exit /b 0

:SERVE
wscript //nologo "%~dp0serve-http-hidden.vbs" %SPORT%

set "TRY=0"
:WAIT
powershell -NoProfile -Command "try{ $c=New-Object System.Net.Sockets.TcpClient; $c.ReceiveTimeout=1000; $c.Connect('127.0.0.1',%SPORT%); $c.Close(); exit 0 } catch { exit 1 }" 2>nul
if %errorlevel%==0 (
  start "" "%URL%"
  exit /b 0
)
set /a TRY+=1
if %TRY% GTR 25 (
  start "" "%URL%"
  exit /b 0
)
timeout /t 1 /nobreak >nul
goto :WAIT
