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

Write-Host "Installing Google Antigravity..."
winget install --id Google.Antigravity --exact --accept-package-agreements --accept-source-agreements
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Antigravity installation did not complete. Opening the official download page."
    Start-Process "https://antigravity.google/download"
}

Write-Host "Installing Cursor..."
winget install --id Anysphere.Cursor --exact --accept-package-agreements --accept-source-agreements
if ($LASTEXITCODE -ne 0) {
    Write-Warning "Cursor installation did not complete. Use https://cursor.com/download"
}

Write-Host "Installing the ChatGPT Windows app from Microsoft Store (Codex is available inside the app)..."
winget install --id 9PLM9XGG6VKS --source msstore --accept-package-agreements --accept-source-agreements
if ($LASTEXITCODE -ne 0) {
    Write-Warning "ChatGPT/Codex app installation did not complete. Use https://chatgpt.com/codex"
}

Write-Host "Install attempts finished. Sign in to each provider yourself."
Write-Host "Availability, plans, usage limits, and account requirements still apply."
