@echo off
setlocal
set "ROOT=%~dp0"
set "APP=%ROOT%SentinelPharma-main"
set "AI=%APP%\ai_engine"
set "PYTHON=%ROOT%.venv\Scripts\python.exe"
set "LOG=%APP%\run-logs\ai.launch.log"

start "" /b cmd.exe /c "cd /d ""%AI%"" && ""%PYTHON%"" -m uvicorn app.main:app --host 0.0.0.0 --port 8002 > ""%LOG%"" 2>&1"
