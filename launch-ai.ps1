$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$aiPath = Join-Path $root "SentinelPharma-main\ai_engine"
$python = Join-Path $root ".venv\Scripts\python.exe"
$logDir = Join-Path $root "SentinelPharma-main\run-logs"
$logPath = Join-Path $logDir "ai.launch.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (-not (Test-Path $aiPath)) {
    throw "AI engine directory not found: $aiPath"
}

if (-not (Test-Path $python)) {
    $python = "python"
}

Set-Location $aiPath
& $python -m uvicorn app.main:app --host 0.0.0.0 --port 8002 *>> $logPath
