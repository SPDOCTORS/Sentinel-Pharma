$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$serverPath = Join-Path $root "SentinelPharma-main\server"
$npm = "C:\Program Files\nodejs\npm.cmd"
$logDir = Join-Path $root "SentinelPharma-main\run-logs"
$logPath = Join-Path $logDir "server.launch.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (-not (Test-Path $serverPath)) {
    throw "Server directory not found: $serverPath"
}

if (-not (Test-Path $npm)) {
    $npm = "npm"
}

Set-Location $serverPath
& $npm start *>> $logPath
