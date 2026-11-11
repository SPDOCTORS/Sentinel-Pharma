# SentinelPharma Staging Environment Setup
# ========================================
# Generates a cryptographically secure, plain-text .env.prod file for staging.
# This file is strictly Git-ignored.

$ErrorActionPreference = "Stop"

function Get-SecureHexToken([int]$byteCount = 32) {
    $bytes = [byte[]]::new($byteCount)
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return [System.BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}

$authSecret    = Get-SecureHexToken 32
$internalToken = Get-SecureHexToken 32
$redisPass     = Get-SecureHexToken 32
$mongoPass     = Get-SecureHexToken 32

$scriptDir = $PSScriptRoot
$targetEnvFile = Join-Path $scriptDir ".env.prod"

@"
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=$mongoPass
REDIS_PASSWORD=$redisPass
AUTH_TOKEN_SECRET=$authSecret
INTERNAL_SERVICE_TOKEN=$internalToken
CLIENT_URL=http://localhost
AI_ENGINE_URL=http://ai-engine:8000
GEMINI_API_KEY=
"@ | Set-Content -Path $targetEnvFile -Encoding ascii -NoNewline

Remove-Variable authSecret, internalToken, redisPass, mongoPass -ErrorAction SilentlyContinue

Write-Host "[OK] Staging environment configuration written to: $targetEnvFile" -ForegroundColor Green
Write-Host "     CLIENT_URL is set to: http://localhost" -ForegroundColor Gray
Write-Host "     AI_ENGINE_URL is set to: http://ai-engine:8000" -ForegroundColor Gray
