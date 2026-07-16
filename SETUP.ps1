# Jafson Print ERP - Windows Setup Script
# Run this in PowerShell as Administrator in the project folder

Write-Host "Jafson Print ERP - Setting up..." -ForegroundColor Cyan

$appPath = "src\app"

# Rename _dashboard_ back to (dashboard)
if (Test-Path "$appPath\_dashboard_") {
    Rename-Item "$appPath\_dashboard_" "(dashboard)"
    Write-Host "✓ (dashboard) folder restored" -ForegroundColor Green
}

# Rename _auth_ back to (auth)  
if (Test-Path "$appPath\_auth_") {
    Rename-Item "$appPath\_auth_" "(auth)"
    Write-Host "✓ (auth) folder restored" -ForegroundColor Green
}

Write-Host ""
Write-Host "Setup complete! Now run: npm install && npm run dev" -ForegroundColor Green
