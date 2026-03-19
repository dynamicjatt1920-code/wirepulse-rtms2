# WirePulse RTMS - One-Click Host Script
# Run: powershell -ExecutionPolicy Bypass -File start.ps1

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  WirePulse RTMS - Starting..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $dir

if (-not (Test-Path "node_modules")) {
    Write-Host "[1/4] Installing dependencies..." -ForegroundColor Yellow
    npm install --omit=dev | Out-Null
} else {
    Write-Host "[1/4] Dependencies OK" -ForegroundColor Green
}

if (-not (Test-Path "db\ems_rtms.db")) {
    Write-Host "[2/4] Creating database..." -ForegroundColor Yellow
    node db/seed.js
} else {
    Write-Host "[2/4] Database OK" -ForegroundColor Green
}

$ltPath = Join-Path $dir "node_modules\.bin\lt.cmd"
if (-not (Test-Path $ltPath)) {
    Write-Host "[3/4] Installing tunnel tool..." -ForegroundColor Yellow
    npm install localtunnel | Out-Null
}
Write-Host "[3/4] Tunnel ready" -ForegroundColor Green

Write-Host "[4/4] Starting server..." -ForegroundColor Yellow
$serverJob = Start-Process -FilePath "node" -ArgumentList "server.js" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 3

try {
    $health = Invoke-RestMethod -Uri "http://localhost:4000/api/health" -TimeoutSec 5
    Write-Host ""
    Write-Host "  Server running on http://localhost:4000" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Server failed to start!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  Creating public link..." -ForegroundColor Yellow
Write-Host ""

$tunnelLog = Join-Path $dir "tunnel.log"
$tunnelJob = Start-Process -FilePath "cmd" -ArgumentList "/c npx localtunnel --port 4000" -PassThru -RedirectStandardOutput $tunnelLog -WindowStyle Hidden
Start-Sleep -Seconds 8

$tunnelUrl = ""
if (Test-Path $tunnelLog) {
    $logContent = Get-Content $tunnelLog -Raw
    if ($logContent -match "(https://[a-z0-9-]+\.loca\.lt)") {
        $tunnelUrl = $Matches[1]
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
if ($tunnelUrl) {
    Write-Host "  PUBLIC LINK (share this):" -ForegroundColor White
    Write-Host "  $tunnelUrl" -ForegroundColor Green
    Write-Host ""
}
Write-Host "  LOCAL LINK:" -ForegroundColor White
Write-Host "  http://localhost:4000" -ForegroundColor Green
Write-Host ""
Write-Host "  Login: admin / admin123" -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Press ENTER to stop the server..." -ForegroundColor Gray
Read-Host

Stop-Process -Id $serverJob.Id -Force -ErrorAction SilentlyContinue
Stop-Process -Id $tunnelJob.Id -Force -ErrorAction SilentlyContinue
Remove-Item $tunnelLog -Force -ErrorAction SilentlyContinue
Write-Host "  Stopped." -ForegroundColor Yellow
