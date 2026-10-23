$ErrorActionPreference = "Stop"

Write-Host "Optional AI developer tools installer for the Windows guest."
Write-Host "This script does not create accounts, store credentials, or grant paid subscriptions."

$winget = Get-Command winget.exe -ErrorAction SilentlyContinue
if ($null -eq $winget) {
    Write-Warning "winget is not available. Open the official pages below and install manually."
    Start-Process "https://cursor.com/download"
    Start-Process "https://chatgpt.com/codex"
    Start-Process "https://antigravity.google/download"
    exit 0
}

Write-Host "Installing Cursor (the installer may require confirmation)..."
winget install --id Anysphere.Cursor --exact --accept-package-agreements --accept-source-agreements
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Cursor installation did not complete. Use https://cursor.com/download"
}

Write-Host "Installing the ChatGPT Windows app from Microsoft Store (Codex is available inside the app)..."
winget install --id 9PLM9XGG6VKS --source msstore --accept-package-agreements --accept-source-agreements
if ($LASTEXITCODE -ne 0) {
    Write-Warning "ChatGPT/Codex app installation did not complete. Use https://chatgpt.com/codex"
}

Write-Host "Opening the official Google Antigravity download page."
Start-Process "https://antigravity.google/download"
Write-Host "Download the official Windows installer and complete setup manually."
Write-Host "Sign in to each provider yourself. Availability, plans, usage limits, and account requirements still apply."
