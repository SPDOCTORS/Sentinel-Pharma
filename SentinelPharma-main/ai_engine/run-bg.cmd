@echo off
setlocal
cd /d "%~dp0"
"c:\Users\Senthil Kumar\Downloads\SentinelPharma-main\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8002 >> "%~dp0..\run-logs\ai.live.log" 2>&1
