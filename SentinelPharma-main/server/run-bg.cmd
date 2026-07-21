@echo off
setlocal
cd /d "%~dp0"
"C:\Program Files\nodejs\node.exe" src\index.js >> "%~dp0..\run-logs\server.live.log" 2>&1
