param(
  [string]$WhatsAppPath = "..\agenthub-whatsapp-service"
)

$ErrorActionPreference = "Stop"
$MainPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$ResolvedWhatsAppPath = [System.IO.Path]::GetFullPath((Join-Path $MainPath $WhatsAppPath))

Write-Host "" 
Write-Host "=== AgentHub AI - Local Stack ===" -ForegroundColor Cyan
Write-Host "Main app:      $MainPath"
Write-Host "WhatsApp app:  $ResolvedWhatsAppPath"
Write-Host "" 

if (-not (Test-Path (Join-Path $MainPath "package.json"))) {
  throw "AgentHub main package.json was not found at $MainPath"
}
if (-not (Test-Path (Join-Path $ResolvedWhatsAppPath "package.json"))) {
  throw "WhatsApp service package.json was not found at $ResolvedWhatsAppPath. Pass -WhatsAppPath with the correct folder."
}

# Local-only routing. Supabase remains the cloud database/auth/storage.
$env:NEXT_PUBLIC_APP_URL = "http://localhost:3000"
$env:WHATSAPP_QR_SERVICE_URL = "http://localhost:8080"
$env:WHATSAPP_AGENT_URL = "http://localhost:8080"
$env:OLLAMA_URL = "http://localhost:11434"

# The WhatsApp follow-up worker calls these values from its own environment.
$env:AGENTHUB_URL = "http://localhost:3000"

Write-Host "Starting WhatsApp service on http://localhost:8080 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command", "Set-Location -LiteralPath '$ResolvedWhatsAppPath'; `$env:AGENTHUB_URL='http://localhost:3000'; `$env:WHATSAPP_PORT='8080'; npm start"
) | Out-Null

Start-Sleep -Seconds 2

Write-Host "Starting AgentHub Next.js on http://localhost:3000 ..." -ForegroundColor Green
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy", "Bypass",
  "-Command", "Set-Location -LiteralPath '$MainPath'; npm run dev"
) | Out-Null

Write-Host "" 
Write-Host "Local stack started." -ForegroundColor Cyan
Write-Host "  AgentHub:  http://localhost:3000"
Write-Host "  WhatsApp:  http://localhost:8080"
Write-Host "  Ollama:    http://localhost:11434"
Write-Host "" 
Write-Host "Keep the two opened PowerShell windows running while AgentHub is in use." -ForegroundColor Yellow
Write-Host "Press Ctrl+C in those windows to stop the services."
