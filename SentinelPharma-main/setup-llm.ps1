# SentinelPharma LLM Setup Script
# =============================
# Quick configuration for Gemini API Key

Write-Host "`n╔════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   SentinelPharma LLM Configuration Setup      ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$envFile = "ai_engine\.env"

# Check if .env exists
if (-not (Test-Path $envFile)) {
    Write-Host "✗ .env file not found in ai_engine/" -ForegroundColor Red
    Write-Host "  Please run from SentinelPharma root directory" -ForegroundColor Yellow
    exit 1
}

Write-Host "Choose LLM Mode:" -ForegroundColor Yellow
Write-Host "  1. Cloud Mode (Google Gemini) - Recommended" -ForegroundColor White
Write-Host "  2. Local Mode (Llama) - HIPAA Compliant" -ForegroundColor White
Write-Host "  3. Keep Deterministic Mode (No LLM)" -ForegroundColor White
Write-Host "  4. View Current Configuration" -ForegroundColor White

$choice = Read-Host "`nEnter choice (1-4)"

switch ($choice) {
    "1" {
        Write-Host "`n📝 Cloud Mode Setup (Google Gemini)" -ForegroundColor Cyan
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
        
        Write-Host "`nTo get your Gemini API key:" -ForegroundColor Yellow
        Write-Host "  1. Visit: https://aistudio.google.com/app/apikey" -ForegroundColor White
        Write-Host "  2. Sign in or create account" -ForegroundColor White
        Write-Host "  3. Click 'Create API key'" -ForegroundColor White
        Write-Host "  4. Copy the key" -ForegroundColor White
        
        $apiKey = Read-Host "`nEnter your Gemini API Key (or press Enter to skip)"
        
        if ($apiKey) {
            # Read current .env
            $content = Get-Content $envFile -Raw
            
            # Update or add API key
            if ($content -match "# GEMINI_API_KEY=") {
                $content = $content -replace "# GEMINI_API_KEY=.*", "GEMINI_API_KEY=$apiKey"
            } elseif ($content -match "GEMINI_API_KEY=") {
                $content = $content -replace "GEMINI_API_KEY=.*", "GEMINI_API_KEY=$apiKey"
            } else {
                $content = $content -replace "(GEMINI_MODEL=.*)", "GEMINI_API_KEY=$apiKey`r`n`$1"
            }

            if ($content -match "GEMINI_ENABLED=") {
                $content = $content -replace "GEMINI_ENABLED=.*", "GEMINI_ENABLED=true"
            } else {
                $content += "`r`nGEMINI_ENABLED=true"
            }

            if ($content -match "DEFAULT_LLM_PROVIDER=") {
                $content = $content -replace "DEFAULT_LLM_PROVIDER=.*", "DEFAULT_LLM_PROVIDER=gemini"
            } else {
                $content += "`r`nDEFAULT_LLM_PROVIDER=gemini"
            }
            
            # Save
            $content | Set-Content $envFile -NoNewline
            
            Write-Host "`n✓ API Key configured successfully!" -ForegroundColor Green
            Write-Host "  Cloud Mode (Gemini) is now enabled" -ForegroundColor Green
            
            Write-Host "`n⚠️  Important: Restart the AI Engine for changes to take effect" -ForegroundColor Yellow
            Write-Host "   Stop current instance (Ctrl+C) and run:" -ForegroundColor White
            Write-Host "   cd ai_engine" -ForegroundColor Cyan
            Write-Host "   python -m uvicorn app.main:app --reload --port 8000" -ForegroundColor Cyan
        } else {
            Write-Host "`nSetup cancelled." -ForegroundColor Yellow
        }
    }
    
    "2" {
        Write-Host "`n🖥️  Local Mode Setup (Llama)" -ForegroundColor Cyan
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
        
        Write-Host "`nStep 1: Install Dependencies" -ForegroundColor Yellow
        Write-Host "  Run: pip install llama-cpp-python" -ForegroundColor White
        
        Write-Host "`nStep 2: Download Model" -ForegroundColor Yellow
        Write-Host "  Recommended: Llama 2 7B Chat" -ForegroundColor White
        Write-Host "  URL: https://huggingface.co/TheBloke/Llama-2-7B-Chat-GGUF" -ForegroundColor Cyan
        Write-Host "  File: llama-2-7b-chat.Q4_K_M.gguf (~4 GB)" -ForegroundColor White
        
        $installDeps = Read-Host "`nInstall llama-cpp-python now? (y/n)"
        if ($installDeps -eq "y") {
            Write-Host "`nInstalling llama-cpp-python..." -ForegroundColor Yellow
            pip install llama-cpp-python
        }
        
        $modelPath = Read-Host "`nEnter path to your .gguf model file (or press Enter to skip)"
        
        if ($modelPath) {
            if (Test-Path $modelPath) {
                # Update .env
                $content = Get-Content $envFile -Raw
                $modelPath = $modelPath -replace '\\', '/'
                $modelName = [System.IO.Path]::GetFileNameWithoutExtension($modelPath)
                
                $content = $content -replace "LOCAL_MODEL_PATH=.*", "LOCAL_MODEL_PATH=$modelPath"
                $content = $content -replace "LOCAL_MODEL_NAME=.*", "LOCAL_MODEL_NAME=$modelName"
                
                $content | Set-Content $envFile -NoNewline
                
                Write-Host "`n✓ Local model configured successfully!" -ForegroundColor Green
                Write-Host "  Model: $modelName" -ForegroundColor Green
                Write-Host "  Path: $modelPath" -ForegroundColor Green
                
                Write-Host "`n⚠️  Restart the AI Engine for changes to take effect" -ForegroundColor Yellow
            } else {
                Write-Host "`n✗ Model file not found: $modelPath" -ForegroundColor Red
            }
        } else {
            Write-Host "`n📖 See LLM_SETUP_GUIDE.md for detailed instructions" -ForegroundColor Cyan
        }
    }
    
    "3" {
        Write-Host "`n✓ Keeping Deterministic Mode" -ForegroundColor Green
        Write-Host "  Agents will use pre-programmed responses" -ForegroundColor White
        Write-Host "  Perfect for testing and development!" -ForegroundColor Cyan
    }
    
    "4" {
        Write-Host "`n📊 Current Configuration" -ForegroundColor Cyan
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
        
        $content = Get-Content $envFile -Raw
        
        # Check Gemini
        if ($content -match "GEMINI_API_KEY=.+") {
            Write-Host "`n✓ Cloud Mode (Gemini): CONFIGURED" -ForegroundColor Green
            $key = ($content | Select-String "GEMINI_API_KEY=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value })
            Write-Host "  API Key: $($key.Substring(0, 7))...***" -ForegroundColor White
        } else {
            Write-Host "`n✗ Cloud Mode (Gemini): NOT CONFIGURED" -ForegroundColor Yellow
        }
        
        # Check Local
        if ($content -match "LOCAL_MODEL_PATH=(.+)" -and $content -notmatch "LOCAL_MODEL_PATH=/models/llama") {
            $modelPath = ($content | Select-String "LOCAL_MODEL_PATH=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value.Trim() })
            if (Test-Path $modelPath) {
                Write-Host "✓ Local Mode (Llama): CONFIGURED" -ForegroundColor Green
                Write-Host "  Model: $modelPath" -ForegroundColor White
            } else {
                Write-Host "⚠️  Local Mode (Llama): Path set but file not found" -ForegroundColor Yellow
                Write-Host "  Path: $modelPath" -ForegroundColor White
            }
        } else {
            Write-Host "✗ Local Mode (Llama): NOT CONFIGURED" -ForegroundColor Yellow
        }
        
        Write-Host "`nCurrent Mode: " -NoNewline
        if ($content -match "GEMINI_API_KEY=.+") {
            Write-Host "Cloud (Gemini)" -ForegroundColor Green
        } elseif ($content -match "LOCAL_MODEL_PATH=" -and (Test-Path ($content | Select-String "LOCAL_MODEL_PATH=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value.Trim() }))) {
            Write-Host "Local (Llama)" -ForegroundColor Green
        } else {
            Write-Host "Deterministic (No LLM)" -ForegroundColor Yellow
        }
    }
    
    default {
        Write-Host "`n✗ Invalid choice" -ForegroundColor Red
    }
}

Write-Host "`n╔════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  For detailed setup: See LLM_SETUP_GUIDE.md   ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════╝`n" -ForegroundColor Cyan
