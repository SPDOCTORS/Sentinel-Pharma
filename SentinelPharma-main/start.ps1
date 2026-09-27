# SentinelPharma Startup Script
# ============================
# Starts the AI engine and Node.js backend, then verifies both services.
# The backend serves the built frontend from client/dist.

$ErrorActionPreference = "Stop"

$projectRoot = $PSScriptRoot
$aiEnginePath = Join-Path $projectRoot "ai_engine"
$serverPath = Join-Path $projectRoot "server"
$clientDistPath = Join-Path $projectRoot "client\dist"
$logDir = Join-Path $projectRoot "run-logs"
$projectVenvPython = Join-Path (Split-Path $projectRoot -Parent) ".venv\Scripts\python.exe"
$pythonExe = if (Test-Path $projectVenvPython) { $projectVenvPython } else { "python" }
$npmExe = "C:\Program Files\nodejs\npm.cmd"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Assert-PathExists {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (-not (Test-Path $Path)) {
        throw "$Label not found: $Path"
    }
}

function Stop-PortListener {
    param([Parameter(Mandatory = $true)][int]$Port)

    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        ForEach-Object {
            Write-Host "Stopping process $($_.OwningProcess) on port $Port" -ForegroundColor DarkYellow
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
        }
}

function Wait-ForHttp {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$Name,
        [int]$Attempts = 24,
        [int]$DelaySeconds = 2
    )

    for ($i = 1; $i -le $Attempts; $i++) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 4
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                Write-Host "[OK] $Name responded at $Url" -ForegroundColor Green
                return $true
            }
        } catch {
            Start-Sleep -Seconds $DelaySeconds
        }
    }

    Write-Host "[FAIL] $Name did not respond at $Url" -ForegroundColor Red
    return $false
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting SentinelPharma Application" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Assert-PathExists $aiEnginePath "AI engine directory"
Assert-PathExists $serverPath "Server directory"
Assert-PathExists (Join-Path $serverPath "node_modules") "Server dependencies"
Assert-PathExists (Join-Path $aiEnginePath "app\main.py") "AI engine entrypoint"
Assert-PathExists $clientDistPath "Built frontend"
Assert-PathExists $npmExe "npm executable"

Write-Host "Cleaning up existing app listeners..." -ForegroundColor Yellow
Stop-PortListener 3001
Stop-PortListener 8000
Start-Sleep -Seconds 2

$aiOut = Join-Path $logDir "ai.live.log"
$aiErr = Join-Path $logDir "ai.err.log"
$serverOut = Join-Path $logDir "server.live.log"
$serverErr = Join-Path $logDir "server.err.log"

Write-Host "`n[1/2] Starting AI Engine on http://localhost:8000" -ForegroundColor Green
$aiProcess = Start-Process -FilePath $pythonExe `
    -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000") `
    -WorkingDirectory $aiEnginePath `
    -WindowStyle Hidden `
    -RedirectStandardOutput $aiOut `
    -RedirectStandardError $aiErr `
    -PassThru

if (-not (Wait-ForHttp "http://localhost:8000/health" "AI Engine")) {
    Write-Host "AI stderr tail:" -ForegroundColor Yellow
    Get-Content $aiErr -Tail 40 -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "[2/2] Starting Server on http://localhost:3001" -ForegroundColor Green
$serverProcess = Start-Process -FilePath $npmExe `
    -ArgumentList @("start") `
    -WorkingDirectory $serverPath `
    -WindowStyle Hidden `
    -RedirectStandardOutput $serverOut `
    -RedirectStandardError $serverErr `
    -PassThru

if (-not (Wait-ForHttp "http://localhost:3001" "Server")) {
    Write-Host "Server stderr tail:" -ForegroundColor Yellow
    Get-Content $serverErr -Tail 60 -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "SentinelPharma is running" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  App:       http://localhost:3001" -ForegroundColor White
Write-Host "  AI Engine: http://localhost:8000" -ForegroundColor White
Write-Host "  Logs:      $logDir" -ForegroundColor White
Write-Host "  AI PID:    $($aiProcess.Id)" -ForegroundColor White
Write-Host "  API PID:   $($serverProcess.Id)" -ForegroundColor White
Write-Host "========================================`n" -ForegroundColor Cyan
