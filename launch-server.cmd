@echo off
setlocal
set "ROOT=%~dp0"
set "APP=%ROOT%SentinelPharma-main"
set "SERVER=%APP%\server"
set "LOG=%APP%\run-logs\server.launch.log"

start "" /b cmd.exe /c "cd /d ""%SERVER%"" && ""C:\Program Files\nodejs\npm.cmd"" start > ""%LOG%"" 2>&1"
