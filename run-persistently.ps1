# SentinelPharma Persistent Runner
# ===============================
# Runs the startup script and maintains the PowerShell process to keep the background services alive.

$scriptPath = Join-Path $PSScriptRoot "SentinelPharma-main\start.ps1"

Write-Host "Invoking startup script at $scriptPath..."
& $scriptPath

Write-Host "Services started. Keeping process alive..."
while ($true) {
    Start-Sleep -Seconds 10
}
